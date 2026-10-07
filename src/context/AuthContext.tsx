import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { Storage, setUnauthorizedHandler, authApi } from '../services';
import { closeCustomerSocket } from '../services/realtime.service';
import type { OtpChannel } from '../services/auth.service';
import { getErrorCode, getErrorMessage } from '../utils/apiError';
import { mmkvStorage } from '../lib/storage';
import { unregisterPushToken } from '../services/pushNotifications';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  avatarUrl?: string;
}

interface OtpSession {
  phone: string;
  email: string;
  mode: 'login' | 'signup' | 'reset';
  channel?: 'mobile' | 'whatsapp' | 'email';
  sessionId?: string;
}

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  otpSession: OtpSession | null;
  resendCooldown: number;
  otpAttemptsLeft: number;
  /** Signed in, but the signup profile (name) or the location step was never finished. */
  onboardingStep: 'profile' | 'location' | null;
  sendOtp: (
    identifier: { phone?: string; email?: string },
    mode: OtpSession['mode'],
    channel?: OtpSession['channel'],
  ) => Promise<{ success: boolean; message?: string; code?: string }>;
  resendOtp: () => Promise<{ success: boolean; message?: string }>;
  verifyOtp: (
    code: string,
  ) => Promise<{
    success: boolean;
    message?: string;
    code?: string;
    nextStep?: 'profile' | 'home';
  }>;
  completeSignupProfile: (fullName: string, email?: string) => Promise<void>;
  completeLocationStep: () => void;
  continueAsGuest: () => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  /** @deprecated OTP-only backend — screens hidden from navigation */
  loginWithPassword: (
    identifier: string,
    password: string,
    method: 'email' | 'mobile',
  ) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CHANNEL_MAP: Record<NonNullable<OtpSession['channel']>, OtpChannel> = {
  mobile: 'sms',
  whatsapp: 'whatsapp',
  email: 'email',
};

const errText = getErrorMessage;

export const MAX_OTP_ATTEMPTS = 5;
/** Persisted so a kill mid-signup resumes at the unfinished step instead of landing on Home. */
const ONBOARDING_STEP_KEY = 'onboardingStep';
const readOnboardingStep = (): 'profile' | 'location' | null => {
  const v = mmkvStorage.getItem(ONBOARDING_STEP_KEY);
  return v === 'profile' || v === 'location' ? v : null;
};
const errCode = getErrorCode;

function mapProfileUser(raw: Record<string, unknown>, fallback?: Partial<AppUser>): AppUser {
  const avatar =
    (typeof raw.avatarUrl === 'string' && raw.avatarUrl) ||
    (typeof raw.avatar === 'string' && raw.avatar) ||
    fallback?.avatarUrl ||
    undefined;
  return {
    id: String(raw._id || raw.id || fallback?.id || ''),
    name: String(raw.name || fallback?.name || ''),
    email: (raw.email as string) || fallback?.email,
    phoneNumber: raw.phoneNumber
      ? `+91 ${String(raw.phoneNumber).replace(/\D/g, '').slice(-10)}`
      : fallback?.phoneNumber,
    avatarUrl: avatar || undefined,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [otpSession, setOtpSession] = useState<OtpSession | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState(MAX_OTP_ATTEMPTS);
  const [onboardingStep, setOnboardingStepState] = useState<'profile' | 'location' | null>(null);
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyInFlight = useRef(false);

  const persistUser = useCallback((u: AppUser) => {
    setUser(u);
    try {
      Storage.setItem('userId', u.id);
      Storage.setItem('userData', JSON.stringify(u));
    } catch {
      // non-fatal
    }
  }, []);

  const setOnboardingStep = useCallback((step: 'profile' | 'location' | null) => {
    setOnboardingStepState(step);
    if (step) mmkvStorage.setItem(ONBOARDING_STEP_KEY, step);
    else mmkvStorage.removeItem(ONBOARDING_STEP_KEY);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = Storage.getItem('accessToken');
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const profile = await authApi.getProfile();
      persistUser(mapProfileUser(profile as Record<string, unknown>));
      setIsGuest(false);
    } catch {
      const raw = Storage.getItem('userData');
      if (raw) {
        try {
          setUser(JSON.parse(raw) as AppUser);
        } catch {
          setUser(null);
        }
      }
    }
  }, [persistUser]);

  useEffect(() => {
    (async () => {
      try {
        const token = Storage.getItem('accessToken');
        if (token) {
          await refreshProfile();
          // An account with no name never finished Profile Setup.
          const raw = Storage.getItem('userData');
          let saved: AppUser | null = null;
          try {
            saved = raw ? (JSON.parse(raw) as AppUser) : null;
          } catch {
            saved = null;
          }
          const step = readOnboardingStep() || (saved?.name?.trim() ? null : 'profile');
          if (step) {
            setOnboardingStep(step);
            if (step === 'profile') setPendingUser(saved);
          }
        } else if (mmkvStorage.getItem('isGuest') === '1') {
          setIsGuest(true);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshProfile, setOnboardingStep]);

  const startCooldown = useCallback((seconds: number) => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    let n = Math.max(0, Math.floor(seconds) || 0);
    setResendCooldown(n);
    if (n <= 0) return;
    cooldownTimer.current = setInterval(() => {
      n -= 1;
      setResendCooldown(Math.max(0, n));
      if (n <= 0 && cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    }, 1000);
  }, []);

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    },
    [],
  );

  const sendOtp = useCallback(
    async (
      identifier: { phone?: string; email?: string },
      mode: OtpSession['mode'],
      channel?: OtpSession['channel'],
    ) => {
      const phone = (identifier.phone || '').replace(/\D/g, '').slice(-10);
      const email = (identifier.email || '').trim();
      const preferredChannel = CHANNEL_MAP[channel || (email ? 'email' : 'mobile')];
      const intent: 'login' | 'signup' = mode === 'signup' ? 'signup' : 'login';
      try {
        const res = await authApi.sendOtp(
          preferredChannel === 'email'
            ? { email, preferredChannel, intent }
            : { phoneNumber: phone, preferredChannel, intent },
        );
        setOtpSession({ phone, email, mode, channel, sessionId: res.sessionId });
        setOtpAttemptsLeft(MAX_OTP_ATTEMPTS);
        startCooldown(res.resendCooldownSeconds ?? 30);
        return { success: true };
      } catch (e: unknown) {
        const code = errCode(e);
        return {
          success: false,
          code,
          message:
            code === 'USER_NOT_FOUND'
              ? errText(e, 'No account found. Please sign up first.')
              : errText(e, 'Could not send the code. Please try again.'),
        };
      }
    },
    [startCooldown],
  );

  const resendOtp = useCallback(async () => {
    if (resendCooldown > 0) return { success: false };
    if (!otpSession?.sessionId) {
      return { success: false, message: 'Session expired. Go back and request a new code.' };
    }
    try {
      const res = await authApi.resendOtp({ sessionId: otpSession.sessionId });
      // Keep the active sessionId; refresh cooldown from server.
      if ((res as { sessionId?: string }).sessionId) {
        setOtpSession(prev =>
          prev
            ? { ...prev, sessionId: (res as { sessionId: string }).sessionId }
            : prev,
        );
      }
      setOtpAttemptsLeft(MAX_OTP_ATTEMPTS);
      startCooldown(res.resendCooldownSeconds ?? 30);
      return { success: true, message: 'A new code has been sent' };
    } catch (e: unknown) {
      return { success: false, message: errText(e, 'Could not resend the code. Please try again.') };
    }
  }, [resendCooldown, otpSession?.sessionId, startCooldown]);

  const verifyOtp = useCallback(
    async (
      code: string,
    ): Promise<{
      success: boolean;
      message?: string;
      code?: string;
      nextStep?: 'profile' | 'home';
    }> => {
      if (code.length !== 4) return { success: false, message: 'Enter the 4-digit code' };
      if (!otpSession?.sessionId) return { success: false, message: 'Session expired, please retry' };
      if (otpAttemptsLeft <= 0) {
        return {
          success: false,
          code: 'OTP_LOCKED',
          message: 'Too many incorrect attempts. Request a new code.',
        };
      }
      if (verifyInFlight.current) {
        return { success: false, message: 'Verification already in progress' };
      }

      verifyInFlight.current = true;
      const sessionId = otpSession.sessionId;
      try {
        const res = await authApi.verifyOtp({ sessionId, otp: code });
        if (otpSession.mode !== 'signup' && res.isNewUser) {
          return {
            success: false,
            code: 'USER_NOT_FOUND',
            message: 'No account found. Please sign up first.',
          };
        }

        Storage.setItem('accessToken', res.accessToken);
        mmkvStorage.removeItem('isGuest');
        try {
          // Lets a relaunch before Profile Setup is finished find the account.
          Storage.setItem('userId', res.user._id);
        } catch {
          // non-fatal
        }

        const appUser: AppUser = {
          id: res.user._id,
          name: res.user.name || '',
          email: res.user.email || otpSession.email || undefined,
          phoneNumber: res.user.phoneNumber
            ? `+91 ${res.user.phoneNumber}`
            : otpSession.phone
            ? `+91 ${otpSession.phone}`
            : undefined,
          avatarUrl: res.user.avatarUrl || undefined,
        };

        // Consume the OTP session so a stale sessionId cannot be reused.
        setOtpSession(null);

        if (otpSession.mode === 'signup' || (res.isNewUser && !appUser.name)) {
          setPendingUser(appUser);
          try {
            Storage.setItem('userData', JSON.stringify(appUser));
          } catch {
            // non-fatal
          }
          setOnboardingStep('profile');
          return { success: true, nextStep: 'profile' };
        }

        persistUser(appUser);
        setIsGuest(false);
        mmkvStorage.removeItem('isGuest');
        return { success: true, nextStep: 'home' };
      } catch (e: unknown) {
        const code = errCode(e);
        if (code === 'USER_NOT_FOUND') {
          return {
            success: false,
            code,
            message: errText(e, 'No account found. Please sign up first.'),
          };
        }
        const left = Math.max(0, otpAttemptsLeft - 1);
        setOtpAttemptsLeft(left);
        if (left <= 0) {
          return {
            success: false,
            code: 'OTP_LOCKED',
            message: 'Too many incorrect attempts. Request a new code.',
          };
        }
        return { success: false, code, message: errText(e, 'Invalid OTP, please try again') };
      } finally {
        verifyInFlight.current = false;
      }
    },
    [otpSession, otpAttemptsLeft, persistUser, setOnboardingStep],
  );

  const completeSignupProfile = useCallback(
    async (fullName: string, email?: string) => {
      const base = pendingUser || { id: user?.id || '', name: '' };
      const next: AppUser = { ...base, name: fullName, email: email || base.email };
      try {
        await authApi.updateProfile({ name: fullName, ...(email ? { email } : {}) });
      } catch {
        // persist locally even if PUT fails
      }
      persistUser(next);
      setIsGuest(false);
      mmkvStorage.removeItem('isGuest');
      setPendingUser(null);
      setOnboardingStep('location');
    },
    [pendingUser, user?.id, persistUser, setOnboardingStep],
  );

  const completeLocationStep = useCallback(() => {
    setOnboardingStep(null);
  }, [setOnboardingStep]);

  const continueAsGuest = useCallback(() => {
    setIsGuest(true);
    setUser(null);
    mmkvStorage.setItem('isGuest', '1');
  }, []);

  const loginWithPassword = useCallback(async () => {
    return { success: false, message: 'Password login is not supported. Use OTP instead.' };
  }, []);

  const resetPassword = useCallback(async () => {
    // no-op — password reset not supported
  }, []);

  const logout = useCallback(() => {
    // Before the token is cleared: stop pushes for this account on this device.
    unregisterPushToken(Storage.getItem('accessToken'));
    authApi.logout().catch(() => {});
    closeCustomerSocket();
    Storage.clearAuth();
    try {
      Storage.removeItem('userData');
    } catch {
      // ignore
    }
    mmkvStorage.removeItem('isGuest');
    setUser(null);
    setIsGuest(false);
    setOtpSession(null);
    setPendingUser(null);
    setOnboardingStep(null);
    verifyInFlight.current = false;
  }, [setOnboardingStep]);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
  }, [logout]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      isGuest,
      otpSession,
      resendCooldown,
      otpAttemptsLeft,
      onboardingStep,
      sendOtp,
      resendOtp,
      verifyOtp,
      completeSignupProfile,
      completeLocationStep,
      continueAsGuest,
      logout,
      refreshProfile,
      loginWithPassword,
      resetPassword,
    }),
    [
      user,
      isLoading,
      isGuest,
      otpSession,
      resendCooldown,
      otpAttemptsLeft,
      onboardingStep,
      sendOtp,
      resendOtp,
      verifyOtp,
      completeSignupProfile,
      completeLocationStep,
      continueAsGuest,
      logout,
      refreshProfile,
      loginWithPassword,
      resetPassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
