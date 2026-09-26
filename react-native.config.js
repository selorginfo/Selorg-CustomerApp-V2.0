module.exports = {
  project: {
    ios: {},
    android: {
      // Must match android/app/build.gradle namespace and Firebase google-services.json
      packageName: 'com.selorg.com',
    },
  },
  assets: ['./assets/fonts/'],
};
