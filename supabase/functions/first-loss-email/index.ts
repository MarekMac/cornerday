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

function fmtCurrency(amount: number, currency: string): string {
  const syms: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł', AUD: 'A$', CAD: 'C$' };
  return `${syms[currency] ?? currency + ' '}${Math.round(amount).toLocaleString('en')}`;
}

function buildHtml(firstName: string, amountFmt: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You logged your first loss</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 28px 36px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
    <div style="font-size:36px;margin-bottom:14px;">💪</div>
    <div style="font-size:24px;font-weight:800;line-height:1.2;margin-bottom:10px;">That took courage, ${firstName}.</div>
    <div style="font-size:15px;opacity:0.85;line-height:1.5;">Logging ${amountFmt} is one of the hardest things to do.</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      Most people never face the real number. You just did. That honesty is exactly what recovery is built on — not willpower alone, but the truth.
    </td></tr>

    <tr><td style="background:#f9fdfd;border-radius:12px;padding:18px;margin-bottom:20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;color:#0F6E6E;font-weight:700;padding-bottom:8px;">What logging does for you</td>
      </tr>
      <tr><td style="font-size:13px;color:#555;line-height:1.7;">
        ✓&nbsp; Creates a number you can actually work toward paying back<br>
        ✓&nbsp; Turns shame into something concrete and manageable<br>
        ✓&nbsp; Starts the recovery progress bar — every payment chips away at it
      </td></tr>
    </table>
    </td></tr>

    <tr><td style="height:4px;"></td></tr>

    <tr><td style="font-size:15px;color:#333;line-height:1.7;padding-bottom:20px;">
      You can log payments whenever you make them, and watch the number shrink. One entry at a time.
    </td></tr>

    <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      Loss Tracker is in the second tab of CornerDay.
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

  const body   = await req.json().catch(() => ({}));
  const record = body.record ?? body;
  const { user_id, amount, type } = record;

  if (type !== 'loss') return new Response(JSON.stringify({ skipped: 'not a loss entry' }), { status: 200 });
  if (!user_id)        return new Response(JSON.stringify({ error: 'no user_id' }), { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Only send for the very first loss entry
  const { count } = await supabase
    .from('losses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .eq('type', 'loss');

  if ((count ?? 0) > 1) return new Response(JSON.stringify({ skipped: 'not first loss' }), { status: 200 });

  const { data: user } = await supabase
    .from('users')
    .select('email, display_name, currency')
    .eq('id', user_id)
    .maybeSingle();

  if (!user?.email) return new Response(JSON.stringify({ error: 'user not found' }), { status: 404 });

  const firstName  = user.display_name?.split(' ')[0] || 'there';
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
