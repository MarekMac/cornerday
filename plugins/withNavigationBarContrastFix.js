const { withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

// expo-navigation-bar's own config plugin is supposed to add
// android:enforceNavigationBarContrast=false to AppTheme when
// `enforceContrast: false` is set, but in this project it silently doesn't
// land in the generated styles.xml (confirmed by inspecting the prebuilt
// output — the item is simply missing regardless of the config value).
// Without it, Android 15+ (targetSdk 35+) ignores android:navigationBarColor
// entirely and forces its own high-opacity light scrim over the transparent
// edge-to-edge nav bar, washing any dark color the app renders there down to
// a washed-out near-white — which is what caused the system nav bar to look
// white/light on every screen. This plugin adds the item directly as a
// standalone fix, independent of expo-navigation-bar's own (currently
// broken) implementation of the same config option.
function withNavigationBarContrastFix(config) {
  return withAndroidStyles(config, (config) => {
    const { style = [] } = config.modResults.resources;
    const mainTheme = style.find(({ $ }) => $.name === 'AppTheme');
    if (!mainTheme) return config;

    const item = {
      _: 'false',
      $: { name: 'android:enforceNavigationBarContrast', 'tools:targetApi': '29' },
    };
    const existingIndex = mainTheme.item.findIndex(
      ({ $ }) => $.name === 'android:enforceNavigationBarContrast'
    );
    if (existingIndex !== -1) {
      mainTheme.item[existingIndex] = item;
    } else {
      mainTheme.item.push(item);
    }
    return config;
  });
}

module.exports = withNavigationBarContrastFix;
