import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { URGE_PREDICTION_NOTIF_ID_KEY, URGE_PREDICTION_SCHEDULE_KEY, AI_CHECKIN_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_IDS_KEY, CUSTOM_MILESTONE_KEY, CUSTOM_MILESTONE_NOTIF_ID_KEY } from '../constants/storage-keys';

const DAILY_REMINDER_MESSAGES: { title: string; body: string }[] = [
  { title: '🌙 Evening check-in',              body: 'How are you feeling tonight? Log your mood and keep the streak going.' },
  { title: '💪 Keep the streak alive',         body: 'Take a second to check in with yourself before the day ends.' },
  { title: '🌅 You made it through today',     body: 'How are you feeling? Log it and lock in the win.' },
  { title: '💙 Check in with yourself',        body: 'How\'s your head tonight? Your streak is still going strong.' },
  { title: '⭐ You showed up today',           body: 'That\'s the whole game. Log your mood and keep going.' },
  { title: '🧘 A moment before bed',           body: 'How are you feeling? A quick check-in keeps you honest.' },
  { title: '🌊 Ride it out',                   body: 'If there\'s an urge tonight, check in and let it pass.' },
  { title: '🔥 Your streak is growing',        body: 'Log tonight\'s mood and watch the momentum build.' },
  { title: '🌱 Small steps, big change',       body: 'One more evening without gambling. How are you feeling?' },
  { title: '🎯 Stay on target',                body: 'Quick mood check-in, then rest easy tonight.' },
  { title: '🌟 Tonight, choose you',           body: 'Not the bet. Not the rush. Check in and see how far you\'ve come.' },
  { title: '🧠 Your brain is healing',         body: 'Log your mood tonight and watch the pattern change.' },
  { title: '💎 You\'re building something real', body: 'Check in and see today added to the streak.' },
  { title: '🏆 Future you is grateful',        body: 'Log tonight\'s mood before you rest.' },
  { title: '❤️ Someone\'s proud of you',       body: 'Check in with yourself — how are you really doing tonight?' },
  { title: '🌙 End the day clean',             body: 'Log your mood, then finish tonight strong.' },
  { title: '✅ Daily check-in',                body: 'A few seconds now, a streak that keeps growing.' },
  { title: '🤝 You\'re not alone',             body: 'Thousands of people are checking in tonight too.' },
  { title: '🌻 How was today?',                body: 'Log your mood and keep the streak alive.' },
  { title: '💰 Think about what you\'re saving', body: 'Check in tonight, and remember why you started.' },
  { title: '🕯️ Wind down tonight',             body: 'Log your mood and let today\'s win settle in.' },
  { title: '🌆 Evening arrives, so does the choice', body: 'Check in and mark another day down.' },
  { title: '🫂 You\'re doing better than you think', body: 'A quick check-in proves it, one day at a time.' },
  { title: '🪞 Look back at today',            body: 'How\'d it go? Log it before you rest.' },
  { title: '☕ One more thing before bed',      body: 'A 10-second check-in keeps the streak alive.' },
  { title: '🧭 Staying the course',            body: 'Log tonight\'s mood and keep pointed the right way.' },
  { title: '🍃 Let today go',                  body: 'Check in, breathe out, and carry the streak into tomorrow.' },
  { title: '🕊️ Peace over the pull',           body: 'Log how you\'re feeling and rest easy.' },
  { title: '🌌 Another night, another win',    body: 'Quick check-in before you close the day.' },
  { title: '🧗 You\'re climbing, not falling', body: 'Log your mood and keep the streak intact.' },
  { title: '🚦 Green light to rest',           body: 'Check in first, then let tonight be easy.' },
  { title: '🔑 You held the line today',       body: 'Log it. That\'s how the streak stays yours.' },
  { title: '🪁 Let the day settle',            body: 'A moment to check in before you switch off.' },
  { title: '🎗️ Proof you\'re still trying',    body: 'And that\'s everything. Log tonight\'s mood.' },
  { title: '🌺 Bloom where you\'re planted',   body: 'Check in, keep growing, keep the streak.' },
  { title: '🦋 Change is quiet like this',     body: 'One evening check-in at a time.' },
  { title: '🎐 Let today\'s noise go',         body: 'Check in, then rest with a clear head.' },
  { title: '🧊 Cool down, check in',           body: 'The urge loses power the calmer you get tonight.' },
  { title: '🌉 You crossed another day',       body: 'Log your mood and take the win.' },
  { title: '🕰️ Same time, same you',           body: 'Showing up again tonight. Check in.' },
  { title: '🌰 Small daily deposits',          body: 'Tonight\'s check-in adds to something bigger.' },
  { title: '🧣 Wrap up the day right',         body: 'A mood log and a streak that holds.' },
  { title: '🪴 Tending to yourself',           body: 'Check in tonight, the way you\'d tend anything worth keeping.' },
  { title: '🌦 Whatever today looked like',    body: 'Log it honestly and keep moving.' },
  { title: '🎇 Another quiet win',             body: 'Nobody has to see it but you. Check in.' },
  { title: '🧶 Threads add up to something',   body: 'Tonight\'s check-in is one more thread.' },
  { title: '🛶 Steady hands tonight',          body: 'Log your mood and keep paddling forward.' },
  { title: '🌵 Even on the hard days',         body: 'Check in. Especially on the hard days.' },
  { title: '🪔 Light one more evening',        body: 'You made it through. Log how it felt.' },
  { title: '🍂 Let the day fall away',         body: 'Check in, then let tonight be still.' },
  { title: '🌒 Hold steady',                   body: 'Log your mood and protect what you\'ve built today.' },
  { title: '🧺 Set today down',                body: 'A quick check-in, then rest.' },
  { title: '🪟 A clear view tonight',          body: 'How do things look from here? Log it.' },
  { title: '🌀 Slow the spin',                 body: 'Check in and let the day settle before sleep.' },
  { title: '🪨 Solid ground tonight',          body: 'Log your mood, the streak\'s still standing.' },
  { title: '🎈 Light after a heavy day',       body: 'Or a good one. Either way, check in.' },
  { title: '🌾 Harvest today\'s effort',       body: 'Log it before it\'s gone.' },
  { title: '🪄 A little ritual',               body: 'Check in, then let tonight be yours.' },
  { title: '🌗 Half the work is showing up',   body: 'You did. Log it.' },
  { title: '🧿 Protect the streak',            body: 'One honest check-in at a time.' },
];

// How many days of individually-dated reminders to keep queued at once.
// Not a single repeating DAILY trigger — expo-notifications repeats the same
// fixed content forever on a DAILY trigger, which would show the same
// message every day between reschedules. Scheduling a rolling window of
// one-off DATE notifications (like SCHEDULED_MILESTONES below) instead lets
// each day pull a different, non-repeating message from the pool. Kept
// short (not all 60 days at once) to stay well under iOS's 64-pending-local-
// notification cap alongside milestones/weekly/urge-prediction/etc. The
// window is refreshed on every reschedule — app launch, a settings toggle,
// hour change, or relapse reset — so it doesn't run dry for anyone using the
// app at least every couple of weeks.
const DAILY_REMINDER_WINDOW_DAYS = 14;

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  notif_weekly_summary: boolean;
  notif_milestone_approaching: boolean;
  notif_urge_prediction: boolean;
  notif_community: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  notif_milestone: true,
  notif_daily_streak: true,
  notif_weekly_summary: false,
  notif_milestone_approaching: false,
  notif_urge_prediction: false,
  notif_community: true,
};

const SCHEDULED_MILESTONES = [
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
    handleNotification: async () => {
      const inForeground = AppState.currentState === 'active';
      return {
        shouldShowBanner: !inForeground,
        shouldShowList: !inForeground,
        shouldPlaySound: !inForeground,
        shouldSetBadge: false,
      };
    },
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

// Each call does cancelAll-then-reschedule-everything. Two overlapping calls
// (e.g. a user flipping two notification switches in quick succession) would
// otherwise interleave — both cancel (the second a no-op), then both schedule
// their own full job list from whatever prefs snapshot they closed over,
// leaving duplicate notifications. Chain calls onto this promise so they run
// one at a time instead.
let scheduleQueue: Promise<void> = Promise.resolve();

export function scheduleAllNotifications(
  prefs: NotifPrefs,
  quitTimestamp: string | null,
  earnedBadgeTypes: string[] = [],
  timeOverrides: { streakHour?: number } = {},
): Promise<void> {
  const run = () => scheduleAllNotificationsImpl(prefs, quitTimestamp, earnedBadgeTypes, timeOverrides);
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

// Account deletion/sign-out need to cancel every scheduled notification as
// the definitive last word — but a direct cancelAllScheduledNotificationsAsync()
// call bypasses scheduleQueue entirely, so a scheduling call already in
// flight (e.g. a notification-preference toggle's await chain) can complete
// AFTER it and re-add notifications for an account that's already gone.
// Routing the cancel through the same queue guarantees it runs after
// anything already queued, and nothing queued afterward can undo it.
export function cancelAllNotifications(): Promise<void> {
  const run = async () => { try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (_e) {} };
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

async function scheduleAllNotificationsImpl(
  prefs: NotifPrefs,
  quitTimestamp: string | null,
  earnedBadgeTypes: string[] = [],
  timeOverrides: { streakHour?: number } = {},
) {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  if (!quitTimestamp) {
    try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (_e) {}
    await AsyncStorage.removeItem(URGE_PREDICTION_NOTIF_ID_KEY);
    return;
  }

  const quitMs = new Date(quitTimestamp).getTime();
  const now = Date.now();
  const earnedSet = new Set(earnedBadgeTypes);

  // Pre-fetch AsyncStorage values needed to build the full schedule before cancelling
  const [milestoneRaw, urgeSavedRaw] = await Promise.all([
    prefs.notif_milestone ? AsyncStorage.getItem(CUSTOM_MILESTONE_KEY) : Promise.resolve(null),
    prefs.notif_urge_prediction ? AsyncStorage.getItem(URGE_PREDICTION_SCHEDULE_KEY) : Promise.resolve(null),
  ]);

  // Build all schedule jobs as thunks so we can cancel first, then fire them all
  const scheduleJobs: Array<() => Promise<void>> = [];

  // 1. Milestone reached — scheduled at the exact future time each milestone is hit
  if (prefs.notif_milestone) {
    for (const m of SCHEDULED_MILESTONES) {
      const fireAt = quitMs + m.days * 86400000;
      if (fireAt <= now) continue;       // already passed
      if (earnedSet.has(m.type)) continue; // already earned
      const content = {
        title: `${m.emoji} ${m.label} milestone!`,
        body: m.body,
        data: { type: 'milestone', screen: '/(tabs)?scrollTo=badges' },
      };
      const trigger = androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
      }) as any;
      scheduleJobs.push(() => Notifications.scheduleNotificationAsync({ content, trigger }).then(() => {}));
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
        const content = {
          title: `⏰ Almost there — ${next.label} tomorrow!`,
          body: next.approachBody,
          data: { type: 'milestone', screen: '/(tabs)?scrollTo=badges' },
        };
        const trigger = androidTrigger({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: approachDate,
        }) as any;
        scheduleJobs.push(() => Notifications.scheduleNotificationAsync({ content, trigger }).then(() => {}));
      }
    }
  }

  // 3. Daily reminder (streak encouragement + mood check-in prompt) — rolling
  // window of individually-dated notifications, user-chosen hour (default 8 pm).
  // See DAILY_REMINDER_WINDOW_DAYS above for why this isn't a single DAILY trigger.
  if (prefs.notif_daily_streak) {
    const hour = timeOverrides.streakHour ?? 20;
    const startDate = new Date();
    startDate.setHours(hour, 0, 0, 0);
    if (startDate.getTime() <= now) startDate.setDate(startDate.getDate() + 1);
    const pool = shuffled(DAILY_REMINDER_MESSAGES).slice(0, DAILY_REMINDER_WINDOW_DAYS);
    for (let i = 0; i < pool.length; i++) {
      const fireDate = new Date(startDate);
      fireDate.setDate(fireDate.getDate() + i);
      const msg = pool[i];
      const content = {
        title: msg.title,
        body: msg.body,
        data: { screen: '/(tabs)?checkin=true' },
      };
      const trigger = androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      }) as any;
      scheduleJobs.push(() => Notifications.scheduleNotificationAsync({ content, trigger }).then(() => {}));
    }
  }

  // 4. Weekly summary — Monday 9 am
  if (prefs.notif_weekly_summary) {
    const weeklyMsg = WEEKLY_NOTIF_MESSAGES[Math.floor(Math.random() * WEEKLY_NOTIF_MESSAGES.length)];
    const content = {
      title: weeklyMsg.title,
      body: weeklyMsg.body,
      data: { screen: '/analytics' },
    };
    const trigger = androidTrigger({
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // 1 = Sunday, 2 = Monday
      hour: 9,
      minute: 0,
    }) as any;
    scheduleJobs.push(() => Notifications.scheduleNotificationAsync({ content, trigger }).then(() => {}));
  }

  // 5. Custom milestone — restore if set and in the future
  if (prefs.notif_milestone && milestoneRaw) {
    try {
      const milestone = JSON.parse(milestoneRaw);
      if (milestone?.type === 'days' && typeof milestone.target === 'number') {
        const targetMs = new Date(quitTimestamp).getTime() + milestone.target * 86400000;
        if (targetMs > now) {
          const content = {
            title: `🎯 ${milestone.target} Days Clean!`,
            body: `You hit your personal ${milestone.target}-day milestone. This is a huge achievement. Keep going! 🏆`,
            data: { type: 'milestone', screen: '/(tabs)/' },
          };
          const trigger = androidTrigger({
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(targetMs),
          }) as any;
          scheduleJobs.push(() =>
            Notifications.scheduleNotificationAsync({ content, trigger }).then(newId =>
              AsyncStorage.setItem(CUSTOM_MILESTONE_NOTIF_ID_KEY, newId),
            ),
          );
        } else {
          await AsyncStorage.removeItem(CUSTOM_MILESTONE_NOTIF_ID_KEY);
        }
      }
    } catch { /* corrupt entry — leave as is */ }
  }

  // 6. Urge prediction — restore saved schedule (computed from urge journal patterns)
  if (prefs.notif_urge_prediction && urgeSavedRaw) {
    let parsed: { hour: number; minute: number } | null = null;
    try { parsed = JSON.parse(urgeSavedRaw); } catch {}
    if (!parsed || typeof parsed.hour !== 'number' || typeof parsed.minute !== 'number') {
      await AsyncStorage.multiRemove([URGE_PREDICTION_SCHEDULE_KEY, URGE_PREDICTION_NOTIF_ID_KEY]);
    } else {
      const { hour, minute } = parsed;
      const urgeRestoreMsg = URGE_PREDICTION_MESSAGES[Math.floor(Math.random() * URGE_PREDICTION_MESSAGES.length)];
      const content = {
        title: urgeRestoreMsg.title,
        body: urgeRestoreMsg.body,
        data: { screen: '/(tabs)/urge' },
      };
      const trigger = androidTrigger({
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      }) as any;
      scheduleJobs.push(() =>
        Notifications.scheduleNotificationAsync({ content, trigger }).then(restoredId =>
          AsyncStorage.setItem(URGE_PREDICTION_NOTIF_ID_KEY, restoredId),
        ),
      );
    }
  }

  // Cancel existing notifications only after all jobs are prepared, then schedule.
  // Clear the urge prediction ID BEFORE cancelAll so a concurrent
  // scheduleUrgePredictionNotification can't write a new ID that we then delete.
  await AsyncStorage.removeItem(URGE_PREDICTION_NOTIF_ID_KEY);
  // cancelAllScheduledNotificationsAsync wipes every OS-scheduled notification,
  // including the re-engagement ones from scheduleOnboardingCheckin — clear their
  // tracking keys too, otherwise scheduleOnboardingCheckin (always called right
  // after this function) sees stale ids and skips rescheduling, permanently
  // killing the 3/5/14/30-day win-back notifications after the next call.
  await AsyncStorage.multiRemove([AI_CHECKIN_NOTIF_ID_KEY, AI_CHECKIN_NOTIF_IDS_KEY]);
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (_e) {
    // cancellation can fail if permissions were revoked — continue scheduling anyway
  }
  await Promise.allSettled(scheduleJobs.map(job => job()));
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

// Routed through the same scheduleQueue as scheduleAllNotifications (not
// just serialized against its own other calls) — this function's
// scheduleNotificationAsync calls used to be able to run concurrently with
// scheduleAllNotificationsImpl's cancelAllScheduledNotificationsAsync(),
// which could cancel a re-engagement notification this function had just
// created a moment before this function got a chance to record its ID,
// silently and permanently losing it (scheduleOnboardingCheckin only
// reschedules when its AsyncStorage key is empty, and by then it wouldn't be).
export function scheduleOnboardingCheckin(): Promise<void> {
  const run = () => scheduleOnboardingCheckinImpl();
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

async function scheduleOnboardingCheckinImpl(): Promise<void> {
  // Skip if already scheduled — calling this on every launch would reset the countdown,
  // meaning users who open the app daily would never receive re-engagement notifications.
  // Keys are cleared on relapse/reset so a fresh schedule fires correctly after a restart.
  const existingIdsRaw = await AsyncStorage.getItem(AI_CHECKIN_NOTIF_IDS_KEY);
  if (existingIdsRaw) {
    try {
      const ids: string[] = JSON.parse(existingIdsRaw);
      if (ids.length > 0) return;
    } catch {}
  }

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

// Same reasoning as scheduleOnboardingCheckin above — routed through the
// shared scheduleQueue so it can't race scheduleAllNotificationsImpl's
// cancelAllScheduledNotificationsAsync() and have its own newly-created
// notification silently cancelled out from under it.
export function scheduleUrgePredictionNotification(
  entries: { created_at: string }[],
  prefs: NotifPrefs,
  isPremium: boolean,
): Promise<void> {
  const run = () => scheduleUrgePredictionNotificationImpl(entries, prefs, isPremium);
  scheduleQueue = scheduleQueue.then(run, run);
  return scheduleQueue;
}

async function scheduleUrgePredictionNotificationImpl(
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
  try {
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
  } catch (e) {
    console.warn('[notifications] scheduleUrgePredictionNotification error:', e);
  }
}
