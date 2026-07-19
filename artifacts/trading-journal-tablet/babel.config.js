module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { unstable_transformImportMeta: true }],
      // NativeWind v4: must be a preset, NOT a plugin.
      // nativewind/babel re-exports react-native-css-interop/babel which
      // returns { plugins: [...] } — a preset shape. Placing it in plugins[]
      // causes Babel to throw ".plugins is not a valid Plugin property".
      "nativewind/babel",
    ],
    plugins: [
      // react-native-reanimated MUST be the last plugin
      "react-native-reanimated/plugin",
    ],
  };
};
