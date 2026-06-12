import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'CornerDay <onboarding@resend.dev>';

function jwtRole(authHeader: string): string | null {
  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  motivation: string | null;
  currency: string | null;
  quit_date: string | null;
  quit_timestamp: string | null;
  weekly_bet: string | null;
}

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

interface TimeDisplay {
  bigNumber: string;
  unit: string;
  detail: string;
  message: string;
  subjectLabel: string;
  totalDays: number;
}

function buildTimeDisplay(quitMs: number): TimeDisplay {
  const elapsed    = Math.max(0, Date.now() - quitMs);
  const totalMins  = Math.floor(elapsed / 60_000);
  const totalHours = Math.floor(elapsed / 3_600_000);
  const totalDays  = Math.floor(elapsed / 86_400_000);
  const totalWeeks  = Math.floor(totalDays / 7);
  const totalMonths = Math.floor(totalDays / 30.44);
  const totalYears  = Math.floor(totalDays / 365.25);

  const base = { totalDays };

  if (totalHours < 1) {
    const m = Math.max(1, totalMins);
    return { ...base, bigNumber: String(m), unit: `minute${m !== 1 ? 's' : ''}`, detail: 'clean', message: 'You started today. That\'s the hardest step.', subjectLabel: `${m} minute${m !== 1 ? 's' : ''}` };
  }
  if (totalHours < 24) {
    return { ...base, bigNumber: String(totalHours), unit: `hour${totalHours !== 1 ? 's' : ''}`, detail: 'clean', message: 'You started. That\'s the hardest part.', subjectLabel: `${totalHours} hour${totalHours !== 1 ? 's' : ''}` };
  }
  if (totalDays < 7) {
    const hrs = totalHours - totalDays * 24;
    const detail = hrs > 0 ? `${totalDays}d ${hrs}h` : `${totalDays} day${totalDays !== 1 ? 's' : ''}`;
    return { ...base, bigNumber: String(totalDays), unit: `day${totalDays !== 1 ? 's' : ''}`, detail: 'clean', message: `${detail} — every single one counts.`, subjectLabel: `${totalDays} day${totalDays !== 1 ? 's' : ''}` };
  }
  if (totalDays < 30) {
    const remDays = totalDays - totalWeeks * 7;
    const detail = remDays > 0 ? `${totalWeeks}w ${remDays}d` : `${totalWeeks} week${totalWeeks !== 1 ? 's' : ''}`;
    return { ...base, bigNumber: String(totalWeeks), unit: `week${totalWeeks !== 1 ? 's' : ''}`, detail: 'clean', message: `${detail} — one full week at a time.`, subjectLabel: `${totalWeeks} week${totalWeeks !== 1 ? 's' : ''}` };
  }
  if (totalDays < 365) {
    const remDays = totalDays - Math.floor(totalMonths) * 30;
    const detail = remDays > 3 ? `${totalMonths}mo ${remDays}d` : `${totalMonths} month${totalMonths !== 1 ? 's' : ''}`;
    return { ...base, bigNumber: String(totalMonths), unit: `month${totalMonths !== 1 ? 's' : ''}`, detail: 'clean', message: `${detail} — the hardest part is behind you.`, subjectLabel: `${totalMonths} month${totalMonths !== 1 ? 's' : ''}` };
  }
  const remMonths = totalMonths - totalYears * 12;
  const detail = remMonths > 0 ? `${totalYears}y ${remMonths}mo` : `${totalYears} year${totalYears !== 1 ? 's' : ''}`;
  return { ...base, bigNumber: String(totalYears), unit: `year${totalYears !== 1 ? 's' : ''}`, detail: 'clean', message: `${detail} — that's extraordinary.`, subjectLabel: `${totalYears} year${totalYears !== 1 ? 's' : ''}` };
}

interface Milestone { label: string; days: number; }
const MILESTONES: Milestone[] = [
  { label: '1 day',    days: 1   },
  { label: '1 week',   days: 7   },
  { label: '1 month',  days: 30  },
  { label: '60 days',  days: 60  },
  { label: '6 months', days: 182 },
  { label: '1 year',   days: 365 },
  { label: '2 years',  days: 730 },
];

function nextMilestone(elapsedMs: number): { label: string; timeLeft: string; pct: number } | null {
  const elapsedDays = elapsedMs / 86_400_000;
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    if (elapsedDays < m.days) {
      const prevDays = i > 0 ? MILESTONES[i - 1].days : 0;
      const pct = Math.min(100, Math.max(0, Math.round(((elapsedDays - prevDays) / (m.days - prevDays)) * 100)));
      const msLeft = (m.days - elapsedDays) * 86_400_000;
      const hoursLeft = Math.ceil(msLeft / 3_600_000);
      const daysLeft  = Math.ceil(msLeft / 86_400_000);
      const timeLeft  = hoursLeft < 24 ? `${hoursLeft}h to go` : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} to go`;
      return { label: m.label, timeLeft, pct };
    }
  }
  return null;
}

function moodLabel(avg: number | null): { emoji: string; text: string } {
  if (avg === null) return { emoji: '—', text: 'No check-ins' };
  if (avg >= 4.2) return { emoji: '😄', text: 'Great week' };
  if (avg >= 3.5) return { emoji: '😊', text: 'Good week' };
  if (avg >= 2.5) return { emoji: '😐', text: 'Getting through it' };
  if (avg >= 1.5) return { emoji: '😕', text: 'Difficult week' };
  return { emoji: '😔', text: 'Tough week' };
}

function motivationLabel(key: string | null): string {
  const map: Record<string, string> = { family: 'My family', finances: 'Financial freedom', mental_health: 'My mental health', saving: 'Saving for something', better_self: 'Becoming my best self' };
  return key ? (map[key] ?? key) : 'Your recovery';
}

function triggerLabel(key: string | null): string {
  const map: Record<string, string> = { betting_ads: 'Betting ads', live_sport: 'Live sport', social: 'Social pressure', stress: 'Stress', boredom: 'Boredom', financial: 'Financial pressure' };
  return key ? (map[key] ?? key) : 'Unknown';
}

function fmtCurrency(amount: number, currency: string): string {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  const sym = syms[currency] ?? `${currency} `;
  return `${sym}${Math.round(amount).toLocaleString('en')}`;
}

function fmtDate(ts: string | null, date: string | null): string {
  const ms = parseQuitMs(ts, date);
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseWeeklyBet(raw: string | null): number | null {
  if (!raw) return null;
  const rangeMatch = raw.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function topTrigger(entries: { trigger: string }[]): string | null {
  if (!entries.length) return null;
  const counts: Record<string, number> = {};
  for (const e of entries) {
    if (e.trigger) counts[e.trigger] = (counts[e.trigger] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? triggerLabel(top[0]) : null;
}

const STAT = 'background:#e6f7f7;border-radius:12px;padding:16px;text-align:center;vertical-align:top;';
const GAP  = 'width:4%;';

function statCell(big: string, label: string, sub: string): string {
  return `<td width="48%" style="${STAT}">
    <div style="font-size:26px;font-weight:900;color:#0F6E6E;line-height:1.15;margin-bottom:4px;">${big}</div>
    <div style="font-size:13px;font-weight:700;color:#0F6E6E;">${label}</div>
    <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">${sub}</div>
  </td>`;
}

function buildHtml(p: {
  displayName: string;
  quitTs: string | null;
  quitDate: string | null;
  quitMs: number;
  longestStreak: number;
  resetCount: number;
  moodAvg: number | null;
  moodCheckins: number;
  urgesResisted: number;
  urgesTotal: number;
  urgesAllTime: number;
  topTriggerThisWeek: string | null;
  totalPaid: number;
  totalDebt: number;
  motivation: string | null;
  currency: string;
  weeklyBet: number | null;
}): string {
  const { displayName, quitTs, quitDate, quitMs, longestStreak, resetCount, moodAvg, moodCheckins,
          urgesResisted, urgesTotal, urgesAllTime, topTriggerThisWeek,
          totalPaid, totalDebt, motivation, currency, weeklyBet } = p;

  const time        = buildTimeDisplay(quitMs);
  const mood        = moodLabel(moodAvg);
  const firstName   = displayName.split(' ')[0] || 'there';
  const whyLabel    = motivationLabel(motivation);
  const startedDate = fmtDate(quitTs, quitDate);
  const elapsed     = Math.max(0, Date.now() - quitMs);
  const totalSaved  = weeklyBet !== null ? weeklyBet * (elapsed / (7 * 86_400_000)) : null;

  // Row 1: mood | best streak / check-ins
  const row1Right = longestStreak > time.totalDays
    ? statCell(String(longestStreak), 'day best streak', 'Your record')
    : statCell(String(moodCheckins), `check-in${moodCheckins !== 1 ? 's' : ''}`, 'This week');

  // Row 2: urges | money not gambled
  const urgeRate   = urgesTotal > 0 ? Math.round((urgesResisted / urgesTotal) * 100) : null;
  const moneySaved = weeklyBet !== null ? fmtCurrency(weeklyBet, currency) : null;

  const row2Left = urgesTotal > 0
    ? statCell(
        `${urgesResisted}<span style="font-size:15px;font-weight:600;color:#5a8a8a;">/${urgesTotal}</span>`,
        'urges beaten',
        urgeRate !== null ? `${urgeRate}% this week` : 'This week',
      )
    : statCell('—', 'no urges logged', 'Quiet week 🙌');

  const row2Right = moneySaved !== null
    ? statCell(moneySaved, 'not gambled', 'Estimated this week')
    : statCell(String(time.totalDays), `day${time.totalDays !== 1 ? 's' : ''}`, 'In recovery');

  // Row 3: started date | reset count
  const resetLabel = resetCount === 0 ? 'First attempt 💪' : `${resetCount} reset${resetCount !== 1 ? 's' : ''}`;
  const resetSub   = resetCount === 0 ? 'No resets yet' : 'Keep going — each restart counts';
  const row3Left  = statCell(startedDate, 'current streak started', '');
  const row3Right = statCell(String(resetCount), resetLabel, resetSub);

  // Row 4: total saved since quit | all-time urges beaten
  const totalSavedFmt = totalSaved !== null ? fmtCurrency(totalSaved, currency) : null;
  const showRow4 = totalSavedFmt !== null || urgesAllTime > 0;
  const row4Left = totalSavedFmt !== null
    ? statCell(totalSavedFmt, 'saved since you quit', 'Based on your weekly bet')
    : statCell('—', '', '');
  const row4Right = statCell(String(urgesAllTime), `urge${urgesAllTime !== 1 ? 's' : ''} beaten`, 'All time');

  // Next milestone bar
  const milestone = nextMilestone(elapsed);
  const milestoneBlock = milestone ? `
    <tr><td colspan="3" style="height:12px;"></td></tr>
    <tr><td colspan="3" style="background:#e6f7f7;border-radius:12px;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Next milestone — ${milestone.label}</div>
      <div style="background:#c8e8e8;border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:#0F6E6E;height:100%;width:${milestone.pct}%;border-radius:4px;"></div>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
        <td style="font-size:12px;color:#5a8a8a;">${milestone.pct}% there</td>
        <td align="right" style="font-size:12px;color:#5a8a8a;">${milestone.timeLeft}</td>
      </tr></table>
    </td></tr>` : '';

  // Debt block
  const paidFmt = fmtCurrency(totalPaid, currency);
  const debtFmt = fmtCurrency(totalDebt, currency);
  const pct     = totalDebt > 0 ? Math.min(Math.round((totalPaid / totalDebt) * 100), 100) : null;
  const debtBlock = totalDebt > 0 ? `
    <tr><td colspan="3" style="height:12px;"></td></tr>
    <tr><td colspan="3" style="background:#f5ece4;border-radius:12px;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#a0522d;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Debt recovery</div>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><span style="font-size:22px;font-weight:900;color:#0F6E6E;">${paidFmt}</span>&nbsp;<span style="font-size:13px;color:#888;">paid back</span></td>
        <td align="right" style="font-size:13px;color:#888;">of ${debtFmt}</td>
      </tr></table>
      ${pct !== null ? `
      <div style="background:#ddd;border-radius:4px;height:6px;margin-top:10px;overflow:hidden;">
        <div style="background:#0F6E6E;height:100%;width:${pct}%;border-radius:4px;"></div>
      </div>
      <div style="font-size:12px;color:#888;margin-top:6px;">${pct}% recovered</div>` : ''}
    </td></tr>` : '';

  // Top trigger callout
  const triggerBlock = topTriggerThisWeek ? `
    <tr><td colspan="3" style="height:12px;"></td></tr>
    <tr><td colspan="3" style="background:#fff8f0;border-radius:12px;padding:14px 16px;border-left:3px solid #e07b39;">
      <div style="font-size:11px;font-weight:700;color:#c0622b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Top trigger this week</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${topTriggerThisWeek}</div>
      <div style="font-size:12px;color:#888;margin-top:3px;">Knowing your patterns is half the battle.</div>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your week in recovery</title>
</head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:36px 28px 32px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:8px;">CornerDay</div>
    <div style="font-size:14px;opacity:0.8;margin-bottom:22px;">Hi ${firstName} — here's your week</div>
    <div style="font-size:88px;font-weight:900;line-height:1;color:#fff;">${time.bigNumber}</div>
    <div style="font-size:20px;font-weight:600;margin-top:8px;color:rgba(255,255,255,0.9);">${time.unit} ${time.detail}</div>
    <div style="font-size:13px;margin-top:12px;color:rgba(255,255,255,0.7);font-style:italic;">${time.message}</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:24px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <!-- Row 1: mood | best streak / check-ins -->
    <tr>
      <td width="48%" style="${STAT}">
        <div style="font-size:32px;margin-bottom:4px;">${mood.emoji}</div>
        <div style="font-size:13px;font-weight:700;color:#0F6E6E;">${mood.text}</div>
        <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">Mood this week</div>
      </td>
      <td style="${GAP}"></td>
      ${row1Right}
    </tr>

    <!-- Row 2: urges | money not gambled -->
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr>
      ${row2Left}
      <td style="${GAP}"></td>
      ${row2Right}
    </tr>

    <!-- Row 3: started date | resets -->
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr>
      ${row3Left}
      <td style="${GAP}"></td>
      ${row3Right}
    </tr>

    <!-- Row 4: total saved | all-time urges (conditional) -->
    ${showRow4 ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr>
      ${row4Left}
      <td style="${GAP}"></td>
      ${row4Right}
    </tr>` : ''}

    ${milestoneBlock}
    ${debtBlock}
    ${triggerBlock}

    <!-- Spacer -->
    <tr><td colspan="3" style="height:20px;"></td></tr>

    <!-- Your why -->
    <tr><td colspan="3" style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${whyLabel}</div>
    </td></tr>

    <tr><td colspan="3" style="height:24px;"></td></tr>

    <!-- Footer -->
    <tr><td colspan="3" style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      You're getting this because weekly summaries are on.<br>
      To turn them off: <strong>Account → Notifications → Weekly summary</strong>
    </td></tr>

  </table>
  </td></tr>

  <tr><td style="height:24px;"></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (jwtRole(auth) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, display_name, motivation, currency, quit_date, quit_timestamp, weekly_bet')
    .eq('notif_weekly_summary', true)
    .not('email', 'is', null)
    .not('quit_date', 'is', null);

  if (usersError || !users) {
    console.error('Failed to fetch users:', usersError);
    return new Response(JSON.stringify({ error: 'failed to fetch users' }), { status: 500 });
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (const user of users as UserRow[]) {
    try {
      const [
        streakRes, moodRes, urgeWeekRes, urgeAllTimeRes,
        resetRes, debtRes, paymentRes,
      ] = await Promise.all([
        supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', user.id).maybeSingle(),
        supabase.from('mood_checkins').select('mood').eq('user_id', user.id).gte('created_at', weekAgoIso),
        supabase.from('urge_journal').select('outcome, trigger').eq('user_id', user.id).gte('created_at', weekAgoIso),
        supabase.from('urge_journal').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('outcome', 'overcame'),
        supabase.from('losses').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('type', 'streak_reset'),
        supabase.from('debts').select('total_amount').eq('user_id', user.id),
        supabase.from('debt_payments').select('amount').eq('user_id', user.id),
      ]);

      const longestStreak  = streakRes.data?.longest_streak ?? 0;
      const moods          = (moodRes.data ?? []) as { mood: number }[];
      const moodAvg        = moods.length > 0 ? moods.reduce((s, m) => s + m.mood, 0) / moods.length : null;
      const urgeWeek       = (urgeWeekRes.data ?? []) as { outcome: string; trigger: string }[];
      const urgesResisted  = urgeWeek.filter(u => u.outcome === 'overcame').length;
      const urgesTotal     = urgeWeek.length;
      const urgesAllTime   = urgeAllTimeRes.count ?? 0;
      const resetCount     = resetRes.count ?? 0;
      const totalDebt      = ((debtRes.data ?? []) as { total_amount: number }[]).reduce((s, d) => s + d.total_amount, 0);
      const totalPaid      = ((paymentRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + p.amount, 0);

      const quitMs    = parseQuitMs(user.quit_timestamp, user.quit_date);
      const weeklyBet = parseWeeklyBet(user.weekly_bet);
      const time      = buildTimeDisplay(quitMs);

      const html = buildHtml({
        displayName: user.display_name || 'there',
        quitTs: user.quit_timestamp,
        quitDate: user.quit_date,
        quitMs,
        longestStreak,
        resetCount,
        moodAvg,
        moodCheckins: moods.length,
        urgesResisted,
        urgesTotal,
        urgesAllTime,
        topTriggerThisWeek: topTrigger(urgeWeek),
        totalPaid,
        totalDebt,
        motivation: user.motivation,
        currency: user.currency ?? 'USD',
        weeklyBet,
      });

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [user.email],
          subject: `Your week in recovery — ${time.subjectLabel} clean`,
          html,
        }),
      });

      if (!emailRes.ok) {
        const body = await emailRes.text();
        throw new Error(`Resend ${emailRes.status}: ${body}`);
      }

      sent++;
      console.log(`Sent to ${user.id}`);
    } catch (err) {
      console.error(`Failed for ${user.id}:`, err);
      errors.push(`${user.id}: ${String(err)}`);
      failed++;
    }
  }

  console.log(`Weekly digest complete — sent: ${sent}, failed: ${failed}`);
  return new Response(JSON.stringify({ sent, failed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
