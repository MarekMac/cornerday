import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_SECRET') ?? '';
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

function buildHtml(firstName: string, whyLabel: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to CornerDay</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 28px 36px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
    <div style="font-size:36px;margin-bottom:14px;">🌱</div>
    <div style="font-size:26px;font-weight:800;line-height:1.2;margin-bottom:10px;">Welcome, ${firstName}.</div>
    <div style="font-size:15px;opacity:0.85;line-height:1.5;">The day you turn it around starts today.</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      You've taken a real step today. Most people never do. CornerDay is here to keep you going — every hour, every day.
    </td></tr>

    <tr><td style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a1a1a;font-weight:600;">${whyLabel}</div>
    </td></tr>

    <tr><td style="height:20px;"></td></tr>
    <tr><td style="font-size:12px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;padding-bottom:12px;">What's inside the app</td></tr>

    <tr><td style="background:#f9fdfd;border-radius:12px;padding:16px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4C5;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Streak tracker</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">Every day clean counts. Watch your streak grow, earn badges at 1 week, 1 month, 6 months and beyond.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F6A8;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Urge support</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">Breathing exercises, distraction tools, and a direct line to the National Problem Gambling Helpline — available the moment you need it.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4B0;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Loss &amp; debt tracker</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">Log what was lost, record payments as you make them, and watch your recovery progress bar move. Honest numbers, no shame.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4D4;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Urge journal</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">Log urges as you face them — what triggered it, how you handled it. Patterns become visible. Knowledge becomes power.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F465;</td>
        <td style="vertical-align:top;padding-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">Community</div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">An anonymous space to share wins, post on hard days, and hear from others on the same journey. You're not alone in this.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;">&#x1F916;</td>
        <td style="vertical-align:top;">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a;">AI Coach <span style="font-size:11px;font-weight:600;color:#fff;background:#0F6E6E;border-radius:6px;padding:2px 7px;vertical-align:middle;">Premium</span></div>
          <div style="font-size:13px;color:#666;margin-top:2px;line-height:1.5;">24/7 private support from an AI coach trained on evidence-based recovery strategies. Available whenever you need to talk it through.</div>
        </td>
      </tr>
    </table>
    </td></tr>

    <tr><td style="height:24px;"></td></tr>

    <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      We'll send you a weekly progress recap every Sunday.<br>
      To manage notifications: <strong>Account → Notifications</strong>
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
  if (!WEBHOOK_SECRET) {
    console.error('WEBHOOK_SECRET env var not set');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const rawBody = await req.text();
  if (rawBody.length > 65536) {
    return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413 });
  }
  const body   = JSON.parse(rawBody.length > 0 ? rawBody : '{}');
  const record = body.record ?? body;
  const userId = record.user_id;
  if (!userId) return new Response(JSON.stringify({ error: 'no user_id' }), { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: alreadySent } = await supabase
    .from('badges').select('id').eq('user_id', userId).eq('badge_type', 'welcome_email_sent').maybeSingle();
  if (alreadySent) return new Response(JSON.stringify({ skipped: 'already sent' }), { status: 200 });

  const { data: user } = await supabase
    .from('users')
    .select('email, display_name, motivation')
    .eq('id', userId)
    .maybeSingle();

  if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

  const firstName = esc(user.display_name?.split(' ')?.[0] || 'there');
  const whyLabel  = esc(motivationLabel(user.motivation));
  const html      = buildHtml(firstName, whyLabel);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: 'Welcome to CornerDay — your corner starts here', html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  await supabase.from('badges').insert({ user_id: userId, badge_type: 'welcome_email_sent' });
  console.log(`Welcome email sent to ${userId}`);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
