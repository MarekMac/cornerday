import { Platform } from 'react-native';

export const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '',
}) ?? '';

// Must match the entitlement identifier you create in RevenueCat dashboard
export const ENTITLEMENT_ID = 'premium';
