import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_SECRET')!;
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);

const ICON = 'https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon.png';

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

function fmtCurrency(amount: number, currency: string): string {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'z&#322;', AUD: 'A$', CAD: 'C$' };
  return `${syms[currency] ?? currency + ' '}${Math.round(amount).toLocaleString('en')}`;
}

function buildHtml(firstName: string, m: Milestone, totalPaid: number, totalLost: number, currency: string): string {
  const remaining = Math.max(0, totalLost - totalPaid);
  const nextM = MILESTONES.find(n => n.pct > m.pct);

  const progressPct = Math.min(100, Math.round((totalPaid / totalLost) * 100));
  const progressBar = `
    <div style="background:#c8e8e8;border-radius:999px;height:10px;margin:10px 0 4px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#0F6E6E,#1a9a9a);border-radius:999px;height:10px;width:${progressPct}%;"></div>
    </div>
    <div style="font-size:12px;color:#5a7a7a;text-align:right;margin-top:2px;">${progressPct}% recovered</div>`;

  const nextBlock = nextM ? `
    <tr><td style="height:14px;"></td></tr>
    <tr><td style="background:#e6f7f7;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:11px;color:#5a7a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Next milestone</div>
      <div style="font-size:20px;font-weight:800;color:#0F6E6E;">${nextM.pct}% paid back</div>
      <div style="font-size:13px;color:#5a7a7a;margin-top:4px;">${fmtCurrency(remaining, currency)} to go</div>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recovery milestone reached</title></head>
<body style="margin:0;padding:0;background:#f5fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbfb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);border-radius:20px 20px 0 0;padding:44px 36px 40px;text-align:center;color:#fff;">
    <img src="${ICON}" width="56" height="56" alt="CornerDay" style="display:block;margin:0 auto 12px;border-radius:13px;"/>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;margin-bottom:14px;">CornerDay</div>
    <div style="font-size:28px;font-weight:900;line-height:1.15;margin-bottom:10px;">${m.heading}</div>
    <div style="font-size:17px;opacity:0.85;font-weight:600;">${fmtCurrency(totalPaid, currency)} paid back</div>
  </td></tr>

  <tr><td style="background:#fff;padding:32px 36px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#3a5a5a;line-height:1.75;padding-bottom:22px;">
      ${firstName}, ${m.message}
    </td></tr>

    <tr><td style="background:#e6f7f7;border-radius:14px;padding:18px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:0 12px;">
            <div style="font-size:11px;color:#5a7a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Paid back</div>
            <div style="font-size:24px;font-weight:900;color:#0F6E6E;">${fmtCurrency(totalPaid, currency)}</div>
          </td>
          <td style="text-align:center;padding:0 12px;border-left:1px solid #c8e8e8;">
            <div style="font-size:11px;color:#5a7a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Still owed</div>
            <div style="font-size:24px;font-weight:900;color:${remaining > 0 ? '#c0392b' : '#0F6E6E'};">${fmtCurrency(remaining, currency)}</div>
          </td>
          <td style="text-align:center;padding:0 12px;border-left:1px solid #c8e8e8;">
            <div style="font-size:11px;color:#5a7a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Total logged</div>
            <div style="font-size:24px;font-weight:900;color:#1a2e2e;">${fmtCurrency(totalLost, currency)}</div>
          </td>
        </tr>
        <tr><td colspan="3" style="padding-top:12px;">${progressBar}</td></tr>
      </table>
    </td></tr>

    ${nextBlock}

    <tr><td style="height:22px;"></td></tr>
    <tr><td style="font-size:13px;color:#5a7a7a;text-align:center;border-top:1px solid #e6f7f7;padding-top:16px;line-height:1.6;">
      Keep logging payments in CornerDay. Every entry moves the bar.
    </td></tr>

  </table>
  </td></tr>

  <tr><td style="background:#081e1e;border-radius:0 0 20px 20px;padding:22px 28px;text-align:center;">
    <div>
      <img src="${ICON}" width="24" height="24" alt="CornerDay" style="border-radius:6px;opacity:0.85;vertical-align:middle;margin-right:7px;"/>
      <span style="font-size:14px;font-weight:800;color:#fff;vertical-align:middle;">CornerDay</span>
    </div>
    <div style="margin-top:10px;">
      <a href="https://cornerday.app" style="color:#a8d8d0;font-size:12px;text-decoration:none;margin:0 8px;">cornerday.app</a>
      <a href="https://cornerday.app/privacy" style="color:#a8d8d0;font-size:12px;text-decoration:none;margin:0 8px;">Privacy</a>
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:10px;">© 2026 CornerDay. Built for recovery.</div>
  </td></tr>

  <tr><td style="height:32px;"></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));

  if (body.user_id) {
    const userId = body.user_id as string;

    const [debtsRes, paymentsRes, userRes] = await Promise.all([
      supabase.from('debts').select('total_amount').eq('user_id', userId),
      supabase.from('debt_payments').select('amount').eq('user_id', userId),
      supabase.from('users').select('email, display_name, currency').eq('id', userId).maybeSingle(),
    ]);

    const totalLost = ((debtsRes.data ?? []) as { total_amount: number }[]).reduce((s, r) => s + Number(r.total_amount), 0);
    const totalPaid = ((paymentsRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
    if (totalLost === 0 || !userRes.data?.email) {
      return new Response(JSON.stringify({ skipped: 'no debt or email' }), { status: 200 });
    }

    const recoveryPct = (totalPaid / totalLost) * 100;
    const currency = (userRes.data as { currency?: string }).currency ?? 'USD';
    let sent = 0;

    for (const m of MILESTONES) {
      if (recoveryPct < m.pct) continue;

      const { data: existing } = await supabase
        .from('badges').select('id').eq('user_id', userId).eq('badge_type', m.badge).maybeSingle();
      if (existing) continue;

      const { error: insertError } = await supabase
        .from('badges')
        .insert({ user_id: userId, badge_type: m.badge, earned_at: new Date().toISOString() });
      if (insertError) {
        if (insertError.code === '23505') continue;
        return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
      }

      const firstName = esc(userRes.data.display_name?.split(' ')?.[0] || 'there');
      const html = buildHtml(firstName, m, totalPaid, totalLost, currency);
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [userRes.data.email], subject: `Recovery milestone: ${m.pct}% paid back — CornerDay`, html }),
      });
      if (!emailRes.ok) return new Response(JSON.stringify({ error: await emailRes.text() }), { status: 500 });
      console.log(`Recovery milestone ${m.badge} webhook email sent to ${userId}`);
      sent++;
    }

    return new Response(JSON.stringify({ ok: true, mode: 'webhook', sent }), { status: 200 });
  }

  if (body.direct_user_id) {
    const milestoneIdx = body.milestone_index ?? 1;
    const m = MILESTONES[milestoneIdx] ?? MILESTONES[1];
    const testLost = 5000;
    const testPaid = Math.round(testLost * (m.pct / 100));

    const { data: user } = await supabase
      .from('users')
      .select('email, display_name, currency')
      .eq('id', body.direct_user_id)
      .maybeSingle();
    if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

    const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
    const html = buildHtml(firstName, m, testPaid, testLost, (user as { currency?: string }).currency ?? 'USD');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `Recovery milestone: ${m.pct}% paid back — CornerDay`, html }),
    });
    if (!res.ok) return new Response(JSON.stringify({ error: await res.text() }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, mode: 'direct', milestone: m.badge }), { status: 200 });
  }

  const [debtsRes, paymentsRes] = await Promise.all([
    supabase.from('debts').select('user_id, total_amount'),
    supabase.from('debt_payments').select('user_id, amount'),
  ]);

  if (debtsRes.error || paymentsRes.error) {
    return new Response(JSON.stringify({ error: 'failed to fetch debt data' }), { status: 500 });
  }

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
        .select('email, display_name, currency')
        .eq('id', userId)
        .maybeSingle();
      if (!user?.email) { skipped++; continue; }

      const userCurrency = (user as { currency?: string }).currency ?? 'USD';

      for (const m of MILESTONES) {
        if (recoveryPct < m.pct) continue;

        const { data: existing } = await supabase
          .from('badges')
          .select('id')
          .eq('user_id', userId)
          .eq('badge_type', m.badge)
          .maybeSingle();

        if (existing) continue;

        const { error: insertError } = await supabase
          .from('badges')
          .insert({ user_id: userId, badge_type: m.badge, earned_at: new Date().toISOString() });

        if (insertError) {
          if (insertError.code === '23505') { skipped++; continue; }
          throw new Error(`Badge insert failed: ${insertError.message}`);
        }

        const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
        const html = buildHtml(firstName, m, stats.totalPaid, stats.totalLost, userCurrency);

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `Recovery milestone: ${m.pct}% paid back — CornerDay`, html }),
        });

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
