import { Platform } from 'react-native';
import MobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const INTERSTITIAL_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-5720390815287437/7003400342';

let interstitial: InterstitialAd | null = null;
let adLoaded = false;

function loadNext() {
  if (!interstitial) return;
  adLoaded = false;
  interstitial.load();
}

export function initAds(): void {
  if (Platform.OS === 'web') return;

  MobileAds().initialize().catch(() => {});

  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
    requestNonPersonalizedAdsOnly: true,
  });

  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    adLoaded = true;
  });

  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    loadNext();
  });

  interstitial.addAdEventListener(AdEventType.ERROR, () => {
    // Back off 60s before retrying so we don't hammer the network
    setTimeout(loadNext, 60_000);
  });

  interstitial.load();
}

export function showInterstitialIfReady(isPremium: boolean, probability = 0.33): void {
  if (isPremium || !adLoaded || !interstitial) return;
  if (Math.random() > probability) return;
  adLoaded = false;
  interstitial.show().catch(() => { adLoaded = true; }); // restore flag if show fails
}
