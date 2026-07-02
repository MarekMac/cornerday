import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_SECRET') ?? '';
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

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

const ICON = 'https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon.png';
const ICON_DARK = 'https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon-dark.png';

function buildHtml(firstName: string, whyLabel: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to CornerDay</title><meta name="color-scheme" content="light dark"><style>@media (prefers-color-scheme:dark){img.cdl{display:none!important}img.cdd{display:inline!important}}</style></head>
<body style="margin:0;padding:0;background:#f5fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbfb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);border-radius:20px 20px 0 0;padding:44px 36px 40px;text-align:center;color:#fff;">
    <img src="${ICON}" width="56" height="56" alt="CornerDay" class="cdl" style="display:block;margin:0 auto 12px;border-radius:13px;"/><img src="${ICON_DARK}" width="56" height="56" alt="CornerDay" class="cdd" style="display:none;margin:0 auto 12px;border-radius:13px;"/>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;margin-bottom:14px;">CornerDay</div>
    <div style="font-size:28px;font-weight:900;line-height:1.2;margin-bottom:10px;">Welcome, ${firstName}.</div>
    <div style="font-size:15px;opacity:0.85;line-height:1.5;">The day you turn it around starts today.</div>
  </td></tr>

  <tr><td style="background:#fff;padding:32px 36px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#3a5a5a;line-height:1.75;padding-bottom:22px;">
      You've taken a real step today. Most people never do. CornerDay is here to keep you going — every hour, every day.
    </td></tr>

    <tr><td style="border-left:3px solid #0F6E6E;padding:12px 16px;background:#e6f7f7;border-radius:0 10px 10px 0;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your why</div>
      <div style="font-size:15px;color:#1a2e2e;font-weight:700;">${whyLabel}</div>
    </td></tr>

    <tr><td style="height:22px;"></td></tr>
    <tr><td style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:12px;">What's inside the app</td></tr>

    <tr><td style="background:#e6f7f7;border-radius:14px;padding:18px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:16px;">&#x1F4C5;</td>
        <td style="vertical-align:top;padding-bottom:16px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Streak tracker</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Every day clean counts. Watch your streak grow, earn badges at 1 week, 1 month, 6 months and beyond.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:16px;">&#x1F6A8;</td>
        <td style="vertical-align:top;padding-bottom:16px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Urge support</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Breathing exercises, distraction tools, and a direct line to the National Problem Gambling Helpline — available the moment you need it.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:16px;">&#x1F4B0;</td>
        <td style="vertical-align:top;padding-bottom:16px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Loss &amp; debt tracker</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Log what was lost, record payments as you make them, and watch your recovery progress bar move. Honest numbers, no shame.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:16px;">&#x1F4D4;</td>
        <td style="vertical-align:top;padding-bottom:16px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Urge journal</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Log urges as you face them — what triggered it, how you handled it. Patterns become visible. Knowledge becomes power.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:16px;">&#x1F465;</td>
        <td style="vertical-align:top;padding-bottom:16px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Community</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">An anonymous space to share wins, post on hard days, and hear from others on the same journey. You're not alone in this.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;">&#x1F916;</td>
        <td style="vertical-align:top;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">AI Coach <span style="font-size:11px;font-weight:600;color:#fff;background:#0F6E6E;border-radius:6px;padding:2px 7px;vertical-align:middle;">Premium</span></div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">24/7 private support from an AI coach trained on evidence-based recovery strategies. Available whenever you need to talk it through.</div>
        </td>
      </tr>
    </table>
    </td></tr>

    <tr><td style="height:20px;"></td></tr>
    <tr><td style="font-size:13px;color:#5a7a7a;text-align:center;border-top:1px solid #e6f7f7;padding-top:16px;line-height:1.6;">
      We'll send you a weekly progress recap every Sunday.<br>
      To manage notifications: <strong style="color:#0F6E6E;">Account → Notifications</strong>
    </td></tr>

  </table>
  </td></tr>

  <tr><td style="background:#081e1e;border-radius:0 0 20px 20px;padding:22px 28px;text-align:center;">
    <div>
      <img src="${ICON}" width="24" height="24" alt="CornerDay" class="cdl" style="border-radius:6px;opacity:0.85;vertical-align:middle;margin-right:7px;"/><img src="${ICON_DARK}" width="24" height="24" alt="CornerDay" class="cdd" style="display:none;border-radius:6px;opacity:0.85;vertical-align:middle;margin-right:7px;"/>
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
  if (!WEBHOOK_SECRET) {
    console.error('WEBHOOK_SECRET env var not set');
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!timingSafeEqual(auth, `Bearer ${WEBHOOK_SECRET}`)) {
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

  // Claim the "sent" badge FIRST, via the unique constraint on
  // (user_id, badge_type), instead of check-then-send-then-insert — a
  // retried/duplicate webhook delivery arriving before the old
  // check-then-send flow's insert had completed could pass the same
  // "not yet sent" check and send the email twice.
  const { error: claimErr } = await supabase
    .from('badges').insert({ user_id: userId, badge_type: 'welcome_email_sent' });
  if (claimErr) {
    if (claimErr.code === '23505') {
      return new Response(JSON.stringify({ skipped: 'already sent' }), { status: 200 });
    }
    console.error('Badge claim failed:', claimErr.message);
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 });
  }

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

  console.log(`Welcome email sent to ${userId}`);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
