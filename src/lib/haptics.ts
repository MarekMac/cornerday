import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HAPTICS_KEY } from '@/constants/storage-keys';

let _enabled = true;

export function initHaptics() {
  AsyncStorage.getItem(HAPTICS_KEY).then(v => {
    if (v !== null) _enabled = v !== 'false';
  });
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
