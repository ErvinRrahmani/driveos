import expoMetroConfig from 'expo/metro-config.js';

const config = expoMetroConfig.getDefaultConfig(import.meta.dirname);

const NATIVE_CONDITIONS = ['react-native', 'import', 'require', 'default'];

// Workspace TypeScript sources use NodeNext-style `./file.js` specifiers for `./file.ts`.
// msw/native maps the `browser` condition to null, but its interceptors also work in a browser page.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'msw/native') {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: NATIVE_CONDITIONS, unstable_conditionsByPlatform: {} },
      moduleName,
      platform,
    );
  }
  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    /\.tsx?$/.test(context.originModulePath)
  ) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      return context.resolveRequest(context, moduleName, platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

export default config;
