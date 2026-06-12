import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'CornerDay <noreply@cornerday.app>';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  motivation: string | null;
  currency: string | null;
  quit_date: string | null;
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
  const map: Record<string, string> = {
    family: 'My family',
    finances: 'Financial freedom',
    mental_health: 'My mental health',
    saving: 'Saving for something',
    better_self: 'Becoming my best self',
  };
  if (!key) return 'Your recovery';
  return map[key] ?? key;
}

function fmtCurrency(amount: number, currency: string): string {
  const syms: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$',
  };
  const sym = syms[currency] ?? `${currency} `;
  return `${sym}${Math.round(amount).toLocaleString('en')}`;
}

function streakMessage(streak: number): string {
  if (streak >= 365) return 'Over a year clean — that\'s extraordinary.';
  if (streak >= 90)  return `${streak} days. You\'re building something lasting.`;
  if (streak >= 30)  return `${streak} days in. The hardest part is behind you.`;
  if (streak >= 7)   return `${streak} days — one full week at a time.`;
  if (streak > 0)    return `${streak} day${streak !== 1 ? 's' : ''} — every single one counts.`;
  return 'You started. That\'s the most important step.';
}

function buildHtml(p: {
  displayName: string;
  streak: number;
  moodAvg: number | null;
  urgesResisted: number;
  totalPaid: number;
  totalDebt: number;
  motivation: string | null;
  currency: string;
}): string {
  const { displayName, streak, moodAvg, urgesResisted, totalPaid, totalDebt, motivation, currency } = p;
  const mood = moodLabel(moodAvg);
  const firstName = (displayName.split(' ')[0] || displayName) || 'there';
  const paidFmt = fmtCurrency(totalPaid, currency);
  const debtFmt = fmtCurrency(totalDebt, currency);
  const pct = totalDebt > 0 ? Math.min(Math.round((totalPaid / totalDebt) * 100), 100) : null;
  const whyLabel = motivationLabel(motivation);
  const msg = streakMessage(streak);

  const debtBlock = totalDebt > 0 ? `
    <tr><td style="height:12px;"></td></tr>
    <tr><td style="background:#f5ece4;border-radius:12px;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#a0522d;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Recovery progress</div>
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

  <!-- Header gradient -->
  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:36px 28px 32px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:8px;">CornerDay</div>
    <div style="font-size:14px;opacity:0.8;margin-bottom:22px;">Hi ${firstName} — here's your week</div>
    <div style="font-size:84px;font-weight:900;line-height:1;color:#fff;">${streak}</div>
    <div style="font-size:20px;font-weight:600;margin-top:8px;color:rgba(255,255,255,0.9);">day${streak !== 1 ? 's' : ''} clean</div>
    <div style="font-size:13px;margin-top:12px;color:rgba(255,255,255,0.7);font-style:italic;">${msg}</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:24px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <!-- Stats row -->
    <tr>
      <td width="48%" style="background:#e6f7f7;border-radius:12px;padding:16px;text-align:center;vertical-align:top;">
        <div style="font-size:30px;margin-bottom:4px;">${mood.emoji}</div>
        <div style="font-size:14px;font-weight:700;color:#0F6E6E;">${mood.text}</div>
        <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">Mood this week</div>
      </td>
      <td width="4%"></td>
      <td width="48%" style="background:#e6f7f7;border-radius:12px;padding:16px;text-align:center;vertical-align:top;">
        <div style="font-size:30px;font-weight:900;color:#0F6E6E;margin-bottom:4px;">${urgesResisted}</div>
        <div style="font-size:14px;font-weight:700;color:#0F6E6E;">urge${urgesResisted !== 1 ? 's' : ''} resisted</div>
        <div style="font-size:12px;color:#5a8a8a;margin-top:3px;">This week</div>
      </td>
    </tr>

    ${debtBlock}

    <!-- Spacer -->
    <tr><td colspan="3" style="height:20px;"></td></tr>

    <!-- Your why -->
    <tr><td colspan="3" style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${whyLabel}</div>
    </td></tr>

    <tr><td colspan="3" style="height:20px;"></td></tr>

    <!-- CTA button -->
    <tr><td colspan="3" align="center">
      <a href="https://cornerday.app" style="display:inline-block;background:linear-gradient(135deg,#0F6E6E,#1a9a9a);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:12px;">Open CornerDay</a>
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
  // Accept POST from pg_cron (Authorization: Bearer <service_role_key>)
  // or GET/POST for manual trigger with the same header
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, display_name, motivation, currency, quit_date')
    .neq('notif_weekly_summary', false)
    .not('email', 'is', null)
    .not('quit_date', 'is', null);

  if (usersError || !users) {
    console.error('Failed to fetch users:', usersError);
    return new Response(JSON.stringify({ error: 'failed to fetch users' }), { status: 500 });
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const user of users as UserRow[]) {
    try {
      const [streakRes, moodRes, urgeRes, debtRes, paymentRes] = await Promise.all([
        supabase.from('streaks').select('current_streak').eq('user_id', user.id).maybeSingle(),
        supabase.from('mood_checkins').select('mood').eq('user_id', user.id).gte('created_at', weekAgoIso),
        supabase.from('urge_journal').select('id').eq('user_id', user.id).eq('outcome', 'overcame').gte('created_at', weekAgoIso),
        supabase.from('debts').select('total_amount').eq('user_id', user.id),
        supabase.from('debt_payments').select('amount').eq('user_id', user.id),
      ]);

      const streak = streakRes.data?.current_streak ?? 0;
      const moods = (moodRes.data ?? []) as { mood: number }[];
      const moodAvg = moods.length > 0
        ? moods.reduce((s, m) => s + m.mood, 0) / moods.length
        : null;
      const urgesResisted = (urgeRes.data ?? []).length;
      const totalDebt = ((debtRes.data ?? []) as { total_amount: number }[])
        .reduce((s, d) => s + d.total_amount, 0);
      const totalPaid = ((paymentRes.data ?? []) as { amount: number }[])
        .reduce((s, p) => s + p.amount, 0);

      const html = buildHtml({
        displayName: user.display_name || 'there',
        streak,
        moodAvg,
        urgesResisted,
        totalPaid,
        totalDebt,
        motivation: user.motivation,
        currency: user.currency ?? 'USD',
      });

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [user.email],
          subject: `Your week in recovery — ${streak} day${streak !== 1 ? 's' : ''} clean`,
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
