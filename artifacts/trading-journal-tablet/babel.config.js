module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // NativeWind class-name transform — must come before reanimated
      "nativewind/babel",
      // react-native-reanimated MUST be the last plugin
      "react-native-reanimated/plugin",
    ],
  };
};
