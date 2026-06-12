import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'CornerDay <onboarding@resend.dev>';

function jwtRole(h: string): string | null {
  try {
    const t = h.startsWith('Bearer ') ? h.slice(7) : h;
    return JSON.parse(atob(t.split('.')[1])).role ?? null;
  } catch { return null; }
}

function buildHtml(firstName: string, streakDays: number): string {
  const streakLine = streakDays > 0
    ? `You're already ${streakDays} day${streakDays !== 1 ? 's' : ''} into your journey.`
    : `You've already taken the first step.`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>What Premium unlocks for you</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 28px 36px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
    <div style="font-size:40px;margin-bottom:14px;">&#x2B50;</div>
    <div style="font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;">A month in. Here's what's waiting.</div>
    <div style="font-size:14px;opacity:0.85;line-height:1.5;">${streakLine} Ready for more support?</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      ${firstName}, you've been using CornerDay for a month. The free tools are doing their job — but if you want more personalised support, Premium takes it further.
    </td></tr>

    <tr><td style="font-size:13px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;padding-bottom:12px;">What Premium unlocks</td></tr>

    <tr><td style="background:#f9fdfd;border-radius:12px;padding:16px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F916;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">AI Coach — 24/7</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">A private conversation partner available any time. Talk through urges, hard days, setbacks — whatever you need in the moment. No waiting rooms. No appointments.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4CA;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Detailed analytics</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">See your mood trends, trigger patterns, and recovery progress in depth. Understanding your patterns is how you get ahead of them.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F91D;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Accountability partner</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">Connect a trusted person — a partner, friend, or family member — so they can see your streak and cheer you on. Recovery is stronger with someone in your corner.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;">&#x1F6AB;</td>
        <td style="vertical-align:top;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Ad-free experience</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">No ads. No distractions. Just the tools you need, whenever you need them.</div>
        </td>
      </tr>
    </table>
    </td></tr>

    <tr><td style="height:20px;"></td></tr>

    <tr><td style="background:#0F6E6E;border-radius:12px;padding:20px;text-align:center;">
      <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-bottom:6px;">CornerDay Premium</div>
      <div style="font-size:28px;font-weight:900;color:#fff;line-height:1;">from $4.99<span style="font-size:14px;font-weight:400;">/month</span></div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px;">Cancel any time. No commitment.</div>
    </td></tr>

    <tr><td style="height:16px;"></td></tr>

    <tr><td style="font-size:14px;color:#555;line-height:1.7;padding-bottom:20px;text-align:center;">
      To upgrade: open CornerDay &#x2192; go to <strong>Settings</strong> &#x2192; tap <strong>Upgrade to Premium</strong>
    </td></tr>

    <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      Free features stay free forever. This is just what's waiting if you want it.<br>
      To stop receiving these emails: <strong>Settings &#x2192; Notifications</strong>
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
  const body = await req.json().catch(() => ({}));

  // Direct test mode: bypass eligibility, send immediately to given user
  if (body.direct_user_id) {
    const { data: user } = await supabase
      .from('users')
      .select('email, display_name')
      .eq('id', body.direct_user_id)
      .maybeSingle();
    if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

    const { data: streak } = await supabase
      .from('streaks')
      .select('current_streak')
      .eq('user_id', body.direct_user_id)
      .maybeSingle();

    const firstName = user.display_name?.split(' ')[0] || 'there';
    const html = buildHtml(firstName, streak?.current_streak ?? 0);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `${firstName}, a month in — here's what Premium unlocks`, html }),
    });
    if (!res.ok) return new Response(JSON.stringify({ error: await res.text() }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, mode: 'direct' }), { status: 200 });
  }

  const now = Date.now();
  const thirtyDaysAgo  = new Date(now - 30 * 86_400_000).toISOString();
  const thirtyOneDaysAgo = new Date(now - 31 * 86_400_000).toISOString();

  // Free users who joined exactly 30 days ago
  const { data: eligibleUsers, error } = await supabase
    .from('users')
    .select('id, email, display_name')
    .eq('is_premium', false)
    .lt('created_at', thirtyDaysAgo)
    .gte('created_at', thirtyOneDaysAgo)
    .not('email', 'is', null);

  if (error) {
    return new Response(JSON.stringify({ error: 'failed to fetch users' }), { status: 500 });
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const user of (eligibleUsers ?? [])) {
    try {
      // Send only once
      const { data: existing } = await supabase
        .from('badges')
        .select('id')
        .eq('user_id', user.id)
        .eq('badge_type', 'upsell_30d')
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { data: streak } = await supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', user.id)
        .maybeSingle();

      const firstName = user.display_name?.split(' ')[0] || 'there';
      const html = buildHtml(firstName, streak?.current_streak ?? 0);

      const [, emailRes] = await Promise.all([
        supabase.from('badges').insert({ user_id: user.id, badge_type: 'upsell_30d' }),
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `${firstName}, a month in — here's what Premium unlocks`, html }),
        }),
      ]);

      if (!emailRes.ok) throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
      sent++;
      console.log(`Premium upsell sent to ${user.id}`);
    } catch (err) {
      errors.push(`${user.id}: ${String(err)}`);
      failed++;
    }
  }

  console.log(`Premium upsell — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  return new Response(JSON.stringify({ sent, skipped, failed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
