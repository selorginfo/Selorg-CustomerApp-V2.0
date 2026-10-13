const fs = require('fs');
const { activeDotenvPath } = require('./scripts/brand-env');

module.exports = api => {
  // Selorg: `.env`, unchanged. Partner: env/<brand>/.env.resolved from `npm run brand`.
  const envPath = activeDotenvPath(__dirname);
  api.cache.using(() => `${envPath}:${fs.existsSync(envPath) ? fs.statSync(envPath).mtimeMs : 0}`);
  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      [
        'module:react-native-dotenv',
        {
          moduleName: '@env',
          path: envPath,
          safe: false,
          allowUndefined: true,
        },
      ],
    ],
  };
};
