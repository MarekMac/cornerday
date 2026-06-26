const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const ok  = () => new Response('{}', { status: 200, headers: JSON_HEADERS });
const err = (msg: string, status = 500) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });

const ICON = 'https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon.png';

const footer = `
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
  </td></tr>`;

const confirmationHtml = (confirmUrl: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm your CornerDay email</title></head>
<body style="margin:0;padding:0;background:#f5fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbfb;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">
      <tr><td style="background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);border-radius:20px 20px 0 0;padding:44px 36px 40px;text-align:center;color:#fff;">
        <img src="${ICON}" width="56" height="56" alt="CornerDay" style="display:block;margin:0 auto 12px;border-radius:13px;"/>
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;margin-bottom:14px;">CornerDay</div>
        <div style="font-size:26px;font-weight:900;line-height:1.2;margin-bottom:10px;">Confirm your email</div>
        <div style="font-size:15px;opacity:0.85;line-height:1.5;">One tap and you're on your way.</div>
      </td></tr>
      <tr><td style="background:#fff;padding:32px 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:15px;color:#3a5a5a;line-height:1.75;padding-bottom:24px;">
            Thanks for signing up. Tap the button below to confirm your email address and start your recovery journey.
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:24px;">
            <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:12px;">Confirm email address</a>
          </td></tr>
          <tr><td style="font-size:13px;color:#5a7a7a;text-align:center;line-height:1.6;border-top:1px solid #e6f7f7;padding-top:16px;">
            If you didn't create a CornerDay account, you can safely ignore this email.
          </td></tr>
        </table>
      </td></tr>
      ${footer}
      <tr><td style="height:32px;"></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const recoveryHtml = (resetUrl: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset your CornerDay password</title></head>
<body style="margin:0;padding:0;background:#f5fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbfb;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">
      <tr><td style="background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);border-radius:20px 20px 0 0;padding:44px 36px 40px;text-align:center;color:#fff;">
        <img src="${ICON}" width="56" height="56" alt="CornerDay" style="display:block;margin:0 auto 12px;border-radius:13px;"/>
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;margin-bottom:14px;">CornerDay</div>
        <div style="font-size:26px;font-weight:900;line-height:1.2;margin-bottom:10px;">Reset your password</div>
        <div style="font-size:15px;opacity:0.85;line-height:1.5;">Click the button below to choose a new password.</div>
      </td></tr>
      <tr><td style="background:#fff;padding:32px 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:15px;color:#3a5a5a;line-height:1.75;padding-bottom:24px;">
            You requested a password reset for your CornerDay account. This link expires in 1 hour.
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:24px;">
            <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:12px;">Reset password</a>
          </td></tr>
          <tr><td style="font-size:13px;color:#5a7a7a;text-align:center;line-height:1.6;border-top:1px solid #e6f7f7;padding-top:16px;">
            If you did not request this, you can safely ignore this email. Your account is secure.
          </td></tr>
        </table>
      </td></tr>
      ${footer}
      <tr><td style="height:32px;"></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const HOOK_SECRET = Deno.env.get('HOOK_SECRET');

Deno.serve(async (req: Request) => {
  if (HOOK_SECRET) {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== HOOK_SECRET) {
      return err('Unauthorized', 401);
    }
  }

  let data: { user: { email: string }; email_data: { email_action_type: string; token?: string; token_hash?: string; redirect_to: string } };

  try {
    data = await req.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { user, email_data } = data ?? {};
  if (!user?.email || !email_data?.email_action_type) {
    return err('Missing required fields', 400);
  }

  const { email_action_type, token_hash, token, redirect_to } = email_data;

  if (email_action_type !== 'recovery' && email_action_type !== 'signup') {
    return ok();
  }

  const verifyToken = token_hash || token;
  if (!verifyToken) {
    console.error('No token or token_hash in email_data');
    return err('Missing token', 400);
  }

  const redirectUrl = `${SUPABASE_URL}/functions/v1/auth-reset-redirect?token_hash=${encodeURIComponent(verifyToken)}&type=${encodeURIComponent(email_action_type)}`;

  const isSignup = email_action_type === 'signup';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'CornerDay <noreply@cornerday.app>',
      to: [user.email],
      subject: isSignup ? 'Confirm your CornerDay email' : 'Reset your CornerDay password',
      html: isSignup ? confirmationHtml(redirectUrl) : recoveryHtml(redirectUrl),
    }),
  });

  if (!res.ok) {
    const resErr = await res.json().catch(() => ({}));
    console.error('Resend error:', JSON.stringify(resErr));
    return err('Failed to send email');
  }

  return ok();
});
