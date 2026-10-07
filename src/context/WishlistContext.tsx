import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { mmkvStorage } from '../lib/storage';
import { useAuth } from './AuthContext';

/** One saved list per account (guests share a device-local list). */
const keyFor = (userId: string) => `wishlist:${userId || 'guest'}`;

function readList(key: string): string[] {
  try {
    const raw = mmkvStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

interface WishlistContextType {
  wishlist: string[];
  isWished: (productId: string) => boolean;
  toggleWish: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const key = keyFor(user?.id || '');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const keyRef = useRef(key);
  keyRef.current = key;

  // Swap lists when the account changes (login, logout, switch) and restore
  // the saved list after an app restart.
  useEffect(() => {
    if (isLoading) return;
    setWishlist(readList(key));
  }, [key, isLoading]);

  const isWished = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const toggleWish = useCallback((productId: string) => {
    setWishlist(prev => {
      const next = prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId];
      try {
        mmkvStorage.setItem(keyRef.current, JSON.stringify(next));
      } catch {
        // non-fatal
      }
      return next;
    });
  }, []);

  const value = useMemo<WishlistContextType>(() => ({ wishlist, isWished, toggleWish }), [wishlist, isWished, toggleWish]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within a WishlistProvider');
  return ctx;
};
