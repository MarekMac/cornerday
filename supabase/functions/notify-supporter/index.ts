import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);

function firstName(displayName: string | null): string {
  if (!displayName) return 'Someone you care about';
  return esc(displayName.split(' ')[0] || displayName);
}

function partnerUrl(token: string): string {
  return `https://cornerday.app/partner?t=${encodeURIComponent(token)}`;
}

function ctaButton(url: string, label: string): string {
  return `<tr><td style="padding-top:20px;text-align:center;">
    <a href="${url}" style="display:inline-block;background:#0F6E6E;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px;">${label}</a>
  </td></tr>`;
}

function emailShell(body: string): string {
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">
  <tr><td style="background:linear-gradient(135deg,#0F6E6E,#1a9a9a);border-radius:16px 16px 0 0;padding:28px;text-align:center;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:6px;">CornerDay</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);">Someone in your corner</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    ${body}
    <tr><td style="height:20px;"></td></tr>
    <tr><td style="font-size:11px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;text-align:center;line-height:1.6;">
      You're receiving this because someone shared their CornerDay recovery link with you.
    </td></tr>
  </table>
  </td></tr>
  <tr><td style="height:20px;"></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildUrgeEmail(name: string, token: string): string {
  return emailShell(`
    <tr><td style="font-size:28px;text-align:center;padding-bottom:12px;">💙</td></tr>
    <tr><td style="font-size:20px;font-weight:800;color:#1a2e2e;text-align:center;padding-bottom:8px;">${name} is struggling right now</td></tr>
    <tr><td style="font-size:15px;color:#555;line-height:1.7;padding-bottom:4px;">
      They're having a gambling urge and opened the support screen in CornerDay. A message from you right now could make all the difference.
    </td></tr>
    ${ctaButton(partnerUrl(token), 'Send them a message 💙')}
  `);
}

function buildRelapseEmail(name: string, token: string): string {
  return emailShell(`
    <tr><td style="font-size:28px;text-align:center;padding-bottom:12px;">🤝</td></tr>
    <tr><td style="font-size:20px;font-weight:800;color:#1a2e2e;text-align:center;padding-bottom:8px;">${name} has restarted their streak</td></tr>
    <tr><td style="font-size:15px;color:#555;line-height:1.7;padding-bottom:4px;">
      They had a slip and reset their counter. This is a normal part of recovery — the fact that they're still in the app and still trying is what matters. Reaching out without judgment goes a long way.
    </td></tr>
    ${ctaButton(partnerUrl(token), 'Send them encouragement')}
  `);
}

function buildMilestoneEmail(name: string, milestoneLabel: string, token: string): string {
  return emailShell(`
    <tr><td style="font-size:40px;text-align:center;padding-bottom:12px;">🎉</td></tr>
    <tr><td style="font-size:20px;font-weight:800;color:#1a2e2e;text-align:center;padding-bottom:8px;">${name} just hit ${esc(milestoneLabel)}!</td></tr>
    <tr><td style="font-size:15px;color:#555;line-height:1.7;padding-bottom:4px;">
      They've reached a new milestone without gambling. That's a real achievement worth celebrating — let them know you're proud.
    </td></tr>
    ${ctaButton(partnerUrl(token), 'Send congratulations 🎉')}
  `);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const body = await req.json().catch(() => ({}));
  const type: string = body.type ?? '';
  const milestoneLabel: string = body.milestone_label ?? '';

  // Test mode: service role key + test_user_id bypasses user JWT requirement
  let userId: string | null = null;
  if (body.test_user_id) {
    // Verify caller holds the actual service role key (full token comparison, not payload decoding)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    userId = body.test_user_id;
  } else {
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    userId = user.id;
  }

  if (!['urge', 'relapse', 'milestone'].includes(type)) {
    return new Response(JSON.stringify({ error: 'invalid_type' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { data: link } = await sb
    .from('partner_links')
    .select('id, token, supporter_email, notify_urge, notify_relapse, notify_milestone, last_urge_notify_at, urge_notify_count_today, urge_notify_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (!link?.supporter_email || !link[`notify_${type}` as keyof typeof link]) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (type === 'urge') {
    const today = new Date().toISOString().split('T')[0];
    const countToday = link.urge_notify_date === today ? (link.urge_notify_count_today ?? 0) : 0;

    if (link.last_urge_notify_at) {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      if (new Date(link.last_urge_notify_at).getTime() > twoHoursAgo) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'rate_limited' }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    if (countToday >= 3) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'daily_limit' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  const { data: userData } = await sb
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  const name = firstName(userData?.display_name ?? null);
  const token: string = link.token;
  const to = link.supporter_email as string;

  let subject = '';
  let html = '';

  if (type === 'urge') {
    subject = `${name} is struggling right now 💙`;
    html = buildUrgeEmail(name, token);
  } else if (type === 'relapse') {
    subject = `${name} has restarted their streak`;
    html = buildRelapseEmail(name, token);
  } else {
    subject = `🎉 ${name} just hit ${milestoneLabel}!`;
    html = buildMilestoneEmail(name, milestoneLabel || 'a new milestone', token);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ ok: false, error: err }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (type === 'urge') {
    const today = new Date().toISOString().split('T')[0];
    const countToday = link.urge_notify_date === today ? (link.urge_notify_count_today ?? 0) : 0;
    await sb.from('partner_links').update({
      last_urge_notify_at: new Date().toISOString(),
      urge_notify_date: today,
      urge_notify_count_today: countToday + 1,
    }).eq('id', link.id);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
