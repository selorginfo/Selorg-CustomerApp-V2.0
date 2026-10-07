import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';
import { navigationRef, consumePendingNavigation } from '../utils/navigationRef';
import { isOnline, subscribeConnectivity } from '../utils/connectivity';
import type { RootStackParamList } from './types';

import SplashScreen from '../screens/Splash';
import OnboardingScreen from '../screens/onboarding/Onboarding';
import EnterMobileScreen from '../screens/auth/EnterMobile';
import OtpScreen from '../screens/auth/otp';
import ProfileSetupScreen from '../screens/auth/ProfileSetup';
import LocationPermissionScreen from '../screens/location/LocationPermission';

import SearchScreen from '../screens/home/Search';
import CategoryProductsScreen from '../screens/categories/CategoryProducts';
import CollectionScreen from '../screens/categories/Collection';

import ProductDetailScreen from '../screens/product/ProductDetail';
import ReviewsScreen from '../screens/product/Reviews';
import WriteReviewScreen from '../screens/product/WriteReview';

import CartScreen from '../screens/cart/cart';
import CheckoutScreen from '../screens/cart/checkout';
import AddressesScreen from '../screens/profile/addresses';
import AddAddressScreen from '../screens/profile/AddAddress';
import PaymentScreen from '../screens/orders/PaymentScreen';
import OrderPlacedScreen from '../screens/orders/OrderPlaced';

import TrackingScreen from '../screens/orders/Tracking';
import OrdersScreen from '../screens/orders/index';
import OrderDetailScreen from '../screens/orders/OrderDetail';
import InvoiceScreen from '../screens/orders/Invoice';
import RateOrderScreen from '../screens/orders/RateOrder';
import RatingSuccessScreen from '../screens/orders/RatingSuccess';

import RefundsScreen from '../screens/refunds/index';
import RefundDetailScreen from '../screens/refunds/RefundDetail';
import ReturnRequestScreen from '../screens/refunds/ReturnRequest';

import AccountScreen from '../screens/profile/index';
import EditProfileScreen from '../screens/profile/profileDetails';
import SettingsScreen from '../screens/profile/settings';
import WalletScreen from '../screens/wallet/index';
import NotificationsScreen from '../screens/profile/notification';
import SupportScreen from '../screens/profile/helpSupport';
import TicketDetailScreen from '../screens/profile/TicketDetail';
import LegalScreen from '../screens/profile/policy';
import WishlistScreen from '../screens/profile/yourWishlist';

import NoInternetScreen from '../screens/common/NoInternet';

const Stack = createNativeStackNavigator<RootStackParamList>();

const currentRouteName = () =>
  navigationRef.isReady() ? (navigationRef.getCurrentRoute()?.name as string | undefined) : undefined;

/** Show the No Internet screen over whatever is open (never over Splash). */
function showNoInternet() {
  const name = currentRouteName();
  if (!name || name === 'NoInternet' || name === 'Splash') return;
  navigationRef.navigate('NoInternet' as never);
}

export default function RootNavigator() {
  const prevRoute = useRef<string | undefined>(undefined);

  useEffect(() => {
    setTimeout(() => consumePendingNavigation(), 300);
  }, []);

  // Offline → No Internet screen; back online → return to where the user was.
  useEffect(
    () =>
      subscribeConnectivity(online => {
        if (!online) {
          showNoInternet();
          return;
        }
        if (currentRouteName() === 'NoInternet' && navigationRef.canGoBack()) navigationRef.goBack();
      }),
    [],
  );

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => consumePendingNavigation()}
      onStateChange={() => {
        const name = currentRouteName();
        // Launched offline: the drop was detected during Splash, so surface it
        // as soon as Splash hands over.
        if (prevRoute.current === 'Splash' && name !== 'Splash' && !isOnline()) showNoInternet();
        prevRoute.current = name;
      }}
    >
      <Stack.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}
        initialRouteName="Splash"
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />

        <Stack.Screen name="EnterMobile" component={EnterMobileScreen} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} />

        <Stack.Screen name="Main" component={MainTabNavigator} />

        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="CategoryProducts" component={CategoryProductsScreen} />
        <Stack.Screen name="Collection" component={CollectionScreen} />

        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="Reviews" component={ReviewsScreen} />
        <Stack.Screen name="WriteReview" component={WriteReviewScreen} />

        <Stack.Screen name="Cart" component={CartScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="Addresses" component={AddressesScreen} />
        <Stack.Screen name="AddAddress" component={AddAddressScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="OrderPlaced" component={OrderPlacedScreen} />

        <Stack.Screen name="Tracking" component={TrackingScreen} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="Invoice" component={InvoiceScreen} />
        <Stack.Screen name="RateOrder" component={RateOrderScreen} />
        <Stack.Screen name="RatingSuccess" component={RatingSuccessScreen} />

        <Stack.Screen name="Refunds" component={RefundsScreen} />
        <Stack.Screen name="RefundDetail" component={RefundDetailScreen} />
        <Stack.Screen name="ReturnRequest" component={ReturnRequestScreen} />

        <Stack.Screen name="Account" component={AccountScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="TicketDetail" component={TicketDetailScreen} />
        <Stack.Screen name="Legal" component={LegalScreen} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} />

        <Stack.Screen name="NoInternet" component={NoInternetScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
