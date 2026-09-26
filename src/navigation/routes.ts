/** Central route-name registry — mirrors the prototype's screen inventory. */
export const ROUTES = {
  SPLASH: 'Splash',
  ONBOARDING: 'Onboarding',

  ENTER_MOBILE: 'EnterMobile',
  LOGIN_PASSWORD: 'LoginPassword',
  CREATE_PASSWORD: 'CreatePassword',
  FORGOT: 'Forgot',
  RESET_PASSWORD: 'ResetPassword',
  OTP: 'Otp',
  PROFILE_SETUP: 'ProfileSetup',
  AUTH_SUCCESS: 'AuthSuccess',
  LOCATION_PERMISSION: 'LocationPermission',

  MAIN: 'Main',
  HOME_TAB: 'HomeTab',
  CATEGORIES_TAB: 'CategoriesTab',
  CART_TAB: 'CartTab',
  ORDERS_TAB: 'OrdersTab',
  PROFILE_TAB: 'ProfileTab',

  SEARCH: 'Search',
  CATEGORY_PRODUCTS: 'CategoryProducts',
  COLLECTION: 'Collection',

  PRODUCT_DETAIL: 'ProductDetail',
  REVIEWS: 'Reviews',
  WRITE_REVIEW: 'WriteReview',

  CHECKOUT: 'Checkout',
  ADDRESSES: 'Addresses',
  ADD_ADDRESS: 'AddAddress',
  PAYMENT: 'Payment',
  ORDER_PLACED: 'OrderPlaced',

  TRACKING: 'Tracking',
  ORDERS: 'Orders',
  ORDER_DETAIL: 'OrderDetail',
  INVOICE: 'Invoice',
  RATE_ORDER: 'RateOrder',
  RATING_SUCCESS: 'RatingSuccess',

  REFUNDS: 'Refunds',
  REFUND_DETAIL: 'RefundDetail',
  RETURN_REQUEST: 'ReturnRequest',

  ACCOUNT: 'Account',
  EDIT_PROFILE: 'EditProfile',
  SETTINGS: 'Settings',
  WALLET: 'Wallet',
  NOTIFICATIONS: 'Notifications',
  SUPPORT: 'Support',
  TICKET_DETAIL: 'TicketDetail',
  LEGAL: 'Legal',
  WISHLIST: 'Wishlist',

  NO_INTERNET: 'NoInternet',
} as const;

export type RouteName = (typeof ROUTES)[keyof typeof ROUTES];
