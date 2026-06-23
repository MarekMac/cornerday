import * as Sentry from '@sentry/react-native';

export function initSentry() {
  Sentry.init({
    dsn: 'https://00fab0087c5150a12040351e11609e71@o4511614786863104.ingest.us.sentry.io/4511614790795264',
    environment: __DEV__ ? 'development' : 'production',
    // Only send events in production to keep the dev noise down
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
  });
}

export { Sentry };
