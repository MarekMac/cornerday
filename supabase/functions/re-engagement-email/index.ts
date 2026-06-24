import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_SECRET')!;
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);


function motivationLabel(key: string | null): string {
  const map: Record<string, string> = {
    family: 'My family', finances: 'Financial freedom',
    mental_health: 'My mental health', saving: 'Saving for something',
    better_self: 'Becoming my best self',
  };
  return key ? (map[key] ?? key) : 'your recovery';
}

function buildHtml(firstName: string, whyLabel: string, streak: number): string {
  const streakBlock = streak > 0
    ? `<div style="font-size:36px;font-weight:900;color:#0F6E6E;line-height:1;">${streak}</div>
       <div style="font-size:13px;color:#5a8a8a;margin-top:4px;">day streak — still yours</div>`
    : `<div style="font-size:15px;color:#5a8a8a;line-height:1.5;">Every day is a chance to start again.<br>No streak lost is permanent.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>We've been thinking about you</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 28px 36px;text-align:center;color:#fff;">
    <img src="https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon.png" width="52" height="52" alt="CornerDay" style="display:block;margin:0 auto 10px;border-radius:12px;"/>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
    <div style="font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;">We've been thinking about you, ${firstName}.</div>
    <div style="font-size:14px;opacity:0.85;line-height:1.5;">No judgement. No pressure. Just checking in.</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      Recovery isn't a straight line. Missing a few days doesn't erase the progress you've already made or the reason you started. That reason hasn't changed.
    </td></tr>

    <tr><td style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${whyLabel}</div>
    </td></tr>

    <tr><td style="height:16px;"></td></tr>

    <tr><td style="background:#f9fdfd;border-radius:12px;padding:20px;text-align:center;">
      ${streakBlock}
    </td></tr>

    <tr><td style="height:16px;"></td></tr>

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      When you're ready — open CornerDay. That's all it takes. One check-in. One step back.
    </td></tr>

    <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      We'll be here when you come back. No shame. No lecture. Just support.
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
  if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));

  // Direct test mode: bypass eligibility, send immediately to given user
  if (body.direct_user_id) {
    const { data: user } = await supabase
      .from('users')
      .select('email, display_name, motivation')
      .eq('id', body.direct_user_id)
      .maybeSingle();
    if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

    const { data: streak } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', body.direct_user_id)
      .maybeSingle();

    const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
    const html = buildHtml(firstName, motivationLabel(user.motivation), streak?.current_streak ?? 0);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `${firstName}, we've been thinking about you`, html }),
    });
    if (!res.ok) return new Response(JSON.stringify({ error: await res.text() }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, mode: 'direct' }), { status: 200 });
  }

  const now = Date.now();
  const sevenDaysAgo  = new Date(now - 7 * 86_400_000).toISOString();
  const eightDaysAgo  = new Date(now - 8 * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 86_400_000).toISOString();

  const { data: staleStreaks, error } = await supabase
    .from('streaks')
    .select('user_id, last_check_in, current_streak')
    .lt('last_check_in', sevenDaysAgo)
    .gte('last_check_in', eightDaysAgo);

  if (error) {
    console.error('Failed to fetch streaks:', error);
    return new Response(JSON.stringify({ error: 'failed to fetch streaks' }), { status: 500 });
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const streak of (staleStreaks ?? [])) {
    try {
      // At most one re-engagement email per 30-day silence period
      const { data: recentBadge } = await supabase
        .from('badges')
        .select('id')
        .eq('user_id', streak.user_id)
        .eq('badge_type', 'reengagement_7d')
        .gte('earned_at', thirtyDaysAgo)
        .maybeSingle();

      if (recentBadge) { skipped++; continue; }

      const { data: user } = await supabase
        .from('users')
        .select('email, display_name, motivation')
        .eq('id', streak.user_id)
        .maybeSingle();

      if (!user?.email) { skipped++; continue; }

      const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
      const html = buildHtml(firstName, motivationLabel(user.motivation), streak.current_streak ?? 0);

      const { error: insertError } = await supabase
        .from('badges')
        .insert({ user_id: streak.user_id, badge_type: 'reengagement_7d', earned_at: new Date().toISOString() });

      if (insertError) {
        if (insertError.code === '23505') { skipped++; continue; }
        throw new Error(`Badge insert failed: ${insertError.message}`);
      }

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `${firstName}, we've been thinking about you`, html }),
      });

      if (!emailRes.ok) throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
      sent++;
      console.log(`Re-engagement email sent to ${streak.user_id}`);
    } catch (err) {
      errors.push(`${streak.user_id}: ${String(err)}`);
      failed++;
    }
  }

  console.log(`Re-engagement — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  return new Response(JSON.stringify({ sent, skipped, failed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
