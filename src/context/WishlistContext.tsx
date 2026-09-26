import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

interface WishlistContextType {
  wishlist: string[];
  isWished: (productId: string) => boolean;
  toggleWish: (productId: string) => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [wishlist, setWishlist] = useState<string[]>([]);

  const isWished = useCallback((productId: string) => wishlist.includes(productId), [wishlist]);

  const toggleWish = useCallback((productId: string) => {
    setWishlist(prev => prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]);
  }, []);

  const value = useMemo<WishlistContextType>(() => ({ wishlist, isWished, toggleWish }), [wishlist, isWished, toggleWish]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within a WishlistProvider');
  return ctx;
};
