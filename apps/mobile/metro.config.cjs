const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

// Keep Tailwind's native transforms and generated class typings tied to one CSS entry.
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb');

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
