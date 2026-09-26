import React, { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { AddressProvider } from './AddressContext';
import { WishlistProvider } from './WishlistContext';
import { CartProvider } from './CartContext';
import { OrdersProvider } from './OrdersContext';
import { WalletProvider } from './WalletContext';
import { NotificationsProvider } from './NotificationsContext';
import { SupportProvider } from './SupportContext';
import { RefundsProvider } from './RefundsContext';

/** Single composition root for every domain context the app needs. */
export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AddressProvider>
        <WishlistProvider>
          <CartProvider>
            <OrdersProvider>
              <WalletProvider>
                <NotificationsProvider>
                  <SupportProvider>
                    <RefundsProvider>{children}</RefundsProvider>
                  </SupportProvider>
                </NotificationsProvider>
              </WalletProvider>
            </OrdersProvider>
          </CartProvider>
        </WishlistProvider>
      </AddressProvider>
    </AuthProvider>
  );
}
