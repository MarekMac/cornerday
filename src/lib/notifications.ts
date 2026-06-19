import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { URGE_PREDICTION_NOTIF_ID_KEY, URGE_PREDICTION_SCHEDULE_KEY, AI_CHECKIN_NOTIF_ID_KEY, CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY } from '../constants/storage-keys';

const STREAK_NOTIF_MESSAGES: { title: string; body: string }[] = [
  { title: '💪 Keep the streak alive',        body: 'Every day counts. You\'re stronger than the urge.' },
  { title: '🌅 Another day, another win',      body: 'You made it through today. That matters.' },
  { title: '🔥 Your streak is growing',        body: 'Each day you choose differently changes everything.' },
  { title: '🌱 Small steps, big change',       body: 'One more evening without gambling. You\'re doing it.' },
  { title: '💙 Check in with yourself',        body: 'How are you feeling tonight? Your streak is still going.' },
  { title: '⭐ You showed up today',           body: 'That\'s the whole game — just keep showing up.' },
  { title: '🛡️ Hold the line',                body: 'The urge passes. Your streak stays. Stay with it.' },
  { title: '🌙 End the day clean',             body: 'Almost there. Finish tonight strong.' },
  { title: '💎 You\'re building something real', body: 'Day by day. It adds up faster than you think.' },
  { title: '🏃 Keep moving forward',           body: 'You didn\'t come this far to only come this far.' },
  { title: '🌟 Tonight, choose you',           body: 'Not the bet. Not the rush. You.' },
  { title: '🤝 You\'re not alone',             body: 'Thousands of people are holding their streak tonight too.' },
  { title: '🧠 Your brain is healing',         body: 'Every clean day rewires the path. Keep going.' },
  { title: '💰 Think about what you\'re saving', body: 'Not just money — your time, your peace, yourself.' },
  { title: '🌊 Ride it out',                   body: 'If there\'s an urge tonight, it\'ll pass. It always does.' },
  { title: '🏆 Future you is grateful',        body: 'The you of tomorrow thanks the you of tonight.' },
  { title: '❤️ Someone\'s proud of you',       body: 'Even if you don\'t hear it enough — you\'re doing great.' },
  { title: '🎯 Stay on target',                body: 'One more day. That\'s all it is.' },
  { title: '✨ You made the right call today', body: 'Let tonight be proof that you can do this.' },
  { title: '🌙 Rest easy tonight',             body: 'You chose your future over your habit. Sleep well.' },
];

const CHECKIN_NOTIF_MESSAGES: { title: string; body: string }[] = [
  { title: '🌤 How are you feeling today?',       body: 'Take a moment to log your mood and check in with yourself.' },
  { title: '☀️ Good morning — how\'s today?',     body: 'A quick mood check-in keeps you honest with yourself.' },
  { title: '🌿 Start the day grounded',            body: 'How are you feeling right now? Log it and move forward.' },
  { title: '💭 A moment for you',                  body: 'Before the day gets busy — how are you really doing?' },
  { title: '🧘 Check in with yourself',            body: 'One tap. That\'s all it takes to track how you\'re going.' },
  { title: '🌅 New day, fresh start',              body: 'How\'s your mood this morning? Let CornerDay know.' },
  { title: '💙 How\'s your head today?',           body: 'Your recovery matters. Take 10 seconds to check in.' },
  { title: '🎯 Stay aware, stay ahead',            body: 'Noticing how you feel is the first step to staying in control.' },
  { title: '🌱 How are you growing today?',        body: 'Log your mood — it\'s part of building a stronger you.' },
  { title: '👋 Morning check-in time',             body: 'How are you feeling? Honest answers only.' },
  { title: '🔍 Quick self-check',                  body: 'Stressed? Calm? Somewhere in between? Log it.' },
  { title: '💪 You\'re still here',                body: 'That counts for a lot. How are you feeling today?' },
  { title: '🌻 How\'s your morning going?',        body: 'A mood check-in takes seconds and tells you a lot.' },
  { title: '🧠 Know your patterns',                body: 'Tracking your mood helps you spot triggers before they hit.' },
  { title: '❤️ Be honest with yourself',           body: 'Good day or tough one — log it. Both matter.' },
  { title: '🌊 Ride the waves',                    body: 'How\'s the sea this morning? Calm, choppy, or stormy?' },
  { title: '✅ Daily check-in',                    body: 'A few seconds now can save you a harder hour later.' },
  { title: '🏃 How are you showing up today?',     body: 'Check in and set the tone for the rest of the day.' },
  { title: '🌙 Good morning from CornerDay',       body: 'We\'re here. How are you doing today?' },
  { title: '⭐ You made it to another day',        body: 'How does it feel? Log your mood and keep the momentum.' },
];

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
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (_e) {
    // cancellation can fail if permissions were revoked — continue scheduling anyway
  }
  await AsyncStorage.removeItem(URGE_PREDICTION_NOTIF_ID_KEY);
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
    const streakMsg = STREAK_NOTIF_MESSAGES[Math.floor(Math.random() * STREAK_NOTIF_MESSAGES.length)];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: streakMsg.title,
        body: streakMsg.body,
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
    const checkinMsg = CHECKIN_NOTIF_MESSAGES[Math.floor(Math.random() * CHECKIN_NOTIF_MESSAGES.length)];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: checkinMsg.title,
        body: checkinMsg.body,
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

  // 6. Custom milestone — restore if set and in the future
  if (prefs.notif_milestone && quitTimestamp) {
    const milestoneRaw = await AsyncStorage.getItem(CUSTOM_MILESTONE_KEY);
    if (milestoneRaw) {
      try {
        const milestone = JSON.parse(milestoneRaw);
        if (milestone?.type === 'days' && typeof milestone.target === 'number') {
          const targetMs = new Date(quitTimestamp).getTime() + milestone.target * 86400000;
          if (targetMs > now) {
            const newId = await Notifications.scheduleNotificationAsync({
              content: {
                title: `🎯 ${milestone.target} Days Clean!`,
                body: `You hit your personal ${milestone.target}-day milestone. This is a huge achievement. Keep going! 🏆`,
                data: { type: 'custom_milestone' },
              },
              trigger: androidTrigger({
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(targetMs),
              }) as any,
            });
            await AsyncStorage.setItem(CUSTOM_MILESTONE_NOTIF_ID_KEY, newId);
          } else {
            await AsyncStorage.removeItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
          }
        }
      } catch { /* corrupt entry — leave as is */ }
    }
  }

  // 7. Urge prediction — restore saved schedule (computed from urge journal patterns)
  if (prefs.notif_urge_prediction) {
    const saved = await AsyncStorage.getItem(URGE_PREDICTION_SCHEDULE_KEY);
    if (saved) {
      let parsed: { hour: number; minute: number } | null = null;
      try { parsed = JSON.parse(saved); } catch {}
      if (!parsed || typeof parsed.hour !== 'number' || typeof parsed.minute !== 'number') {
        await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY);
        await AsyncStorage.removeItem(URGE_PREDICTION_NOTIF_ID_KEY);
        return;
      }
      const { hour, minute } = parsed;
      const restoredId = await Notifications.scheduleNotificationAsync({
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
      await AsyncStorage.setItem(URGE_PREDICTION_NOTIF_ID_KEY, restoredId);
    }
  }
}

export async function scheduleOnboardingCheckin(): Promise<void> {
  const prevId = await AsyncStorage.getItem(AI_CHECKIN_NOTIF_ID_KEY);
  if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Haven't seen you in a few days 👋",
        body: 'How are you holding up? CornerDay is here whenever you need it.',
        data: { type: 'ai_checkin' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 72 * 60 * 60, repeats: false },
    });
    if (id) await AsyncStorage.setItem(AI_CHECKIN_NOTIF_ID_KEY, id);
  } catch { /* permissions may not be granted — best effort */ }
}

async function cancelExistingUrgePredictionNotif() {
  const existingId = await AsyncStorage.getItem(URGE_PREDICTION_NOTIF_ID_KEY);
  if (existingId) {
    try { await Notifications.cancelScheduledNotificationAsync(existingId); } catch {}
    await AsyncStorage.removeItem(URGE_PREDICTION_NOTIF_ID_KEY);
  }
}

export async function scheduleUrgePredictionNotification(
  entries: { created_at: string }[],
  prefs: NotifPrefs,
  isPremium: boolean,
): Promise<void> {
  if (!isPremium || !prefs.notif_urge_prediction || entries.length < 3) {
    await cancelExistingUrgePredictionNotif();
    await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY);
    return;
  }

  const hourCounts: Record<number, number> = {};
  for (const e of entries) {
    const h = new Date(e.created_at).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const sorted = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) { await cancelExistingUrgePredictionNotif(); await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY); return; }
  const peakHour = parseInt(sorted[0][0], 10);
  if (isNaN(peakHour)) { await cancelExistingUrgePredictionNotif(); await AsyncStorage.removeItem(URGE_PREDICTION_SCHEDULE_KEY); return; }

  // 30 minutes before peak, wrapping past midnight
  const totalMinutes = ((peakHour * 60 - 30) + 1440) % 1440;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  // Cancel the previous notification before scheduling a replacement
  await cancelExistingUrgePredictionNotif();

  await AsyncStorage.setItem(URGE_PREDICTION_SCHEDULE_KEY, JSON.stringify({ hour, minute }));

  const newId = await Notifications.scheduleNotificationAsync({
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
  await AsyncStorage.setItem(URGE_PREDICTION_NOTIF_ID_KEY, newId);
}
