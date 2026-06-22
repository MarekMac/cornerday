const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const ok  = () => new Response('{}', { status: 200, headers: JSON_HEADERS });
const err = (msg: string, status = 500) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });

const confirmationHtml = (confirmUrl: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">
      <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 36px 36px;text-align:center;color:#fff;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
        <div style="font-size:40px;margin-bottom:14px;">&#x1F331;</div>
        <div style="font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;">Confirm your email</div>
        <div style="font-size:14px;opacity:0.8;line-height:1.5;">One tap and you're on your way.</div>
      </td></tr>
      <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:32px 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
            Thanks for signing up. Tap the button below to confirm your email address and start your recovery journey.
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:20px;">
            <a href="${confirmUrl}" style="display:inline-block;background:linear-gradient(135deg,#0F6E6E,#1a9a9a);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;">Confirm email address</a>
          </td></tr>
          <tr><td style="font-size:13px;color:#999;text-align:center;padding-bottom:16px;line-height:1.6;">
            If you didn't create a CornerDay account, you can safely ignore this email.
          </td></tr>
          <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
            CornerDay &mdash; The day you turn it around starts today.
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="height:24px;"></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const recoveryHtml = (resetUrl: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">
      <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 36px 36px;text-align:center;color:#fff;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
        <div style="font-size:40px;margin-bottom:14px;">&#x1F511;</div>
        <div style="font-size:24px;font-weight:800;line-height:1.2;margin-bottom:8px;">Reset your password</div>
        <div style="font-size:14px;opacity:0.8;line-height:1.5;">Click the button below to choose a new password.</div>
      </td></tr>
      <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:32px 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
            You requested a password reset for your CornerDay account. This link expires in 1 hour.
          </td></tr>
          <tr><td style="text-align:center;padding-bottom:20px;">
            <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#0F6E6E,#1a9a9a);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;">Reset password</a>
          </td></tr>
          <tr><td style="font-size:13px;color:#999;text-align:center;padding-bottom:16px;line-height:1.6;">
            If you did not request this, you can safely ignore this email. Your account is secure.
          </td></tr>
          <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
            CornerDay &mdash; The day you turn it around starts today.
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="height:24px;"></td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

Deno.serve(async (req: Request) => {
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
  console.log('auth-hook-email full payload:', JSON.stringify(email_data));

  // Only handle signup confirmation and password recovery
  if (email_action_type !== 'recovery' && email_action_type !== 'signup') {
    return ok();
  }

  // Use token_hash if present, fall back to token
  const verifyToken = token_hash || token;
  if (!verifyToken) {
    console.error('No token or token_hash in email_data');
    return err('Missing token', 400);
  }

  const appDeepLink = email_action_type === 'signup'
    ? 'cornerday://confirm-email'
    : 'cornerday://reset-password';

  // Use Supabase's native verify endpoint — it verifies the token and redirects
  // to the deep link with access_token + refresh_token in the URL fragment.
  const redirectUrl = `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(verifyToken)}&type=${email_action_type}&redirect_to=${encodeURIComponent(appDeepLink)}`;

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
