import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_SECRET')!;

interface MilestoneDef {
  days: number;
  badge: string;
  label: string;
  emoji: string;
  body: string;
}

// All milestones ≥ 1 day. Sub-day milestones (1h, 3h, 6h, 12h) are client-side only.
// Badge types use push_ prefix so they are independent of the milestone-email badges.
const MILESTONES: MilestoneDef[] = [
  { days: 1,    badge: 'push_1_day',     label: '1 day',     emoji: '🌱', body: 'One full day. A lot of people don\'t make it this far. You did.' },
  { days: 3,    badge: 'push_3_days',    label: '3 days',    emoji: '🌿', body: 'Three days clean. The hardest window. You\'re through it.' },
  { days: 5,    badge: 'push_5_days',    label: '5 days',    emoji: '🕊️', body: 'Five days. You\'ve made it through a full working week without gambling.' },
  { days: 7,    badge: 'push_1_week',    label: '1 week',    emoji: '⭐', body: 'A full week without gambling. That\'s a real achievement — keep going.' },
  { days: 10,   badge: 'push_10_days',   label: '10 days',   emoji: '✨', body: '10 days. Double digits. You\'re building something real here.' },
  { days: 14,   badge: 'push_2_weeks',   label: '2 weeks',   emoji: '🌙', body: 'Two weeks clean. The streak is real — protect it.' },
  { days: 21,   badge: 'push_3_weeks',   label: '3 weeks',   emoji: '💫', body: 'Three weeks. New habits take 21 days to form. Yours just did.' },
  { days: 30,   badge: 'push_1_month',   label: '1 month',   emoji: '🔥', body: 'One month. Your brain is literally rewiring itself right now.' },
  { days: 45,   badge: 'push_45_days',   label: '45 days',   emoji: '⚡', body: '45 days clean. You\'re more than halfway to 3 months.' },
  { days: 60,   badge: 'push_2_months',  label: '2 months',  emoji: '🏅', body: 'Two months. What started as willpower is becoming who you are.' },
  { days: 90,   badge: 'push_3_months',  label: '3 months',  emoji: '🎯', body: '90 days — research says this is when new habits truly take root. Yours have.' },
  { days: 100,  badge: 'push_100_days',  label: '100 days',  emoji: '💯', body: '100 days clean. Triple digits. This is no longer a streak — it\'s a new life.' },
  { days: 120,  badge: 'push_4_months',  label: '4 months',  emoji: '🌊', body: 'Four months. You\'ve proven to yourself that you can do this.' },
  { days: 150,  badge: 'push_5_months',  label: '5 months',  emoji: '🦋', body: 'Five months clean. Something has changed in you — and you know it.' },
  { days: 180,  badge: 'push_6_months',  label: '6 months',  emoji: '💎', body: 'Six months. Half a year of choosing yourself, every single day.' },
  { days: 200,  badge: 'push_200_days',  label: '200 days',  emoji: '🌈', body: '200 days. Most people never get here. You did.' },
  { days: 270,  badge: 'push_9_months',  label: '9 months',  emoji: '🌸', body: 'Nine months clean. You\'ve built a life without gambling — this is who you are now.' },
  { days: 365,  badge: 'push_1_year',    label: '1 year',    emoji: '🏆', body: 'One year. Think about where you were 365 days ago. Look where you are now.' },
  { days: 500,  badge: 'push_500_days',  label: '500 days',  emoji: '🔑', body: '500 days. You\'ve unlocked something most people never find.' },
  { days: 548,  badge: 'push_18_months', label: '18 months', emoji: '🦅', body: '18 months. You\'ve completely rewritten your story.' },
  { days: 730,  badge: 'push_2_years',   label: '2 years',   emoji: '👑', body: 'Two years clean. You\'re living proof that recovery is real.' },
  { days: 1000, badge: 'push_1000_days', label: '1000 days', emoji: '🎖️', body: '1000 days. One thousand days of choosing yourself. That\'s extraordinary.' },
  { days: 1095, badge: 'push_3_years',   label: '3 years',   emoji: '🌟', body: 'Three years. This is who you are now — and it\'s something to be proud of.' },
  { days: 1460, badge: 'push_4_years',   label: '4 years',   emoji: '🔱', body: 'Four years. You\'ve given yourself back something priceless.' },
  { days: 1825, badge: 'push_5_years',   label: '5 years',   emoji: '🦁', body: 'Five years clean. Extraordinary. Truly.' },
];

function parseQuitMs(ts: string | null, date: string | null): number {
  if (ts) {
    const iso = ts.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const ms = Date.parse(iso);
    if (!isNaN(ms)) return ms;
  }
  if (date) {
    const ms = Date.parse(date + 'T00:00:00Z');
    if (!isNaN(ms)) return ms;
  }
  return 0;
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: users, error } = await supabase
    .from('users')
    .select('id, display_name, quit_date, quit_timestamp, expo_push_token, notif_milestone')
    .not('expo_push_token', 'is', null)
    .not('quit_date', 'is', null)
    .neq('notif_milestone', false);

  if (error || !users) {
    console.error('Failed to fetch users:', error);
    return new Response(JSON.stringify({ error: 'failed to fetch users' }), { status: 500 });
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];
  const staleTokens: string[] = [];

  for (const user of users) {
    try {
      const quitMs = parseQuitMs(user.quit_timestamp, user.quit_date);
      if (!quitMs) { skipped++; continue; }

      const elapsed = Math.max(0, Date.now() - quitMs);

      // Find the milestone crossed within the last 24 hours
      const milestone = MILESTONES.find(m => {
        const msAtMilestone = m.days * 86_400_000;
        return elapsed >= msAtMilestone && (elapsed - 86_400_000) < msAtMilestone;
      });

      if (!milestone) { skipped++; continue; }

      // Dedup: skip if push already sent for this milestone
      const { data: existing } = await supabase
        .from('badges')
        .select('id')
        .eq('user_id', user.id)
        .eq('badge_type', milestone.badge)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const firstName = user.display_name?.split(' ')?.[0] || 'there';

      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.expo_push_token,
          sound: 'default',
          title: `${milestone.emoji} ${firstName}, ${milestone.label} milestone!`,
          body: milestone.body,
          data: { screen: '/(tabs)/' },
        }),
      });

      const pushBody = await pushRes.json();
      const result = pushBody?.data;

      if (result?.status === 'error') {
        if (result?.details?.error === 'DeviceNotRegistered') {
          // Stale token — clear it so we don't keep trying
          staleTokens.push(user.id);
          await supabase.from('users').update({ expo_push_token: null }).eq('id', user.id);
        } else {
          console.error(`Push error for ${user.id}:`, JSON.stringify(result));
          errors.push(`${user.id}: ${result?.message}`);
        }
        failed++;
        continue;
      }

      await supabase.from('badges').insert({ user_id: user.id, badge_type: milestone.badge });
      console.log(`Milestone push (${milestone.label}) sent to ${user.id}`);
      sent++;
    } catch (e) {
      console.error(`Error processing user ${user.id}:`, e);
      errors.push(String(e));
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ sent, skipped, failed, errors, stale_tokens_cleared: staleTokens.length }),
    { status: 200 },
  );
});
