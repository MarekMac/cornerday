// Supabase Edge Function: notify-feedback
// Called directly from the app after a feedback row is inserted.
// Sends an email to the admin via Resend, with reply-to set to the user's email.
//
// Required secrets (set via Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   — from resend.com
//   ADMIN_EMAIL      — where feedback emails go (e.g. marekmac.ski@gmail.com)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TYPE_LABEL: Record<string, string> = {
  bug:     '🐛 Bug Report',
  feature: '✨ Feature Request',
  general: '💬 General Feedback',
};

Deno.serve(async (req: Request) => {
  try {
    const { feedback_id } = await req.json();
    if (!feedback_id) {
      return new Response(JSON.stringify({ ok: false, error: 'missing feedback_id' }), { status: 400 });
    }

    const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey     = Deno.env.get('RESEND_API_KEY');
    const adminEmail       = Deno.env.get('ADMIN_EMAIL') ?? 'marekmac.ski@gmail.com';

    if (!resendApiKey) {
      console.warn('RESEND_API_KEY not set — skipping email');
      return new Response(JSON.stringify({ ok: true, skipped: 'no_resend_key' }), { status: 200 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the feedback row
    const { data: fb, error: fbErr } = await supabase
      .from('feedback')
      .select('type, message, app_version, user_id, created_at')
      .eq('id', feedback_id)
      .single();

    if (fbErr || !fb) {
      console.error('Could not fetch feedback:', fbErr);
      return new Response(JSON.stringify({ ok: false, error: 'feedback not found' }), { status: 200 });
    }

    // Resolve the sender's email from auth.users (service role required)
    let userEmail: string | null = null;
    if (fb.user_id) {
      const { data: { user } } = await supabase.auth.admin.getUserById(fb.user_id);
      userEmail = user?.email ?? null;
    }

    const typeLabel  = TYPE_LABEL[fb.type] ?? fb.type;
    const sentAt     = new Date(fb.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    const versionTxt = fb.app_version ? `v${fb.app_version}` : 'unknown';

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
        <div style="background:linear-gradient(135deg,#0F6E6E,#1a9a9a);padding:24px 28px;border-radius:12px 12px 0 0">
          <h2 style="margin:0;color:#fff;font-size:20px">CornerDay — ${typeLabel}</h2>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;background:#fafafa">
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
            <tr>
              <td style="padding:6px 0;color:#888;width:110px">From</td>
              <td style="padding:6px 0">${userEmail ?? '<em>anonymous</em>'}</td>
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
          <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:16px;font-size:15px;line-height:1.6;white-space:pre-wrap">${fb.message}</div>
          ${userEmail ? `<p style="margin-top:20px;font-size:13px;color:#888">Reply to this email to respond directly to the user.</p>` : ''}
        </div>
      </div>`;

    const emailPayload: Record<string, unknown> = {
      from:    'CornerDay <noreply@cornerday.app>',
      to:      [adminEmail],
      subject: `CornerDay Feedback — ${typeLabel}`,
      html,
    };

    if (userEmail) emailPayload.reply_to = userEmail;

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
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200 });
  }
});
