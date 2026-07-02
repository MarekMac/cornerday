import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
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

const ICON = 'https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon.png';
const ICON_DARK = 'https://cdgsiotlocurwnqxebrh.supabase.co/storage/v1/object/public/pages/brand/icon-dark.png';

function fmtCurrency(amount: number, currency: string): string {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  return `${syms[currency] ?? currency + ' '}${Math.round(amount).toLocaleString('en')}`;
}

function buildHtml(firstName: string, amountFmt: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You logged your first loss</title><meta name="color-scheme" content="light dark"><style>@media (prefers-color-scheme:dark){img.cdl{display:none!important}img.cdd{display:inline!important}}</style></head>
<body style="margin:0;padding:0;background:#f5fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbfb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);border-radius:20px 20px 0 0;padding:44px 36px 40px;text-align:center;color:#fff;">
    <img src="${ICON}" width="56" height="56" alt="CornerDay" class="cdl" style="display:block;margin:0 auto 12px;border-radius:13px;"/><img src="${ICON_DARK}" width="56" height="56" alt="CornerDay" class="cdd" style="display:none;margin:0 auto 12px;border-radius:13px;"/>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;margin-bottom:14px;">CornerDay</div>
    <div style="font-size:26px;font-weight:900;line-height:1.2;margin-bottom:10px;">That took courage, ${firstName}.</div>
    <div style="font-size:15px;opacity:0.85;line-height:1.5;">Logging ${amountFmt} is one of the hardest things to do.</div>
  </td></tr>

  <tr><td style="background:#fff;padding:32px 36px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#3a5a5a;line-height:1.75;padding-bottom:22px;">
      Most people never face the real number. You just did. That honesty is exactly what recovery is built on — not willpower alone, but the truth.
    </td></tr>

    <tr><td style="background:#e6f7f7;border-radius:14px;padding:18px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td colspan="2" style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:14px;">How CornerDay helps your financial recovery</td></tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4CA;</td>
        <td style="vertical-align:top;padding-bottom:14px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">See the full picture</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Log every loss and every payment in one place. CornerDay shows you exactly how much you owe and how much you've paid back — no guessing, no avoiding.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4C8;</td>
        <td style="vertical-align:top;padding-bottom:14px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Watch the number shrink</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Every payment you log moves your recovery progress bar. Seeing that bar inch forward is one of the most motivating things in the app.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;padding-bottom:14px;">&#x1F4B8;</td>
        <td style="vertical-align:top;padding-bottom:14px;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Track money not gambled</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">Every week you stay clean, CornerDay shows you how much you didn't spend. Over time, that number tells a powerful story.</div>
        </td>
      </tr>
      <tr>
        <td style="font-size:22px;width:36px;vertical-align:top;">&#x2705;</td>
        <td style="vertical-align:top;padding-left:4px;">
          <div style="font-size:14px;font-weight:700;color:#1a2e2e;">Turn shame into a plan</div>
          <div style="font-size:13px;color:#5a7a7a;margin-top:3px;line-height:1.55;">A number on a screen is something you can work with. Shame kept in your head just grows. You've already done the hardest part.</div>
        </td>
      </tr>
    </table>
    </td></tr>

    <tr><td style="height:18px;"></td></tr>

    <tr><td style="font-size:15px;color:#3a5a5a;line-height:1.75;padding-bottom:20px;">
      Log payments whenever you make them — even small ones count. Every entry moves the bar.
    </td></tr>

    <tr><td style="font-size:13px;color:#5a7a7a;text-align:center;border-top:1px solid #e6f7f7;padding-top:16px;line-height:1.6;">
      Loss Tracker is the second tab in CornerDay.
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

  const body   = await req.json().catch(() => ({}));
  const record = body.record ?? body;
  const { user_id, amount, type } = record;

  // 'session' is the current type for a logged gambling-loss entry (the
  // tracker screen's "Log Loss" tab writes type: 'session') — this used to
  // check for a 'loss' type that no code path has written since the
  // debt-tracker rewrite, so this email could never actually fire.
  if (type !== 'session') return new Response(JSON.stringify({ skipped: 'not a loss entry' }), { status: 200 });
  if (!user_id)        return new Response(JSON.stringify({ error: 'no user_id' }), { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Claim the "sent" badge FIRST, via the unique constraint on
  // (user_id, badge_type), instead of check-then-send-then-insert — a
  // retried/duplicate webhook delivery arriving before the old
  // check-then-send flow's insert had completed could pass the same
  // "not yet sent" check and send the email twice.
  const { error: claimErr } = await supabase
    .from('badges').insert({ user_id: user_id, badge_type: 'first_loss_email_sent' });
  if (claimErr) {
    if (claimErr.code === '23505') {
      return new Response(JSON.stringify({ skipped: 'already sent' }), { status: 200 });
    }
    console.error('Badge claim failed:', claimErr.message);
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 });
  }

  const { data: user } = await supabase
    .from('users')
    .select('email, display_name, currency')
    .eq('id', user_id)
    .maybeSingle();

  if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

  const firstName  = esc(user.display_name?.split(' ')?.[0] || 'there');
  const amountFmt  = fmtCurrency(Number(amount) || 0, user.currency ?? 'USD');
  const html       = buildHtml(firstName, amountFmt);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: 'You logged your first loss — that took courage', html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  console.log(`First-loss email sent to ${user_id}`);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
