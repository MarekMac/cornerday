import { Platform } from 'react-native';

// Fill these in from your RevenueCat dashboard → Project Settings → API Keys
export const REVENUECAT_API_KEY = Platform.select({
  ios: 'YOUR_IOS_REVENUECAT_API_KEY',
  android: 'YOUR_ANDROID_REVENUECAT_API_KEY',
}) ?? '';

// Must match the entitlement identifier you create in RevenueCat dashboard
export const ENTITLEMENT_ID = 'premium';
