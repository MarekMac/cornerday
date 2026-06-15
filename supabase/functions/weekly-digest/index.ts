import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);


interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  motivation: string | null;
  currency: string | null;
  quit_date: string | null;
  quit_timestamp: string | null;
  weekly_bet: string | null;
  is_premium: boolean;
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

const MILESTONES = [
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
      const msLeft   = (m.days - elapsedDays) * 86_400_000;
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
  if (avg >= 4.2) return { emoji: '&#x1F604;', text: 'Great week' };
  if (avg >= 3.5) return { emoji: '&#x1F60A;', text: 'Good week' };
  if (avg >= 2.5) return { emoji: '&#x1F610;', text: 'Getting through it' };
  if (avg >= 1.5) return { emoji: '&#x1F615;', text: 'Difficult week' };
  return { emoji: '&#x1F614;', text: 'Tough week' };
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
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'z&#322;', AUD: 'A$', CAD: 'C$' };
  return `${syms[currency] ?? currency + ' '}${Math.round(amount).toLocaleString('en')}`;
}

function fmtDate(ts: string | null, date: string | null): string {
  const ms = parseQuitMs(ts, date);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseWeeklyBet(raw: string | null): number | null {
  if (!raw) return null;
  const rangeMatch = raw.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (rangeMatch) return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? null : num;
}

function computeCheckinStreak(rows: { created_at: string }[]): number {
  const unique = [...new Set(rows.map(r => new Date(r.created_at).toISOString().slice(0, 10)))]
    .sort().reverse();
  if (unique.length === 0) return 0;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterStr = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (unique[0] !== todayStr && unique[0] !== yesterStr) return 0;
  let count = 0;
  let d = new Date(unique[0] + 'T00:00:00Z');
  for (const dateStr of unique) {
    if (dateStr === d.toISOString().slice(0, 10)) { count++; d = new Date(d.getTime() - 86_400_000); }
    else break;
  }
  return count;
}

function topTrigger(entries: { trigger: string }[]): string | null {
  if (!entries.length) return null;
  const counts: Record<string, number> = {};
  for (const e of entries) { if (e.trigger) counts[e.trigger] = (counts[e.trigger] ?? 0) + 1; }
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

function moodTrend(thisWeek: number | null, lastWeek: number | null): string {
  if (thisWeek === null || lastWeek === null) return '';
  const diff = thisWeek - lastWeek;
  if (diff > 0.3)  return ' <span style="color:#2ecc71;font-size:12px;">&#x2191; up from last week</span>';
  if (diff < -0.3) return ' <span style="color:#e74c3c;font-size:12px;">&#x2193; down from last week</span>';
  return ' <span style="color:#888;font-size:12px;">&#x2194; stable</span>';
}

// ─── FREE EMAIL ─────────────────────────────────────────────────────────────

function buildFreeHtml(p: {
  firstName: string; whyLabel: string; time: TimeDisplay;
  moodAvg: number | null; moodCheckins: number;
  totalPaid: number; totalDebt: number; currency: string;
  elapsed: number;
}): string {
  const { firstName, whyLabel, time, moodAvg, moodCheckins, totalPaid, totalDebt, currency, elapsed } = p;
  const mood      = moodLabel(moodAvg);
  const milestone = nextMilestone(elapsed);

  const milestoneBlock = milestone ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
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

  const pct = totalDebt > 0 ? Math.min(Math.round((totalPaid / totalDebt) * 100), 100) : null;
  const debtBlock = totalDebt > 0 ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#f5ece4;border-radius:12px;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#a0522d;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Debt recovery</div>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><span style="font-size:22px;font-weight:900;color:#0F6E6E;">${fmtCurrency(totalPaid, currency)}</span>&nbsp;<span style="font-size:13px;color:#888;">paid back</span></td>
        <td align="right" style="font-size:13px;color:#888;">of ${fmtCurrency(totalDebt, currency)}</td>
      </tr></table>
      ${pct !== null ? `
      <div style="background:#ddd;border-radius:4px;height:6px;margin-top:10px;overflow:hidden;">
        <div style="background:#0F6E6E;height:100%;width:${pct}%;border-radius:4px;"></div>
      </div>
      <div style="font-size:12px;color:#888;margin-top:6px;">${pct}% recovered</div>` : ''}
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your week in recovery</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:36px 28px 32px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:8px;">CornerDay</div>
    <div style="font-size:14px;opacity:0.8;margin-bottom:22px;">Hi ${firstName} — here's your week</div>
    <div style="font-size:88px;font-weight:900;line-height:1;color:#fff;">${time.bigNumber}</div>
    <div style="font-size:20px;font-weight:600;margin-top:8px;color:rgba(255,255,255,0.9);">${time.unit} ${time.detail}</div>
    <div style="font-size:13px;margin-top:12px;color:rgba(255,255,255,0.7);font-style:italic;">${time.message}</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:24px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr>
      <td width="48%" style="${STAT}">
        <div style="font-size:32px;margin-bottom:4px;">${mood.emoji}</div>
        <div style="font-size:13px;font-weight:700;color:#0F6E6E;">${mood.text}</div>
        <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">Mood this week</div>
      </td>
      <td style="${GAP}"></td>
      ${statCell(String(moodCheckins), `check-in${moodCheckins !== 1 ? 's' : ''}`, 'This week')}
    </tr>

    ${milestoneBlock}
    ${debtBlock}

    <tr><td colspan="3" style="height:20px;"></td></tr>

    <tr><td colspan="3" style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${whyLabel}</div>
    </td></tr>

    <tr><td colspan="3" style="height:24px;"></td></tr>

    <tr><td colspan="3" style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      Premium members see mood trends, urge patterns and debt projections in their digest.<br><br>
      You're getting this because weekly summaries are on.<br>
      To turn them off: <strong>Settings &#x2192; Notifications</strong>
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

// ─── PREMIUM EMAIL ───────────────────────────────────────────────────────────

function fmtMonthYear(addMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + addMonths);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function cmpArrow(a: number | null, b: number | null, higherIsBetter = true): string {
  if (a === null || b === null) return '<span style="color:#bbb;">—</span>';
  const diff = a - b;
  if (Math.abs(diff) < 0.05) return '<span style="color:#888;">&#x2194;</span>';
  const up = diff > 0;
  const good = higherIsBetter ? up : !up;
  const color = good ? '#2ecc71' : '#e74c3c';
  return `<span style="color:${color};">${up ? '&#x2191;' : '&#x2193;'}</span>`;
}

function buildPremiumHtml(p: {
  firstName: string; whyLabel: string; time: TimeDisplay;
  moodAvg: number | null; lastWeekMoodAvg: number | null;
  moodCheckins: number; lastWeekCheckins: number;
  checkins30d: number;
  urgesResisted: number; urgesTotal: number;
  lastWeekUrgesTotal: number;
  urgesAllTime: number;
  lastUrgeDate: string | null;
  topTriggerThisWeek: string | null;
  totalPaid: number; totalDebt: number; thisWeekPayments: number;
  firstPaymentDate: string | null; currency: string;
  weeklyBet: number | null;
  longestStreak: number; resetCount: number;
  quitTs: string | null; quitDate: string | null;
  elapsed: number;
  checkinStreak: number;
}): string {
  const {
    firstName, whyLabel, time,
    moodAvg, lastWeekMoodAvg, moodCheckins, lastWeekCheckins, checkins30d,
    urgesResisted, urgesTotal, lastWeekUrgesTotal, urgesAllTime,
    lastUrgeDate, topTriggerThisWeek,
    totalPaid, totalDebt, thisWeekPayments, firstPaymentDate, currency,
    weeklyBet, longestStreak, resetCount, quitTs, quitDate, elapsed, checkinStreak,
  } = p;

  const mood      = moodLabel(moodAvg);
  const milestone = nextMilestone(elapsed);

  // Urge stats
  const urgeRate = urgesTotal > 0 ? Math.round((urgesResisted / urgesTotal) * 100) : null;
  const urgeRateColor = urgeRate === null ? '#888' : urgeRate >= 75 ? '#2ecc71' : urgeRate >= 50 ? '#f39c12' : '#e74c3c';

  // Days since last urge
  const daysSinceUrge = lastUrgeDate
    ? Math.floor((Date.now() - Date.parse(lastUrgeDate)) / 86_400_000)
    : null;

  // Checkin consistency (last 30 days)
  const consistencyPct = Math.min(100, Math.round((checkins30d / 30) * 100));
  const consistencyColor = consistencyPct >= 70 ? '#2ecc71' : consistencyPct >= 40 ? '#f39c12' : '#e74c3c';

  // Debt calculations
  const remaining = Math.max(0, totalDebt - totalPaid);
  const debtPct = totalDebt > 0 ? Math.min(Math.round((totalPaid / totalDebt) * 100), 100) : null;

  let monthlyRate: number | null = null;
  let debtFreeLabel = '';
  let debtFreeDate  = '';
  if (firstPaymentDate && totalPaid > 0) {
    const monthsSinceFirst = Math.max(1, (Date.now() - Date.parse(firstPaymentDate)) / (30.44 * 86_400_000));
    monthlyRate = totalPaid / monthsSinceFirst;
    if (monthlyRate > 0 && remaining > 0) {
      const months = Math.ceil(remaining / monthlyRate);
      debtFreeLabel = months <= 24
        ? `~${months} month${months !== 1 ? 's' : ''}`
        : `~${Math.ceil(months / 12)} year${Math.ceil(months / 12) !== 1 ? 's' : ''}`;
      debtFreeDate = fmtMonthYear(months);
    } else if (remaining === 0) {
      debtFreeLabel = 'Cleared!';
    }
  }

  // Money not gambled
  const totalSaved = weeklyBet !== null ? weeklyBet * (elapsed / (7 * 86_400_000)) : null;

  // Streak info
  const startedDate = fmtDate(quitTs, quitDate);
  const resetLabel  = resetCount === 0 ? 'No resets &#x1F4AA;' : `${resetCount} reset${resetCount !== 1 ? 's' : ''}`;

  // ── Blocks ────────────────────────────────────────────────

  const milestoneBlock = milestone ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
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

  // Week-over-week comparison table
  const moodAvgFmt      = moodAvg !== null ? moodAvg.toFixed(1) : '—';
  const lastMoodAvgFmt  = lastWeekMoodAvg !== null ? lastWeekMoodAvg.toFixed(1) : '—';
  const compareBlock = `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#f9fdfd;border-radius:12px;padding:14px 16px;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">This week vs last week</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="font-size:11px;color:#aaa;">
          <td style="padding-bottom:6px;"></td>
          <td align="center" style="padding-bottom:6px;">Last week</td>
          <td align="center" style="padding-bottom:6px;">This week</td>
          <td align="right" style="padding-bottom:6px;"></td>
        </tr>
        <tr style="border-top:1px solid #eee;">
          <td style="font-size:13px;color:#555;padding:7px 0;">Mood avg</td>
          <td align="center" style="font-size:13px;color:#888;">${lastMoodAvgFmt}</td>
          <td align="center" style="font-size:13px;font-weight:700;color:#1a1a1a;">${moodAvgFmt}</td>
          <td align="right">${cmpArrow(moodAvg, lastWeekMoodAvg)}</td>
        </tr>
        <tr style="border-top:1px solid #eee;">
          <td style="font-size:13px;color:#555;padding:7px 0;">Urges</td>
          <td align="center" style="font-size:13px;color:#888;">${lastWeekUrgesTotal}</td>
          <td align="center" style="font-size:13px;font-weight:700;color:#1a1a1a;">${urgesTotal}</td>
          <td align="right">${cmpArrow(urgesTotal, lastWeekUrgesTotal, false)}</td>
        </tr>
        <tr style="border-top:1px solid #eee;">
          <td style="font-size:13px;color:#555;padding:7px 0;">Check-ins</td>
          <td align="center" style="font-size:13px;color:#888;">${lastWeekCheckins}</td>
          <td align="center" style="font-size:13px;font-weight:700;color:#1a1a1a;">${moodCheckins}</td>
          <td align="right">${cmpArrow(moodCheckins, lastWeekCheckins)}</td>
        </tr>
      </table>
    </td></tr>`;

  // 30-day check-in consistency
  const consistencyBlock = `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#f9fdfd;border-radius:12px;padding:14px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;">Check-in habit (30 days)</td>
        <td align="right" style="font-size:18px;font-weight:900;color:${consistencyColor};">${consistencyPct}%</td>
      </tr></table>
      <div style="background:#e0eded;border-radius:4px;height:6px;margin-top:8px;overflow:hidden;">
        <div style="background:${consistencyColor};height:100%;width:${consistencyPct}%;border-radius:4px;"></div>
      </div>
      <div style="font-size:12px;color:#888;margin-top:6px;">${checkins30d} of 30 days — ${consistencyPct >= 70 ? 'strong habit forming' : consistencyPct >= 40 ? 'keep building' : 'try to check in daily'}</div>
    </td></tr>`;

  // Days since last urge
  const urgeStreakBlock = daysSinceUrge !== null && daysSinceUrge > 0 ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#f0fff4;border-radius:12px;padding:14px 16px;border-left:3px solid #2ecc71;">
      <div style="font-size:11px;font-weight:700;color:#27ae60;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Urge-free streak</div>
      <div style="font-size:22px;font-weight:900;color:#27ae60;">${daysSinceUrge} day${daysSinceUrge !== 1 ? 's' : ''} since last urge</div>
      <div style="font-size:12px;color:#888;margin-top:3px;">Every urge-free day rewires your brain.</div>
    </td></tr>` : '';

  // Financial recovery block
  const debtBlock = totalDebt > 0 ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#f5ece4;border-radius:12px;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#a0522d;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Financial recovery</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:0 4px;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Paid back</div>
            <div style="font-size:18px;font-weight:900;color:#0F6E6E;">${fmtCurrency(totalPaid, currency)}</div>
          </td>
          <td style="text-align:center;padding:0 4px;border-left:1px solid #e8d8cc;border-right:1px solid #e8d8cc;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Still owed</div>
            <div style="font-size:18px;font-weight:900;color:${remaining > 0 ? '#c0392b' : '#0F6E6E'};">${fmtCurrency(remaining, currency)}</div>
          </td>
          <td style="text-align:center;padding:0 4px;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">This week</div>
            <div style="font-size:18px;font-weight:900;color:#0F6E6E;">${thisWeekPayments > 0 ? fmtCurrency(thisWeekPayments, currency) : '—'}</div>
          </td>
        </tr>
      </table>
      ${debtPct !== null ? `
      <div style="background:#ddd;border-radius:4px;height:6px;margin-top:14px;overflow:hidden;">
        <div style="background:#0F6E6E;height:100%;width:${debtPct}%;border-radius:4px;"></div>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
        <td style="font-size:12px;color:#888;">${debtPct}% recovered</td>
        <td align="right" style="font-size:12px;color:#888;">of ${fmtCurrency(totalDebt, currency)} total</td>
      </tr></table>` : ''}
      ${monthlyRate !== null ? `
      <div style="background:#ede8e0;border-radius:8px;padding:10px 12px;margin-top:10px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:12px;color:#777;">Monthly avg payment</td>
          <td align="right" style="font-size:13px;font-weight:700;color:#0F6E6E;">${fmtCurrency(monthlyRate, currency)}/mo</td>
        </tr></table>
      </div>
      ${debtFreeDate && debtPct !== null ? `
      <div style="background:#0F6E6E;border-radius:10px;padding:14px 16px;margin-top:8px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">&#x1F3C1; Projected debt-free</div>
        <div style="font-size:22px;font-weight:900;color:#fff;line-height:1.2;">${debtFreeDate}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">${debtFreeLabel} from now at current pace</div>
        <div style="background:rgba(255,255,255,0.25);border-radius:4px;height:6px;margin-top:12px;overflow:hidden;">
          <div style="background:#fff;height:100%;width:${debtPct}%;border-radius:4px;"></div>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:5px;">${debtPct}% repaid so far</div>
      </div>` : ''}
      ` : (totalDebt > 0 && totalPaid === 0 ? `<div style="font-size:12px;color:#888;margin-top:10px;">Log your first payment to unlock your debt-free projection.</div>` : '')}
    </td></tr>` : '';

  // Top trigger callout
  const triggerBlock = topTriggerThisWeek ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#fff8f0;border-radius:12px;padding:14px 16px;border-left:3px solid #e07b39;">
      <div style="font-size:11px;font-weight:700;color:#c0622b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Top trigger this week</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${topTriggerThisWeek}</div>
      <div style="font-size:12px;color:#888;margin-top:3px;">Knowing your pattern is half the battle.</div>
    </td></tr>` : '';

  // Money not gambled
  const savedBlock = totalSaved !== null ? `
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr><td colspan="3" style="background:#e6f7f7;border-radius:12px;padding:14px 16px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Money not gambled since you quit</div>
      <div style="font-size:28px;font-weight:900;color:#0F6E6E;">${fmtCurrency(totalSaved, currency)}</div>
      <div style="font-size:12px;color:#5a8a8a;margin-top:4px;">Based on ${fmtCurrency(weeklyBet!, currency)}/week average</div>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your weekly report</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:36px 28px 32px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:8px;">CornerDay Premium</div>
    <div style="font-size:14px;opacity:0.8;margin-bottom:22px;">Hi ${firstName} — your full weekly report</div>
    <div style="font-size:88px;font-weight:900;line-height:1;color:#fff;">${time.bigNumber}</div>
    <div style="font-size:20px;font-weight:600;margin-top:8px;color:rgba(255,255,255,0.9);">${time.unit} ${time.detail}</div>
    <div style="font-size:13px;margin-top:12px;color:rgba(255,255,255,0.7);font-style:italic;">${time.message}</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:24px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <!-- Streak row -->
    <tr>
      ${statCell(String(time.totalDays), `day${time.totalDays !== 1 ? 's' : ''} clean`, startedDate)}
      <td style="${GAP}"></td>
      ${longestStreak > time.totalDays
        ? statCell(String(longestStreak), 'day best streak', 'Your record')
        : statCell('&#x1F3C6;', 'new personal best!', `${time.totalDays} days`)}
    </tr>

    <!-- Mood + checkins row -->
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr>
      <td width="48%" style="${STAT}">
        <div style="font-size:32px;margin-bottom:4px;">${mood.emoji}</div>
        <div style="font-size:13px;font-weight:700;color:#0F6E6E;">${mood.text}</div>
        <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">Mood this week${moodAvg !== null ? ` (${moodAvg.toFixed(1)}/5)` : ''}</div>
      </td>
      <td style="${GAP}"></td>
      <td width="48%" style="${STAT}">
        <div style="font-size:26px;font-weight:900;color:#0F6E6E;line-height:1.15;margin-bottom:4px;">${moodCheckins}</div>
        <div style="font-size:13px;font-weight:700;color:#0F6E6E;">check-in${moodCheckins !== 1 ? 's' : ''}</div>
        <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">This week</div>
        ${checkinStreak >= 2 ? `<div style="font-size:12px;font-weight:700;color:#0F6E6E;margin-top:6px;border-top:1px solid #d0eded;padding-top:6px;">&#x1F525; ${checkinStreak}-day streak</div>` : ''}
      </td>
    </tr>

    <!-- Urges row -->
    <tr><td colspan="3" style="height:10px;"></td></tr>
    <tr>
      <td width="48%" style="${STAT}">
        <div style="font-size:26px;font-weight:900;line-height:1.15;margin-bottom:4px;">
          ${urgesTotal > 0
            ? `<span style="color:#0F6E6E;">${urgesResisted}</span><span style="font-size:15px;font-weight:600;color:#5a8a8a;">/${urgesTotal}</span>`
            : '<span style="color:#5a8a8a;">—</span>'}
        </div>
        <div style="font-size:13px;font-weight:700;color:#0F6E6E;">${urgesTotal > 0 ? 'urges beaten' : 'no urges logged'}</div>
        <div style="font-size:12px;margin-top:3px;color:${urgeRate !== null ? urgeRateColor : '#5a8a8a'};${urgeRate !== null ? 'font-weight:700;' : ''}">
          ${urgeRate !== null ? `${urgeRate}% overcome this week` : 'Quiet week &#x1F64C;'}
        </div>
      </td>
      <td style="${GAP}"></td>
      ${statCell(String(urgesAllTime), `urge${urgesAllTime !== 1 ? 's' : ''} beaten`, 'All time')}
    </tr>

    ${compareBlock}
    ${consistencyBlock}
    ${urgeStreakBlock}
    ${milestoneBlock}
    ${debtBlock}
    ${triggerBlock}
    ${savedBlock}

    <tr><td colspan="3" style="height:20px;"></td></tr>

    <tr><td colspan="3" style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${whyLabel}</div>
    </td></tr>

    <tr><td colspan="3" style="height:24px;"></td></tr>

    <tr><td colspan="3" style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      You're getting this because weekly summaries are on.<br>
      To turn them off: <strong>Settings &#x2192; Notifications</strong>
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

// ─── SHARED DATA FETCHER ────────────────────────────────────────────────────

async function buildEmailForUser(
  supabase: ReturnType<typeof createClient>,
  user: UserRow,
  forceTier?: 'free' | 'premium',
  now = Date.now(),
) {
  const weekAgo    = new Date(now - 7  * 86_400_000).toISOString();
  const twoWkAgo   = new Date(now - 14 * 86_400_000).toISOString();
  const thirtyAgo  = new Date(now - 30 * 86_400_000).toISOString();

  const quitMs    = parseQuitMs(user.quit_timestamp, user.quit_date);
  const weeklyBet = parseWeeklyBet(user.weekly_bet);
  const elapsed   = Math.max(0, now - quitMs);
  const isPremium = forceTier ? forceTier === 'premium' : user.is_premium;

  const [streakRes, moodWeekRes, urgeWeekRes, resetRes, debtsRes, debtPaymentsRes] = await Promise.all([
    supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', user.id).maybeSingle(),
    supabase.from('mood_checkins').select('mood').eq('user_id', user.id).gte('created_at', weekAgo),
    supabase.from('urge_journal').select('outcome, trigger').eq('user_id', user.id).gte('created_at', weekAgo),
    supabase.from('losses').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('type', 'streak_reset'),
    supabase.from('debts').select('total_amount').eq('user_id', user.id),
    supabase.from('debt_payments').select('amount').eq('user_id', user.id),
  ]);

  const moods         = (moodWeekRes.data ?? []) as { mood: number }[];
  const moodAvg       = moods.length > 0 ? moods.reduce((s, m) => s + m.mood, 0) / moods.length : null;
  const urgeWeek      = (urgeWeekRes.data ?? []) as { outcome: string; trigger: string }[];
  const urgesResisted = urgeWeek.filter(u => u.outcome === 'overcame').length;
  const urgesTotal    = urgeWeek.length;
  const totalDebt     = ((debtsRes.data ?? []) as { total_amount: number }[]).reduce((s, r) => s + Number(r.total_amount), 0);
  const totalPaid     = ((debtPaymentsRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
  const resetCount    = resetRes.count ?? 0;
  const longestStreak = streakRes.data?.longest_streak ?? 0;
  const time          = buildTimeDisplay(quitMs);
  const firstName     = esc((user.display_name || 'there').split(' ')[0]);
  const whyLabel      = esc(motivationLabel(user.motivation));
  const currency      = user.currency ?? 'USD';

  if (!isPremium) {
    return {
      html: buildFreeHtml({ firstName, whyLabel, time, moodAvg, moodCheckins: moods.length, totalPaid, totalDebt, currency, elapsed }),
      subject: `Your week in recovery — ${time.subjectLabel} clean`,
    };
  }

  // Premium-only queries
  const [moodLastWeekRes, urgeAllTimeRes, thisWeekPayRes, firstPayRes, checkins30dRes, lastUrgeRes, lastWeekUrgesRes, checkinDatesRes] = await Promise.all([
    supabase.from('mood_checkins').select('mood').eq('user_id', user.id).gte('created_at', twoWkAgo).lt('created_at', weekAgo),
    supabase.from('urge_journal').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('outcome', 'overcame'),
    supabase.from('debt_payments').select('amount').eq('user_id', user.id).gte('created_at', weekAgo),
    supabase.from('debt_payments').select('created_at').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1),
    supabase.from('mood_checkins').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', thirtyAgo),
    supabase.from('urge_journal').select('created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
    supabase.from('urge_journal').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', twoWkAgo).lt('created_at', weekAgo),
    supabase.from('mood_checkins').select('created_at').eq('user_id', user.id).gte('created_at', new Date(now - 90 * 86_400_000).toISOString()).order('created_at', { ascending: false }),
  ]);

  const lastWeekMoods      = (moodLastWeekRes.data ?? []) as { mood: number }[];
  const lastWeekMoodAvg    = lastWeekMoods.length > 0 ? lastWeekMoods.reduce((s, m) => s + m.mood, 0) / lastWeekMoods.length : null;
  const lastWeekCheckins   = lastWeekMoods.length;
  const urgesAllTime       = urgeAllTimeRes.count ?? 0;
  const thisWeekPayments   = ((thisWeekPayRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
  const firstPaymentDate   = (firstPayRes.data ?? [])[0]?.created_at ?? null;
  const checkins30d        = checkins30dRes.count ?? 0;
  const lastUrgeDate       = (lastUrgeRes.data ?? [])[0]?.created_at ?? null;
  const lastWeekUrgesTotal = lastWeekUrgesRes.count ?? 0;
  const checkinStreak = computeCheckinStreak((checkinDatesRes.data ?? []) as { created_at: string }[]);

  return {
    html: buildPremiumHtml({
      firstName, whyLabel, time,
      moodAvg, lastWeekMoodAvg, moodCheckins: moods.length, lastWeekCheckins, checkins30d,
      urgesResisted, urgesTotal, lastWeekUrgesTotal, urgesAllTime, lastUrgeDate,
      topTriggerThisWeek: topTrigger(urgeWeek),
      totalPaid, totalDebt, thisWeekPayments, firstPaymentDate,
      currency, weeklyBet, longestStreak, resetCount,
      quitTs: user.quit_timestamp, quitDate: user.quit_date, elapsed, checkinStreak,
    }),
    subject: `Your full weekly report — ${time.subjectLabel} clean`,
  };
}

// ─── HANDLER ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));

  // Test mode: force send to a specific user at a specific tier
  if (body.test_user_id) {
    const tier: 'free' | 'premium' = body.tier === 'premium' ? 'premium' : 'free';
    const { data: user } = await supabase
      .from('users')
      .select('id, email, display_name, motivation, currency, quit_date, quit_timestamp, weekly_bet, is_premium')
      .eq('id', body.test_user_id)
      .maybeSingle();
    if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

    const { html, subject } = await buildEmailForUser(supabase, user as UserRow, tier);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject, html }),
    });
    if (!res.ok) return new Response(JSON.stringify({ error: await res.text() }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, tier, subject }), { status: 200 });
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, display_name, motivation, currency, quit_date, quit_timestamp, weekly_bet, is_premium')
    .eq('notif_weekly_summary', true)
    .not('email', 'is', null)
    .not('quit_date', 'is', null);

  if (usersError || !users) {
    console.error('Failed to fetch users:', usersError);
    return new Response(JSON.stringify({ error: 'failed to fetch users' }), { status: 500 });
  }

  const now = Date.now();
  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (const user of users as UserRow[]) {
    try {
      const { html, subject } = await buildEmailForUser(supabase, user as UserRow, undefined, now);

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject, html }),
      });

      if (!emailRes.ok) throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
      sent++;
      console.log(`Sent ${user.is_premium ? 'premium' : 'free'} digest to ${user.id}`);
    } catch (err) {
      console.error(`Failed for ${user.id}:`, err);
      errors.push(`${user.id}: ${String(err)}`);
      failed++;
    }
  }

  console.log(`Weekly digest — sent: ${sent}, failed: ${failed}`);
  return new Response(JSON.stringify({ sent, failed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
