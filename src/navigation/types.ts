import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  HomeTab: undefined;
  CategoriesTab: undefined;
  CartTab: undefined;
  OrdersTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;

  EnterMobile: { mode: 'login' | 'signup' } | undefined;
  LoginPassword: { method: 'email' | 'mobile' } | undefined;
  CreatePassword: undefined;
  Forgot: undefined;
  ResetPassword: undefined;
  Otp: undefined;
  ProfileSetup: undefined;
  AuthSuccess: { mode: 'login' | 'signup' };
  LocationPermission: undefined;

  Main: NavigatorScreenParams<MainTabParamList> | undefined;

  Search: undefined;
  CategoryProducts: { categoryId: string; sub?: string };
  Collection: { collectionKey: string; title?: string };

  ProductDetail: { productId: string };
  Reviews: { productId: string };
  WriteReview: { productId: string };

  Checkout: undefined;
  Addresses: { fromCheckout?: boolean } | undefined;
  AddAddress: { addressId?: string } | undefined;
  Payment:
    | { method?: 'online' | 'cod' | 'wallet'; receiver?: { name?: string; phone?: string } }
    | undefined;
  OrderPlaced: { orderId: string };

  Tracking: undefined;
  Orders: undefined;
  OrderDetail: { orderId: string };
  Invoice: { orderId: string };
  RateOrder: { orderId: string };
  RatingSuccess: undefined;

  Refunds: undefined;
  RefundDetail: { refundId: string };
  ReturnRequest: { orderId: string };

  Account: undefined;
  EditProfile: undefined;
  Settings: undefined;
  Wallet: undefined;
  Notifications: undefined;
  Support: undefined;
  TicketDetail: { ticketId: string };
  Legal: { type: 'terms' | 'privacy' };
  Wishlist: undefined;

  NoInternet: undefined;
};
