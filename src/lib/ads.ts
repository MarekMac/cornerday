import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-5720390815287437/7003400342';

const MIN_INTERVAL_MS = 5 * 60 * 1000;

let ad = InterstitialAd.createForAdRequest(UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});
let loaded = false;
let lastShown = 0;

function preload() {
  ad = InterstitialAd.createForAdRequest(UNIT_ID, {
    requestNonPersonalizedAdsOnly: true,
  });
  loaded = false;
  const unsub = ad.addAdEventListener(AdEventType.LOADED, () => {
    loaded = true;
    unsub();
  });
  ad.load();
}

preload();

export function showInterstitialIfReady(isPremium: boolean, probability = 1): void {
  if (isPremium) return;
  if (!loaded) return;
  if (Date.now() - lastShown < MIN_INTERVAL_MS) return;
  if (Math.random() > probability) return;
  lastShown = Date.now();
  loaded = false;
  ad.show().catch(() => {});
  preload();
}

export function initAds(): void {
  // Preload is called at module level; this is a no-op hook for explicit init points.
}
