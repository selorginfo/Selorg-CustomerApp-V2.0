import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/home';
import CategoriesScreen from '../screens/categories';
import CartScreen from '../screens/cart/cart';
import OrdersScreen from '../screens/orders/index';
import AccountScreen from '../screens/profile/index';
import { MainTabBar } from '../components/AppBottomNav';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <MainTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#FFFFFF' } }}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} />
      <Tab.Screen name="CategoriesTab" component={CategoriesScreen} />
      <Tab.Screen name="CartTab" component={CartScreen} />
      <Tab.Screen name="OrdersTab" component={OrdersScreen} />
      <Tab.Screen name="ProfileTab" component={AccountScreen} />
    </Tab.Navigator>
  );
}
