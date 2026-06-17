// Supabase Edge Function: notify-feedback
// Called directly from the app after a feedback row is inserted.
// Sends an email to the admin via Resend, with reply-to set to the user's email.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   — from resend.com
//   ADMIN_EMAIL      — where feedback emails go (e.g. marekmac.ski@gmail.com)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TYPE_LABEL: Record<string, string> = {
  bug:     '🐛 Bug Report',
  feature: '✨ Feature Request',
  general: '💬 General Feedback',
};

const MAX_MESSAGE_LENGTH = 5000;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
    }

    const { type, message, app_version } = await req.json();
    const user_email = user.email ?? null;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const adminEmail   = Deno.env.get('ADMIN_EMAIL') ?? 'marekmac.ski@gmail.com';

    if (!resendApiKey) {
      console.warn('RESEND_API_KEY not set — skipping email');
      return new Response(JSON.stringify({ ok: true, skipped: 'no_resend_key' }), { status: 200 });
    }

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'missing message' }), { status: 400 });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(JSON.stringify({ ok: false, error: 'message too long' }), { status: 400 });
    }

    const typeLabel  = TYPE_LABEL[type] ?? type;
    const versionTxt = app_version ? `v${app_version}` : 'unknown';
    const sentAt     = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
        <div style="background:linear-gradient(135deg,#0F6E6E,#1a9a9a);padding:24px 28px;border-radius:12px 12px 0 0">
          <h2 style="margin:0;color:#fff;font-size:20px">CornerDay — ${typeLabel}</h2>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;background:#fafafa">
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
            <tr>
              <td style="padding:6px 0;color:#888;width:110px">From</td>
              <td style="padding:6px 0">${user_email ? esc(user_email) : '<em>anonymous</em>'}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#888">App version</td>
              <td style="padding:6px 0">${versionTxt}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#888">Sent at</td>
              <td style="padding:6px 0">${sentAt}</td>
            </tr>
          </table>
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:16px;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc(message)}</div>
          ${user_email ? `<p style="margin-top:20px;font-size:13px;color:#888">Reply to this email to respond directly to the user.</p>` : ''}
        </div>
      </div>`;

    const emailPayload: Record<string, unknown> = {
      from:    'CornerDay <noreply@cornerday.app>',
      to:      [adminEmail],
      subject: `CornerDay Feedback — ${typeLabel}`,
      html,
    };

    if (user_email) emailPayload.reply_to = user_email;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(emailPayload),
    });

    const resendBody = await resendRes.json();
    console.log('Resend response:', JSON.stringify(resendBody));

    return new Response(JSON.stringify({ ok: true, resend: resendBody }), { status: 200 });
  } catch (err) {
    console.error('notify-feedback error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
