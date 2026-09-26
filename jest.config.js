module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native|@react-navigation|@react-native-community|@react-native-firebase|@notifee|@shopify/flash-list|@d11/react-native-fast-image|react-native-.*|@react-navigation/.*)/)',
  ],
};
