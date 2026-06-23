import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HAPTICS_KEY } from '@/constants/storage-keys';

let _enabled = true;

export async function initHaptics() {
  try {
    const v = await AsyncStorage.getItem(HAPTICS_KEY);
    if (v !== null) _enabled = v !== 'false';
  } catch (_) {}
}

export function setHapticsEnabled(v: boolean) {
  _enabled = v;
}

export function haptic(style = Haptics.ImpactFeedbackStyle.Light) {
  if (_enabled) Haptics.impactAsync(style).catch(() => {});
}

export function hapticMedium() {
  haptic(Haptics.ImpactFeedbackStyle.Medium);
}
