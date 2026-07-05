import { Platform } from 'react-native';
import MobileAds, {
  InterstitialAd,
  AdEventType,
  TestIds,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';
import { Sentry } from './sentry';

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

  // This app supports people in gambling-addiction recovery — a
  // scary/manipulative ad creative (e.g. fake "your device has a virus"
  // scareware, a known low-quality genre on ad networks generally) is a
  // much worse experience here than on a typical app. PG excludes content
  // AdMob classifies as "scary imagery" (that tier starts at T) while still
  // allowing normal general-audience ads to fill.
  MobileAds()
    .setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG })
    .catch(() => {})
    .finally(() => {
      MobileAds().initialize().catch(() => {});
    });

  interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
    requestNonPersonalizedAdsOnly: true,
  });

  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    adLoaded = true;
  });

  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    loadNext();
  });

  interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
    // error.message already includes the native error code, e.g. "[googleMobileAds/no-fill] ..."
    Sentry.captureMessage(`Interstitial load error: ${error.message}`, 'warning');
    // Back off 60s before retrying so we don't hammer the network
    setTimeout(loadNext, 60_000);
  });

  interstitial.load();
}

export function showInterstitialIfReady(isPremium: boolean, probability = 0.33, source = 'unknown'): void {
  if (isPremium || !adLoaded || !interstitial) return;
  if (Math.random() > probability) return;
  adLoaded = false;
  interstitial.show()
    .then(() => Sentry.captureMessage(`Interstitial shown (source=${source})`, 'info'))
    .catch(() => { adLoaded = true; }); // restore flag if show fails
}
