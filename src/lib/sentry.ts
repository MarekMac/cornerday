import * as Sentry from '@sentry/react-native';

export function initSentry() {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    // Only send events in production to keep the dev noise down
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
  });
}

export { Sentry };
