/* Test-env mocks for native modules that have no JS fallback. */

jest.mock('react-native-keychain', () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));

jest.mock('react-native-html-to-pdf', () => ({
  generatePDF: jest.fn(async () => ({ filePath: '/tmp/invoice.pdf' })),
}));

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: { dirs: { CacheDir: '/tmp', DocumentDir: '/tmp' }, writeFile: jest.fn(), readFile: jest.fn() },
    config: jest.fn(() => ({ fetch: jest.fn() })),
    android: { actionViewIntent: jest.fn() },
    ios: { openDocument: jest.fn() },
  },
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  return { __esModule: true, default: WebView, WebView };
});

jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    requestAuthorization: jest.fn(success => success && success()),
    getCurrentPosition: jest.fn(success =>
      success({ coords: { latitude: 13.0827, longitude: 80.2707 } }),
    ),
    watchPosition: jest.fn(() => 0),
    clearWatch: jest.fn(),
    stopObserving: jest.fn(),
  },
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
    return React.createElement(View, props, props.children);
  });
  const MockMarker = props => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    PROVIDER_GOOGLE: 'google',
  };
});
