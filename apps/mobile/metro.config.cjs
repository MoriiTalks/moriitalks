const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

// Keep Tailwind's native transforms and generated class typings tied to one CSS entry.
module.exports = withUniwindConfig(getDefaultConfig(__dirname), {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
