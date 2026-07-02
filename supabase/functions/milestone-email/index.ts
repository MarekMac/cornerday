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

interface MilestoneDef {
  days: number;
  badge: string;
  label: string;
  emoji: string;
  heading: string;
  message: string;
}

const MILESTONES: MilestoneDef[] = [
  { days: 7,    badge: '1_week',   label: '1 week',   emoji: '', heading: 'One full week.',    message: 'A week without gambling. That\'s not a small thing — most people can\'t make it past the first few days.' },
  { days: 14,   badge: '2_weeks',  label: '2 weeks',  emoji: '', heading: 'Two weeks.',        message: 'Two weeks clean. You\'ve made it through two full weekends, two full sets of triggers. That\'s momentum.' },
  { days: 30,   badge: '1_month',  label: '1 month',  emoji: '', heading: 'One month clean.',  message: 'A month. You\'ve officially built a new pattern. Your brain is literally rewiring itself right now.' },
  { days: 60,   badge: '60_days',  label: '60 days',  emoji: '', heading: '60 days.',          message: 'Two months. You\'re well past the hardest window. What started as willpower is becoming who you are.' },
  { days: 90,   badge: '3_months', label: '3 months', emoji: '', heading: 'Three months.',     message: 'Research says 90 days is when new habits truly take root. Yours already have. You did that.' },
  { days: 182,  badge: '6_months', label: '6 months', emoji: '', heading: 'Half a year.',      message: 'Six months clean. Half a year of choosing yourself, every single day. That\'s extraordinary.' },
  { days: 365,  badge: '1_year',   label: '1 year',   emoji: '', heading: 'One year.',         message: 'A full year. Think about where you were 365 days ago. Look where you are now. You did this.' },
  { days: 730,  badge: '2_years',  label: '2 years',  emoji: '', heading: 'Two years.',        message: 'Two years clean. You\'re living proof that it\'s possible. And you\'re just getting started.' },
  { days: 1095, badge: '3_years',  label: '3 years',  emoji: '', heading: 'Three years.',      message: 'Three years. This is who you are now — and it\'s something to be genuinely proud of.' },
];

function parseQuitMs(ts: string | null, date: string | null): number {
  if (ts) {
    const iso = ts.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const ms = Date.parse(iso);
    if (!isNaN(ms)) return ms;
  }
  if (date) {
    const ms = Date.parse(date + 'T00:00:00Z');
    if (!isNaN(ms)) return ms;
  }
  return 0;
}

function buildHtml(firstName: string, m: MilestoneDef, totalDays: number): string {
  const next = MILESTONES.find(n => n.days > m.days);
  const nextBlock = next ? `
    <tr><td style="background:#e6f7f7;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:11px;color:#5a7a7a;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Next milestone</div>
      <div style="font-size:20px;font-weight:800;color:#0F6E6E;">${next.label}</div>
      <div style="font-size:13px;color:#5a7a7a;margin-top:4px;">${next.days - totalDays} day${next.days - totalDays !== 1 ? 's' : ''} away</div>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Milestone reached</title><meta name="color-scheme" content="light dark"><style>@media (prefers-color-scheme:dark){img.cdl{display:none!important}img.cdd{display:inline!important}}</style></head>
<body style="margin:0;padding:0;background:#f5fbfb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbfb;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(150deg,#0a4f4f 0%,#0F6E6E 55%,#1a9a9a 100%);border-radius:20px 20px 0 0;padding:44px 36px 40px;text-align:center;color:#fff;">
    <img src="${ICON}" width="56" height="56" alt="CornerDay" class="cdl" style="display:block;margin:0 auto 12px;border-radius:13px;"/><img src="${ICON_DARK}" width="56" height="56" alt="CornerDay" class="cdd" style="display:none;margin:0 auto 12px;border-radius:13px;"/>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.6;margin-bottom:14px;">CornerDay</div>
    <div style="font-size:30px;font-weight:900;line-height:1.15;margin-bottom:10px;">${m.heading}</div>
    <div style="font-size:20px;font-weight:600;color:rgba(255,255,255,0.85);">${totalDays} days clean</div>
  </td></tr>

  <tr><td style="background:#fff;padding:32px 36px 28px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:16px;color:#3a5a5a;line-height:1.75;padding-bottom:22px;">
      ${firstName}, ${m.message}
    </td></tr>

    <tr><td style="border-left:3px solid #0F6E6E;padding:14px 16px;background:#e6f7f7;border-radius:0 10px 10px 0;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your milestone</div>
      <div style="font-size:24px;font-weight:900;color:#0F6E6E;">${m.label}</div>
      <div style="font-size:13px;color:#5a7a7a;margin-top:4px;">${totalDays} days without gambling</div>
    </td></tr>

    ${nextBlock ? `<tr><td style="height:14px;"></td></tr>${nextBlock}` : ''}

    <tr><td style="height:22px;"></td></tr>
    <tr><td style="font-size:13px;color:#5a7a7a;text-align:center;border-top:1px solid #e6f7f7;padding-top:16px;line-height:1.6;">
      Keep going. We'll be here every step of the way.
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json().catch(() => ({}));

  if (body.user_id) {
    const { data: user } = await supabase
      .from('users')
      .select('email, display_name, quit_date, quit_timestamp, notif_milestone')
      .eq('id', body.user_id)
      .maybeSingle();

    if (!user?.email || user.notif_milestone === false) {
      return new Response(JSON.stringify({ skipped: 'no email or notifications off' }), { status: 200 });
    }

    // Recompute the streak server-side from quit_timestamp rather than trusting
    // body.streak — a wrong/stale value from the caller would send a false
    // "you've hit N days" congratulation email, which matters more than usual
    // given this app's whole purpose is honestly tracking recovery progress.
    const quitMs = parseQuitMs(user.quit_timestamp, user.quit_date);
    if (!quitMs) return new Response(JSON.stringify({ skipped: 'no quit date' }), { status: 200 });
    const totalDays = Math.floor(Math.max(0, Date.now() - quitMs) / 86_400_000);

    const milestone = MILESTONES.find(m => m.days === totalDays);
    if (!milestone) return new Response(JSON.stringify({ skipped: 'not a milestone day' }), { status: 200 });

    const { data: existing } = await supabase
      .from('badges').select('id').eq('user_id', body.user_id).eq('badge_type', milestone.badge).maybeSingle();
    if (existing) return new Response(JSON.stringify({ skipped: 'already sent' }), { status: 200 });

    const { error: insertError } = await supabase
      .from('badges')
      .insert({ user_id: body.user_id, badge_type: milestone.badge, earned_at: new Date().toISOString() });
    if (insertError) {
      if (insertError.code === '23505') return new Response(JSON.stringify({ skipped: 'race' }), { status: 200 });
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
    }

    const html = buildHtml(esc(user.display_name?.split(' ')?.[0] || 'there'), milestone, totalDays);

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [user.email], subject: `You've reached ${milestone.label} clean — CornerDay`, html }),
    });
    if (!emailRes.ok) return new Response(JSON.stringify({ error: await emailRes.text() }), { status: 500 });
    console.log(`Milestone ${milestone.label} webhook email sent to ${body.user_id}`);
    return new Response(JSON.stringify({ ok: true, mode: 'webhook', milestone: milestone.badge }), { status: 200 });
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, display_name, quit_date, quit_timestamp, notif_milestone')
    .not('email', 'is', null)
    .not('quit_date', 'is', null)
    .neq('notif_milestone', false);

  if (error || !users) {
    console.error('Failed to fetch users:', error);
    return new Response(JSON.stringify({ error: 'failed to fetch users' }), { status: 500 });
  }

  let sent = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  for (const user of users) {
    try {
      const quitMs    = parseQuitMs(user.quit_timestamp, user.quit_date);
      if (!quitMs) { skipped++; continue; }

      const elapsed   = Math.max(0, Date.now() - quitMs);
      const totalDays = Math.floor(elapsed / 86_400_000);

      const milestone = MILESTONES.find(m => {
        const msAtMilestone = m.days * 86_400_000;
        return elapsed >= msAtMilestone && (elapsed - 86_400_000) < msAtMilestone;
      });

      if (!milestone) { skipped++; continue; }

      const { data: existing } = await supabase
        .from('badges')
        .select('id')
        .eq('user_id', user.id)
        .eq('badge_type', milestone.badge)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error: insertError } = await supabase
        .from('badges')
        .insert({ user_id: user.id, badge_type: milestone.badge, earned_at: new Date().toISOString() });

      if (insertError) {
        if (insertError.code === '23505') { skipped++; continue; }
        throw new Error(`Badge insert failed: ${insertError.message}`);
      }

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [user.email],
          subject: `You've reached ${milestone.label} clean — CornerDay`,
          html: buildHtml(esc(user.display_name?.split(' ')?.[0] || 'there'), milestone, totalDays),
        }),
      });

      if (!emailRes.ok) {
        const body = await emailRes.text();
        throw new Error(`Resend ${emailRes.status}: ${body}`);
      }

      sent++;
      console.log(`Milestone ${milestone.label} email sent to ${user.id}`);
    } catch (err) {
      console.error(`Failed for ${user.id}:`, err);
      errors.push(`${user.id}: ${String(err)}`);
      failed++;
    }
  }

  console.log(`Milestone emails — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
  return new Response(JSON.stringify({ sent, skipped, failed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
