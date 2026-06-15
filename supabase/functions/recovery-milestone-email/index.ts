import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);

interface Milestone {
  pct: number;
  badge: string;
  emoji: string;
  heading: string;
  message: string;
}

const MILESTONES: Milestone[] = [
  { pct: 10,  badge: 'recovery_10pct',  emoji: '&#x1F331;', heading: 'First 10% paid back.',  message: 'A small percentage that took real effort. Every payment from here gets easier.' },
  { pct: 25,  badge: 'recovery_25pct',  emoji: '&#x1F4C8;', heading: 'A quarter of the way.',  message: 'One quarter of your debt is gone. That took discipline, honesty, and consistency.' },
  { pct: 50,  badge: 'recovery_50pct',  emoji: '&#x1F3C6;', heading: 'Halfway there.',          message: 'Half the debt is cleared. You\'ve already done the hardest half — the part where you decided to face it.' },
  { pct: 75,  badge: 'recovery_75pct',  emoji: '&#x1F4AA;', heading: 'Three quarters done.',   message: 'You are three-quarters of the way back. Most people never get here. You did.' },
  { pct: 100, badge: 'recovery_100pct', emoji: '&#x1F48E;', heading: 'Debt cleared.',           message: 'You paid it all back. Every single amount. That\'s not just financial recovery — that\'s a complete transformation.' },
];


function fmtAmount(amount: number): string {
  return Math.round(amount).toLocaleString('en');
}

function buildHtml(firstName: string, m: Milestone, totalPaid: number, totalLost: number): string {
  const remaining = Math.max(0, totalLost - totalPaid);
  const nextM = MILESTONES.find(n => n.pct > m.pct);

  const progressPct = Math.min(100, Math.round((totalPaid / totalLost) * 100));
  const progressBar = `
    <div style="background:#e6f0f0;border-radius:999px;height:10px;margin:8px 0 4px;">
      <div style="background:linear-gradient(90deg,#0F6E6E,#1a9a9a);border-radius:999px;height:10px;width:${progressPct}%;"></div>
    </div>
    <div style="font-size:12px;color:#5a8a8a;text-align:right;">${progressPct}% recovered</div>`;

  const nextBlock = nextM ? `
    <tr><td style="height:12px;"></td></tr>
    <tr><td style="background:#f9fdfd;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:12px;color:#5a8a8a;margin-bottom:4px;">Next milestone</div>
      <div style="font-size:18px;font-weight:700;color:#0F6E6E;">${nextM.emoji} ${nextM.pct}% paid back</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">${fmtAmount(remaining)} to go</div>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recovery milestone reached</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 28px 36px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
    <div style="font-size:48px;margin-bottom:14px;">${m.emoji}</div>
    <div style="font-size:26px;font-weight:900;line-height:1.15;margin-bottom:8px;">${m.heading}</div>
    <div style="font-size:16px;opacity:0.85;font-weight:600;">${fmtAmount(totalPaid)} paid back</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      ${firstName}, ${m.message}
    </td></tr>

    <tr><td style="background:#f9fdfd;border-radius:12px;padding:16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:0 12px;">
            <div style="font-size:11px;color:#5a8a8a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Paid back</div>
            <div style="font-size:22px;font-weight:900;color:#0F6E6E;">${fmtAmount(totalPaid)}</div>
          </td>
          <td style="text-align:center;padding:0 12px;border-left:1px solid #e0eded;">
            <div style="font-size:11px;color:#5a8a8a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Still owed</div>
            <div style="font-size:22px;font-weight:900;color:${remaining > 0 ? '#c0392b' : '#0F6E6E'};">${fmtAmount(remaining)}</div>
          </td>
          <td style="text-align:center;padding:0 12px;border-left:1px solid #e0eded;">
            <div style="font-size:11px;color:#5a8a8a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total logged</div>
            <div style="font-size:22px;font-weight:900;color:#333;">${fmtAmount(totalLost)}</div>
          </td>
        </tr>
        <tr><td colspan="3" style="padding-top:12px;">${progressBar}</td></tr>
      </table>
    </td></tr>

    ${nextBlock}

    <tr><td style="height:24px;"></td></tr>

    <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      Keep logging payments in CornerDay. Every entry moves the bar.
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
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));

  // Direct test mode: send a specific milestone to a specific user using mock amounts
  if (body.direct_user_id) {
    const milestoneIdx = body.milestone_index ?? 1;
    const m = MILESTONES[milestoneIdx] ?? MILESTONES[1];
    const testLost = 5000;
    const testPaid = Math.round(testLost * (m.pct / 100));

    const { data: user } = await supabase
      .from('users')
      .select('email, display_name')
      .eq('id', body.direct_user_id)
      .maybeSingle();
    if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

    const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
    const html = buildHtml(firstName, m, testPaid, testLost);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `${m.emoji} Recovery milestone: ${m.pct}% paid back — CornerDay`, html }),
    });
    if (!res.ok) return new Response(JSON.stringify({ error: await res.text() }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, mode: 'direct', milestone: m.badge }), { status: 200 });
  }

  // Fetch debts and payments from current schema
  const [debtsRes, paymentsRes] = await Promise.all([
    supabase.from('debts').select('user_id, total_amount'),
    supabase.from('debt_payments').select('user_id, amount'),
  ]);

  if (debtsRes.error || paymentsRes.error) {
    return new Response(JSON.stringify({ error: 'failed to fetch debt data' }), { status: 500 });
  }

  // Aggregate per user
  const userStats: Record<string, { totalLost: number; totalPaid: number }> = {};
  for (const row of debtsRes.data ?? []) {
    if (!userStats[row.user_id]) userStats[row.user_id] = { totalLost: 0, totalPaid: 0 };
    userStats[row.user_id].totalLost += Number(row.total_amount);
  }
  for (const row of paymentsRes.data ?? []) {
    if (!userStats[row.user_id]) userStats[row.user_id] = { totalLost: 0, totalPaid: 0 };
    userStats[row.user_id].totalPaid += Number(row.amount);
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const [userId, stats] of Object.entries(userStats)) {
    if (stats.totalLost === 0) { skipped++; continue; }

    const recoveryPct = (stats.totalPaid / stats.totalLost) * 100;

    try {
      const { data: user } = await supabase
        .from('users')
        .select('email, display_name')
        .eq('id', userId)
        .maybeSingle();
      if (!user?.email) { skipped++; continue; }

      for (const m of MILESTONES) {
        if (recoveryPct < m.pct) continue;

        const { data: existing } = await supabase
          .from('badges')
          .select('id')
          .eq('user_id', userId)
          .eq('badge_type', m.badge)
          .maybeSingle();

        if (existing) continue;

        const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
        const html = buildHtml(firstName, m, stats.totalPaid, stats.totalLost);

        const [, emailRes] = await Promise.all([
          supabase.from('badges').insert({ user_id: userId, badge_type: m.badge }),
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `${m.emoji} Recovery milestone: ${m.pct}% paid back — CornerDay`, html }),
          }),
        ]);

        if (!emailRes.ok) throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
        sent++;
        console.log(`Recovery milestone ${m.badge} sent to ${userId}`);
      }
    } catch (err) {
      errors.push(`${userId}: ${String(err)}`);
      failed++;
    }
  }

  console.log(`Recovery milestones — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  return new Response(JSON.stringify({ sent, skipped, failed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
