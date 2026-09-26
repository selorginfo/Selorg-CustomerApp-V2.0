const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * On Windows (no Watchman / no NativeWatcher), Metro uses FallbackWatcher,
 * which recursively fs.watch()'s every directory under the project. Android
 * Gradle outputs make that crawl exceed Metro's 240s timeout ("Failed to
 * start watch mode"). Bundler then swallows the error and later crashes
 * bundle requests with:
 *   Cannot read properties of undefined (reading 'get')
 * in DependencyGraph.js — because _resolutionCache was never initialized.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: [
      /[/\\]android[/\\]app[/\\]build([/\\]|$)/i,
      /[/\\]android[/\\]build([/\\]|$)/i,
      /[/\\]android[/\\]\.gradle([/\\]|$)/i,
      /[/\\]ios[/\\]build([/\\]|$)/i,
      /[/\\]\.git([/\\]|$)/i,
      // Ephemeral native-module extracts (e.g. .react-native-mmkv-XXXX) disappear
      // mid-watch and crash FallbackWatcher with ENOENT on Windows.
      /[/\\]node_modules[/\\]\.[^/\\]+/i,
      /\.xcodeproj([/\\]|$)/i,
      /\.xcworkspace([/\\]|$)/i,
    ],
    // Skip Watchman probes when it isn't installed (common on Windows).
    useWatchman: false,
  },
  watcher: {
    // Health checks are flaky with FallbackWatcher on Windows and add noise.
    healthCheck: {
      enabled: false,
    },
  },
  server: {
    // Android BundleDownloader Accept: multipart/mixed. On Windows hosts the
    // large chunked multipart response often desyncs OkHttp
    // (ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd),
    // leaving only the native green splash. Force plain application/javascript.
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        const accept = req.headers.accept;
        if (typeof accept === 'string' && accept.includes('multipart/mixed')) {
          req.headers.accept = 'application/javascript';
        }
        return middleware(req, res, next);
      };
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
