import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { URGE_PREDICTION_SCHEDULE_KEY } from '../constants/storage-keys';

export interface NotifPrefs {
  notif_milestone: boolean;
  notif_daily_streak: boolean;
  notif_daily_checkin: boolean;
  notif_weekly_summary: boolean;
  notif_milestone_approaching: boolean;
  notif_urge_prediction: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  notif_milestone: true,
  notif_daily_streak: true,
  notif_daily_checkin: false,
  notif_weekly_summary: false,
  notif_milestone_approaching: false,
  notif_urge_prediction: false,
};

const SCHEDULED_MILESTONES = [
  { type: '1_hour',    days: 1/24,  emoji: '⏰', label: '1 Hour' },
  { type: '3_hours',   days: 3/24,  emoji: '🌤️', label: '3 Hours' },
  { type: '6_hours',   days: 6/24,  emoji: '☀️', label: '6 Hours' },
  { type: '12_hours',  days: 12/24, emoji: '🌗', label: '12 Hours' },
  { type: '1_day',     days: 1,     emoji: '🌱', label: '1 Day' },
  { type: '3_days',    days: 3,     emoji: '🌿', label: '3 Days' },
  { type: '1_week',    days: 7,     emoji: '⭐', label: '1 Week' },
  { type: '10_days',   days: 10,    emoji: '✨', label: '10 Days' },
  { type: '2_weeks',   days: 14,    emoji: '🌙', label: '2 Weeks' },
  { type: '3_weeks',   days: 21,    emoji: '💫', label: '3 Weeks' },
  { type: '1_month',   days: 30,    emoji: '🔥', label: '1 Month' },
  { type: '45_days',   days: 45,    emoji: '⚡', label: '45 Days' },
  { type: '2_months',  days: 60,    emoji: '🏅', label: '2 Months' },
  { type: '3_months',  days: 90,    emoji: '🎯', label: '3 Months' },
  { type: '4_months',  days: 120,   emoji: '🌊', label: '4 Months' },
  { type: '5_months',  days: 150,   emoji: '🦋', label: '5 Months' },
  { type: '6_months',  days: 180,   emoji: '💎', label: '6 Months' },
  { type: '9_months',  days: 270,   emoji: '🌸', label: '9 Months' },
  { type: '1_year',    days: 365,   emoji: '🏆', label: '1 Year' },
  { type: '18_months', days: 548,   emoji: '🦅', label: '18 Months' },
  { type: '2_years',   days: 730,   emoji: '👑', label: '2 Years' },
  { type: '3_years',   days: 1095,  emoji: '🌟', label: '3 Years' },
  { type: '4_years',   days: 1460,  emoji: '🔱', label: '4 Years' },
  { type: '5_years',   days: 1825,  emoji: '🦁', label: '5 Years' },
];

const CHANNEL_ID = 'cornerday';

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'CornerDay',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0F6E6E',
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function androidTrigger(trigger: object) {
  if (Platform.OS !== 'android') return trigger;
  return { ...trigger, channelId: CHANNEL_ID };
}

export async function scheduleAllNotifications(
  prefs: NotifPrefs,
  quitTimestamp: string | null,
  earnedBadgeTypes: string[] = [],
  timeOverrides: { streakHour?: number; checkinHour?: number } = {},
) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!quitTimestamp) return;

  const quitMs = new Date(quitTimestamp).getTime();
  const now = Date.now();
  const earnedSet = new Set(earnedBadgeTypes);

  // 1. Milestone reached — scheduled at the exact future time each milestone is hit
  if (prefs.notif_milestone) {
    for (const m of SCHEDULED_MILESTONES) {
      const fireAt = quitMs + m.days * 86400000;
      if (fireAt <= now) continue;       // already passed
      if (earnedSet.has(m.type)) continue; // already earned
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${m.emoji} ${m.label} milestone!`,
          body: `You've been clean for ${m.label}. That's a real achievement — keep going.`,
          data: { screen: '/(tabs)/' },
        },
        trigger: androidTrigger({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
        }) as any,
      });
    }
  }

  // 2. Milestone approaching — 24h before the next unearned milestone
  if (prefs.notif_milestone_approaching) {
    const next = SCHEDULED_MILESTONES.find(
      m => !earnedSet.has(m.type) && quitMs + m.days * 86400000 > now,
    );
    if (next) {
      const approachDate = new Date(quitMs + next.days * 86400000 - 86400000);
      if (approachDate.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Almost there!`,
            body: `Your ${next.label} milestone is just 24 hours away. Hold on.`,
            data: { screen: '/(tabs)/' },
          },
          trigger: androidTrigger({
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: approachDate,
          }) as any,
        });
      }
    }
  }

  // 3. Daily streak reminder — user-chosen hour (default 8 pm)
  if (prefs.notif_daily_streak) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `💪 Keep the streak alive`,
        body: `Every day counts. You're stronger than the urge.`,
        data: { screen: '/(tabs)/' },
      },
      trigger: androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: timeOverrides.streakHour ?? 20,
        minute: 0,
      }) as any,
    });
  }

  // 4. Daily check-in — user-chosen hour (default 9 am)
  if (prefs.notif_daily_checkin) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🌤 How are you feeling today?`,
        body: `Take a moment to log your mood and check in with yourself.`,
        data: { screen: '/(tabs)/' },
      },
      trigger: androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: timeOverrides.checkinHour ?? 9,
        minute: 0,
      }) as any,
    });
  }

  // 5. Weekly summary — Monday 9 am
  if (prefs.notif_weekly_summary) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📊 Your weekly summary`,
        body: `See how you did this week and keep building momentum.`,
        data: { screen: '/(tabs)/' },
      },
      trigger: androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // 1 = Sunday, 2 = Monday
        hour: 9,
        minute: 0,
      }) as any,
    });
  }

  // 6. Urge prediction — restore saved schedule (computed from urge journal patterns)
  if (prefs.notif_urge_prediction) {
    const saved = await AsyncStorage.getItem(URGE_PREDICTION_SCHEDULE_KEY);
    if (saved) {
      const { hour, minute } = JSON.parse(saved) as { hour: number; minute: number };
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🛡️ Your high-risk window is coming up`,
          body: `This is usually when urges hit hardest. Have your plan ready.`,
          data: { screen: '/(tabs)/urge' },
        },
        trigger: androidTrigger({
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        }) as any,
      });
    }
  }
}

export async function scheduleUrgePredictionNotification(
  entries: { created_at: string }[],
  prefs: NotifPrefs,
  isPremium: boolean,
): Promise<void> {
  if (!isPremium || !prefs.notif_urge_prediction || entries.length < 3) {
    await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY);
    return;
  }

  const hourCounts: Record<number, number> = {};
  for (const e of entries) {
    const h = new Date(e.created_at).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) { await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY); return; }
  const peakHour = parseInt(sorted[0][0], 10);
  if (isNaN(peakHour)) { await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY); return; }

  // 30 minutes before peak, wrapping past midnight
  const totalMinutes = ((peakHour * 60 - 30) + 1440) % 1440;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  await AsyncStorage.setItem(URGE_PREDICTION_SCHEDULE_KEY, JSON.stringify({ hour, minute }));

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🛡️ Your high-risk window is coming up`,
      body: `This is usually when urges hit hardest. Have your plan ready.`,
      data: { screen: '/(tabs)/urge' },
    },
    trigger: androidTrigger({
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    }) as any,
  });
}
