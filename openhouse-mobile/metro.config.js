const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Force Metro to transpile packages that ship untranspiled ESM / modern syntax
config.resolver.unstable_enablePackageExports = false;
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

module.exports = config;
