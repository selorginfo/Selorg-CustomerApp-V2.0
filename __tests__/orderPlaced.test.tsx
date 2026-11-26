import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';
import OrderPlacedScreen from '../src/screens/orders/OrderPlaced';

jest.setTimeout(20000);

const mockReplace = jest.fn();
const mockReset = jest.fn();
const mockGetOrder = jest.fn();
const mockOrderPlacedLayout = jest.fn((height: number) =>
  jest.requireActual('../src/utils/orderPlacedLayout').orderPlacedLayout(height),
);

jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(View, props, children);
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    replace: mockReplace,
    reset: mockReset,
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: {
      orderId: 'ord-1',
      confirmedPaid: true,
      paidAmount: 54,
      paymentMethodLabel: 'Online',
      txnId: 'txn-abc',
    },
  }),
}));

jest.mock('../src/context/OrdersContext', () => ({
  useOrders: () => ({
    orders: [],
    activeOrder: null,
  }),
}));

jest.mock('../src/services/orders.service', () => ({
  ordersApi: {
    getOrder: (...args: unknown[]) => mockGetOrder(...args),
  },
}));

jest.mock('../src/utils/orderPlacedLayout', () => {
  const actual = jest.requireActual('../src/utils/orderPlacedLayout');
  return {
    ...actual,
    orderPlacedLayout: (height: number) => mockOrderPlacedLayout(height),
  };
});

jest.mock('../src/components', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    AnimatedIcon: () => React.createElement(View, { testID: 'animated-check' }),
    CleanBadges: ({ items }: { items: string[] }) =>
      React.createElement(
        View,
        { testID: 'clean-badges' },
        items.map((item: string) => React.createElement(Text, { key: item }, item)),
      ),
    PrimaryButton: ({
      label,
      onPress,
      testID,
    }: {
      label: string;
      onPress: () => void;
      testID?: string;
    }) =>
      React.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: 'button' },
        React.createElement(Text, null, label),
      ),
    ScreenContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: 'screen-container' }, children),
  };
});

async function renderScreen() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<OrderPlacedScreen />);
  });
  return tree;
}

beforeEach(() => {
  mockReplace.mockReset();
  mockReset.mockReset();
  mockGetOrder.mockReset();
  mockOrderPlacedLayout.mockReset();
  mockOrderPlacedLayout.mockImplementation((height: number) =>
    jest.requireActual('../src/utils/orderPlacedLayout').orderPlacedLayout(height),
  );
});

describe('OrderPlaced payment success screen', () => {
  it('renders a scrollable success layout so short screens do not overlap the footer', async () => {
    const tree = await renderScreen();
    expect(tree.root.findByProps({ testID: 'order-placed-success' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'order-placed-scroll' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'order-placed-footer' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'payment-success-receipt' })).toBeTruthy();

    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flexGrow: 1, justifyContent: 'center' }),
      ]),
    );

    const labels = tree.root.findAllByType(Text).map(n => String(n.props.children ?? ''));
    expect(labels).toEqual(
      expect.arrayContaining([
        'Order placed!',
        'Payment successful. Your order is confirmed and being prepared.',
        'You’ve chosen life. Thank you.',
        'PAYMENT STATUS',
        'Completed',
        'AMOUNT',
        'PAYMENT METHOD',
        'Online',
        'ORDER ID',
        'ord-1',
        'TRANSACTION ID',
        'txn-abc',
        'Track order',
        'Continue shopping',
      ]),
    );
    expect(labels).not.toContain('View order');
  });

  it('compacts scroll content on short windows so the badge and cards stay above actions', async () => {
    mockOrderPlacedLayout.mockReturnValue({
      compact: true,
      badgeSize: 72,
      iconSize: 36,
      titleSize: 22,
      subtitleSize: 13,
      thankYouSize: 14,
    });
    const tree = await renderScreen();
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ justifyContent: 'flex-start' }),
      ]),
    );
    const badge = tree.root.findByProps({ testID: 'order-placed-badge' });
    expect(badge.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 72, height: 72 })]),
    );
  });

  it('keeps track / home actions outside the scroll body and omits view order', async () => {
    const tree = await renderScreen();
    const scroll = tree.root.findByType(ScrollView);
    const footer = tree.root.findByProps({ testID: 'order-placed-footer' });
    expect(scroll.findAllByProps({ testID: 'order-placed-track' })).toHaveLength(0);
    expect(footer.findByProps({ testID: 'order-placed-track' })).toBeTruthy();
    expect(footer.findByProps({ testID: 'order-placed-home' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'order-placed-view' })).toHaveLength(0);
  });

  it('routes track and continue shopping without regressing navigation', async () => {
    const tree = await renderScreen();

    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'order-placed-track' }).props.onPress();
    });
    expect(mockReplace).toHaveBeenCalledWith('Tracking', { orderId: 'ord-1' });
    expect(mockReplace).not.toHaveBeenCalledWith('OrderDetail', expect.anything());

    await ReactTestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'order-placed-home' }).props.onPress();
    });
    expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
  });
});
