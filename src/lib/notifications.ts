import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { URGE_PREDICTION_NOTIF_ID_KEY, URGE_PREDICTION_SCHEDULE_KEY, AI_CHECKIN_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_IDS_KEY, CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY } from '../constants/storage-keys';

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

const WEEKLY_NOTIF_MESSAGES: { title: string; body: string }[] = [
  { title: '📊 Your weekly summary',              body: 'See how you did this week and keep building momentum.' },
  { title: '📅 Week in review',                   body: 'Another week in the books. Check in and see your progress.' },
  { title: '🌟 How was your week?',               body: 'Take a look at what you\'ve built — one week at a time.' },
  { title: '💪 Seven more days behind you',       body: 'Every week clean is a week that changes your life. See the numbers.' },
  { title: '📈 Your progress is adding up',       body: 'Check this week\'s summary — you might surprise yourself.' },
  { title: '🏆 Weekly check-in',                  body: 'How did this week go? Your recovery journey is right here.' },
  { title: '🌱 Growing week by week',             body: 'Another week of choosing differently. See where you stand.' },
  { title: '🔍 Reflect on your week',             body: 'A moment to look back helps you move forward stronger.' },
  { title: '✅ Week complete',                    body: 'You made it through another week. Here\'s how it looked.' },
  { title: '💙 Check in with your progress',      body: 'Your weekly summary is ready — small wins make big changes.' },
  { title: '🎯 Week by week, step by step',       body: 'See your mood, your streak, and your recovery this week.' },
  { title: '🌅 New week starts now',              body: 'Before you move forward — take stock of where you\'ve been.' },
  { title: '🔥 Keep the momentum going',          body: 'See what last week looked like and carry it into this one.' },
  { title: '💰 Look what you\'re building',       body: 'Your weekly summary shows more than numbers — it shows you changing.' },
  { title: '🧠 Awareness builds recovery',        body: 'Your weekly patterns are here. Understanding them is half the battle.' },
  { title: '⭐ Seven days of choices',            body: 'Each one mattered. Your summary is ready.' },
  { title: '🌊 Steady progress',                  body: 'Week after week. Check in and see the trend going your way.' },
  { title: '❤️ You\'re doing better than you think', body: 'Open your weekly summary and see for yourself.' },
  { title: '🏃 Don\'t stop now',                  body: 'Another week done. See the stats, feel the momentum, keep going.' },
  { title: '🌻 Your week, your wins',             body: 'Big or small — every clean day this week counts. See the summary.' },
];

const URGE_PREDICTION_MESSAGES: { title: string; body: string }[] = [
  { title: '🛡️ Your high-risk window is coming up',  body: 'This is usually when urges hit hardest. Have your plan ready.' },
  { title: '⚠️ Heads up — this is your risk window', body: 'You\'ve logged urges around this time before. Stay sharp.' },
  { title: '🧠 Know your patterns',                   body: 'Your data shows this hour can be tough. You\'re ready for it.' },
  { title: '💪 Brace yourself — you\'ve got this',   body: 'Your high-risk window is near. Open the urge screen if you need it.' },
  { title: '🌊 A wave might be coming',               body: 'This is your peak urge window. Ride it out — it always passes.' },
  { title: '🛑 Pause before you act',                 body: 'If an urge hits in the next hour, remember: you\'ve beaten this before.' },
  { title: '🔔 Your urge window is near',             body: 'Plan ahead. What will you do if the urge shows up today?' },
  { title: '🎯 Stay focused right now',               body: 'This time of day is your toughest. You already know how to handle it.' },
  { title: '🌿 Ground yourself',                      body: 'Your risk window is approaching. Take a breath and stay present.' },
  { title: '💙 You\'ve beaten this hour before',      body: 'Your pattern shows this is hard — but you\'ve always come through.' },
  { title: '🛡️ Defence mode: on',                    body: 'Your high-risk window starts soon. Urge screen is one tap away.' },
  { title: '⏰ This is the hour to watch',            body: 'Your history says urges peak around now. Stay with your plan.' },
  { title: '🧘 Stay with yourself',                   body: 'Your high-risk time is near. Don\'t go anywhere that tests you.' },
  { title: '🌙 Hold it together',                     body: 'This is usually when it gets hard. You know what to do.' },
  { title: '🔥 Don\'t let this hour win',             body: 'Your data flagged this window. Stay close to your why.' },
  { title: '❤️ Check in before the urge does',        body: 'Open CornerDay now — better to prepare than to react.' },
  { title: '🏃 Keep moving through it',               body: 'Your risk window is here. A walk, a call, a game — pick one.' },
  { title: '⭐ You\'ve handled this before',          body: 'Same window, same choice. You already know you can do it.' },
  { title: '🌊 Ride it out, don\'t give in',          body: 'Urges peak and pass in minutes. Stay the course.' },
  { title: '🎯 One hour at a time',                   body: 'This is your toughest window. Get through this hour and you\'re free.' },
];

export interface NotifPrefs {
  notif_milestone: boolean;
  notif_daily_streak: boolean;
  notif_daily_checkin: boolean;
  notif_weekly_summary: boolean;
  notif_milestone_approaching: boolean;
  notif_urge_prediction: boolean;
  notif_community: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  notif_milestone: true,
  notif_daily_streak: true,
  notif_daily_checkin: false,
  notif_weekly_summary: false,
  notif_milestone_approaching: false,
  notif_urge_prediction: false,
  notif_community: true,
};

const SCHEDULED_MILESTONES = [
  { type: '1_hour',    days: 1/24,  emoji: '⏰', label: '1 Hour',     body: 'The first hour is the hardest. You did it — keep building.',                                              approachBody: 'Your first hour milestone is almost here. Hold tight.' },
  { type: '3_hours',   days: 3/24,  emoji: '🌤️', label: '3 Hours',    body: 'Three hours clean. Every hour you hold on rewires something.',                                           approachBody: '3 Hours is nearly here. You\'re doing it.' },
  { type: '6_hours',   days: 6/24,  emoji: '☀️', label: '6 Hours',    body: 'Six hours clean. Most people don\'t make it this far on day one. You did.',                              approachBody: 'Almost at 6 hours. Keep going — you\'re nearly there.' },
  { type: '12_hours',  days: 12/24, emoji: '🌗', label: '12 Hours',   body: 'Half a day clean. You\'re proving to yourself this is possible.',                                        approachBody: '12 hours is one sleep away. Protect the rest of tonight.' },
  { type: '1_day',     days: 1,     emoji: '🌱', label: '1 Day',      body: 'One full day without gambling. That\'s not small — that\'s everything right now.',                       approachBody: 'In 24 hours you\'ll have your first full day clean. Protect tonight.' },
  { type: '3_days',    days: 3,     emoji: '🌿', label: '3 Days',     body: 'Three days. The hardest part is behind you. Your brain is already starting to reset.',                   approachBody: 'Three days is 24 hours away. Don\'t stop now — you\'re almost there.' },
  { type: '1_week',    days: 7,     emoji: '⭐', label: '1 Week',     body: 'One week clean. Seven days of choosing yourself over the habit. That matters.',                          approachBody: 'Your 1 Week badge is 24 hours away. One more day — you\'ve got this.' },
  { type: '10_days',   days: 10,    emoji: '✨', label: '10 Days',    body: 'Ten days. Double digits. You\'re building real momentum now.',                                           approachBody: 'Ten days is one day away. You\'re so close to double digits.' },
  { type: '2_weeks',   days: 14,    emoji: '🌙', label: '2 Weeks',    body: 'Two weeks clean. You\'ve broken the daily cycle. Keep that going.',                                      approachBody: 'Two weeks clean is almost here. One more sleep.' },
  { type: '3_weeks',   days: 21,    emoji: '💫', label: '3 Weeks',    body: 'Three weeks. You\'ve outlasted the toughest cravings. The next phase is yours.',                         approachBody: 'Your 3 Week milestone is 24 hours away. Keep holding the line.' },
  { type: '1_month',   days: 30,    emoji: '🔥', label: '1 Month',    body: 'One month. 30 days of showing up for yourself. That\'s a life-changing number.',                         approachBody: 'Tomorrow you hit one month clean. That\'s worth protecting. Hold on tonight.' },
  { type: '45_days',   days: 45,    emoji: '⚡', label: '45 Days',    body: '45 days clean. You\'re past the point where most people quit trying. You didn\'t.',                      approachBody: '45 days is one day away. You\'re in rare territory now.' },
  { type: '2_months',  days: 60,    emoji: '🏅', label: '2 Months',   body: 'Two months. The version of you that started this journey would be proud.',                               approachBody: 'Two months is 24 hours away. Almost there — keep your guard up.' },
  { type: '3_months',  days: 90,    emoji: '🎯', label: '3 Months',   body: 'Three months clean. A full quarter of a year — your recovery is real now.',                              approachBody: 'Three months clean starts tomorrow. Don\'t let anything get in the way tonight.' },
  { type: '4_months',  days: 120,   emoji: '🌊', label: '4 Months',   body: 'Four months. The urges are quieter now, aren\'t they? That\'s what this looks like.',                   approachBody: 'Four months is almost yours. One more day of choosing right.' },
  { type: '5_months',  days: 150,   emoji: '🦋', label: '5 Months',   body: 'Five months. Most habits take 66 days to break — you\'ve more than doubled that.',                      approachBody: 'Five months clean is 24 hours away. The finish line is visible.' },
  { type: '6_months',  days: 180,   emoji: '💎', label: '6 Months',   body: 'Half a year clean. This is the kind of milestone that changes how you see yourself.',                    approachBody: 'Half a year clean starts tomorrow. You\'re about to cross a major line.' },
  { type: '9_months',  days: 270,   emoji: '🌸', label: '9 Months',   body: 'Nine months. You\'ve been building a new life longer than most people keep a resolution.',               approachBody: 'Nine months is 24 hours away. You\'ve earned this.' },
  { type: '1_year',    days: 365,   emoji: '🏆', label: '1 Year',     body: 'One year. 365 days of choosing differently. You are not who you were — you\'re stronger.',               approachBody: 'Tomorrow you hit one year clean. One more day. The most important one you\'ve had.' },
  { type: '18_months', days: 548,   emoji: '🦅', label: '18 Months',  body: 'Eighteen months clean. This isn\'t a streak anymore — it\'s who you are.',                              approachBody: '18 months clean is one day away. You\'ve built something real.' },
  { type: '2_years',   days: 730,   emoji: '👑', label: '2 Years',    body: 'Two years. You\'ve proven that the person you became is the real one.',                                  approachBody: 'Two years is 24 hours away. Almost everything changes from here.' },
  { type: '3_years',   days: 1095,  emoji: '🌟', label: '3 Years',    body: 'Three years clean. Most people never get here. You did the work.',                                       approachBody: 'Three years clean starts tomorrow. Let that sink in.' },
  { type: '4_years',   days: 1460,  emoji: '🔱', label: '4 Years',    body: 'Four years. Think about everything that\'s changed because of this one decision.',                       approachBody: 'Four years is one day away. You\'ve changed your life completely.' },
  { type: '5_years',   days: 1825,  emoji: '🦁', label: '5 Years',    body: 'Five years. You didn\'t just stop gambling — you built a completely different life.',                    approachBody: 'Tomorrow you hit five years clean. Rest up — tomorrow is huge.' },
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
          body: m.body,
          data: { screen: '/(tabs)?scrollTo=badges' },
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
            title: `⏰ Almost there — ${next.label} tomorrow!`,
            body: next.approachBody,
            data: { screen: '/(tabs)?scrollTo=badges' },
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
    const weeklyMsg = WEEKLY_NOTIF_MESSAGES[Math.floor(Math.random() * WEEKLY_NOTIF_MESSAGES.length)];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: weeklyMsg.title,
        body: weeklyMsg.body,
        data: { screen: '/analytics' },
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
                data: { type: 'custom_milestone', screen: '/(tabs)/' },
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
      const urgeRestoreMsg = URGE_PREDICTION_MESSAGES[Math.floor(Math.random() * URGE_PREDICTION_MESSAGES.length)];
      const restoredId = await Notifications.scheduleNotificationAsync({
        content: {
          title: urgeRestoreMsg.title,
          body: urgeRestoreMsg.body,
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

const REENGAGEMENT_SCHEDULE: { seconds: number; title: string; body: string }[] = [
  {
    seconds: 3 * 24 * 60 * 60,
    title: "Haven't seen you in a few days 👋",
    body: 'How are you holding up? CornerDay is here whenever you need it.',
  },
  {
    seconds: 5 * 24 * 60 * 60,
    title: "We've missed you 💙",
    body: "5 days is a long time. Whatever's going on, we're here — no judgement, just support.",
  },
  {
    seconds: 14 * 24 * 60 * 60,
    title: "It's been a couple of weeks 🌱",
    body: "Recovery isn't always a straight line. Come back whenever you're ready — your progress is waiting.",
  },
  {
    seconds: 30 * 24 * 60 * 60,
    title: "A month — we haven't forgotten you 🤍",
    body: "Whenever you're ready to come back, CornerDay will be here. No questions asked.",
  },
];

export async function scheduleOnboardingCheckin(): Promise<void> {
  // Cancel any previously scheduled re-engagement notifications
  const prevId = await AsyncStorage.getItem(AI_CHECKIN_NOTIF_ID_KEY);
  if (prevId) await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});
  const prevIdsRaw = await AsyncStorage.getItem(AI_CHECKIN_NOTIF_IDS_KEY);
  if (prevIdsRaw) {
    try {
      const ids: string[] = JSON.parse(prevIdsRaw);
      await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    } catch {}
  }

  try {
    const ids: string[] = [];
    for (const s of REENGAGEMENT_SCHEDULE) {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: s.title, body: s.body, data: { type: 'ai_checkin' } },
        trigger: androidTrigger({ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: s.seconds, repeats: false }) as any,
      });
      if (id) ids.push(id);
    }
    await AsyncStorage.setItem(AI_CHECKIN_NOTIF_IDS_KEY, JSON.stringify(ids));
    await AsyncStorage.removeItem(AI_CHECKIN_NOTIF_ID_KEY);
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

  const urgeMsg = URGE_PREDICTION_MESSAGES[Math.floor(Math.random() * URGE_PREDICTION_MESSAGES.length)];
  const newId = await Notifications.scheduleNotificationAsync({
    content: {
      title: urgeMsg.title,
      body: urgeMsg.body,
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
