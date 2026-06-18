import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { STORE_REVIEW_ASKED_KEY } from '@/constants/storage-keys';

export type ReviewTrigger = '7_day' | '1_month' | 'savings_goal' | 'debt_paid';

interface ReviewState {
  count: number;
  lastAsked: number;
  triggers: ReviewTrigger[];
}

const MAX_ASKS = 3;
const MIN_GAP_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function maybeRequestReview(trigger: ReviewTrigger): Promise<void> {
  try {
    const available = await StoreReview.hasAction();
    if (!available) return;

    const raw = await AsyncStorage.getItem(STORE_REVIEW_ASKED_KEY);
    const state: ReviewState = raw ? JSON.parse(raw) : { count: 0, lastAsked: 0, triggers: [] };

    if (state.triggers.includes(trigger)) return;
    if (state.count >= MAX_ASKS) return;
    if (state.count > 0 && Date.now() - state.lastAsked < MIN_GAP_MS) return;

    const next: ReviewState = {
      count: state.count + 1,
      lastAsked: Date.now(),
      triggers: [...state.triggers, trigger],
    };
    await AsyncStorage.setItem(STORE_REVIEW_ASKED_KEY, JSON.stringify(next));
    await StoreReview.requestReview();
  } catch (_e) {}
}
