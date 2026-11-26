module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['vendor/'],
  overrides: [
    {
      files: ['jest.setup.js', '**/__tests__/**', '**/*.{test,spec}.{js,jsx,ts,tsx}'],
      env: { jest: true },
    },
  ],
};
