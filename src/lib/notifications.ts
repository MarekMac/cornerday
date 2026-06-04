import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface NotifPrefs {
  notif_milestone: boolean;
  notif_daily_streak: boolean;
  notif_daily_checkin: boolean;
  notif_weekly_summary: boolean;
  notif_milestone_approaching: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  notif_milestone: true,
  notif_daily_streak: true,
  notif_daily_checkin: false,
  notif_weekly_summary: false,
  notif_milestone_approaching: false,
};

const MILESTONE_DAYS = [
  1 / 24, 1, 3, 7, 10, 14, 21, 30, 45, 60, 90,
  120, 150, 180, 270, 365, 548, 730, 1095, 1460, 1825,
];

function milestoneLabel(days: number): string {
  if (days < 1) return '1 hour';
  const labels: Record<number, string> = {
    1: '1 day', 3: '3 days', 7: '1 week', 10: '10 days', 14: '2 weeks',
    21: '3 weeks', 30: '1 month', 45: '45 days', 60: '2 months', 90: '3 months',
    120: '4 months', 150: '5 months', 180: '6 months', 270: '9 months',
    365: '1 year', 548: '18 months', 730: '2 years', 1095: '3 years',
    1460: '4 years', 1825: '5 years',
  };
  return labels[days] ?? `${days} days`;
}

const CHANNEL_ID = 'cornerday';

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
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
) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!quitTimestamp) return;

  const quitMs = new Date(quitTimestamp).getTime();
  const now = Date.now();

  // 1. Milestone reached — next 15 future milestones
  if (prefs.notif_milestone) {
    const future = MILESTONE_DAYS
      .filter(d => quitMs + d * 86400000 > now)
      .slice(0, 15);
    for (const days of future) {
      const label = milestoneLabel(days);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🏆 ${label} milestone!`,
          body: `You've been clean for ${label}. That's a real achievement — keep going.`,
        },
        trigger: androidTrigger({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(quitMs + days * 86400000),
        }) as any,
      });
    }
  }

  // 2. Milestone approaching — 24 h before next milestone
  if (prefs.notif_milestone_approaching) {
    const next = MILESTONE_DAYS.find(d => quitMs + d * 86400000 > now);
    if (next) {
      const approachDate = new Date(quitMs + next * 86400000 - 86400000);
      if (approachDate.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Almost there!`,
            body: `Your ${milestoneLabel(next)} milestone is just 24 hours away. Hold on.`,
          },
          trigger: androidTrigger({
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: approachDate,
          }) as any,
        });
      }
    }
  }

  // 3. Daily streak reminder — 8 pm every day
  if (prefs.notif_daily_streak) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `💪 Keep the streak alive`,
        body: `Every day counts. You're stronger than the urge.`,
      },
      trigger: androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      }) as any,
    });
  }

  // 4. Daily check-in — 9 am every day
  if (prefs.notif_daily_checkin) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🌤 How are you feeling today?`,
        body: `Take a moment to log your mood and check in with yourself.`,
      },
      trigger: androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
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
      },
      trigger: androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // 1 = Sunday, 2 = Monday
        hour: 9,
        minute: 0,
      }) as any,
    });
  }
}
