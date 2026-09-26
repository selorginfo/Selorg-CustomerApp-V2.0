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
  sendOtp: (
    identifier: { phone?: string; email?: string },
    mode: OtpSession['mode'],
    channel?: OtpSession['channel'],
  ) => Promise<{ success: boolean; message?: string; code?: string }>;
  resendOtp: () => Promise<void>;
  verifyOtp: (
    code: string,
  ) => Promise<{
    success: boolean;
    message?: string;
    code?: string;
    nextStep?: 'profile' | 'home';
  }>;
  completeSignupProfile: (fullName: string, email?: string) => Promise<void>;
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
  const [otpAttemptsLeft, setOtpAttemptsLeft] = useState(5);
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
        } else if (mmkvStorage.getItem('isGuest') === '1') {
          setIsGuest(true);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshProfile]);

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
        setOtpAttemptsLeft(5);
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
    if (resendCooldown > 0 || !otpSession?.sessionId) return;
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
      setOtpAttemptsLeft(5);
      startCooldown(res.resendCooldownSeconds ?? 30);
    } catch {
      // keep cooldown
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
        return { success: false, code, message: errText(e, 'Invalid OTP, please try again') };
      } finally {
        verifyInFlight.current = false;
      }
    },
    [otpSession, otpAttemptsLeft, persistUser],
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
    },
    [pendingUser, user?.id, persistUser],
  );

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
    verifyInFlight.current = false;
  }, []);

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
      sendOtp,
      resendOtp,
      verifyOtp,
      completeSignupProfile,
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
      sendOtp,
      resendOtp,
      verifyOtp,
      completeSignupProfile,
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
