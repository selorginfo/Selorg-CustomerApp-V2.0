module.exports = {
  project: {
    ios: {},
    android: {
      // Must match android/app/build.gradle namespace and Firebase google-services.json
      packageName: 'com.selorg.com',
    },
  },
  dependencies: {
    // Android only. iOS keeps the hosted WebView checkout.
    'react-native-weipl-checkout': { platforms: { ios: null } },
  },
  assets: ['./assets/fonts/'],
};
