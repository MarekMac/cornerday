import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'CornerDay <noreply@cornerday.app>';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ESC[c]);


interface MilestoneDef {
  days: number;
  badge: string;
  label: string;
  emoji: string;
  heading: string;
  message: string;
}

const MILESTONES: MilestoneDef[] = [
  { days: 7,    badge: '1_week',   label: '1 week',   emoji: '⭐', heading: 'One full week.',    message: 'A week without gambling. That\'s not a small thing — most people can\'t make it past the first few days.' },
  { days: 30,   badge: '1_month',  label: '1 month',  emoji: '🔥', heading: 'One month clean.',  message: 'A month. You\'ve officially built a new pattern. Your brain is literally rewiring itself right now.' },
  { days: 60,   badge: '60_days',  label: '60 days',  emoji: '🏆', heading: '60 days.',          message: 'Two months. You\'re well past the hardest window. What started as willpower is becoming who you are.' },
  { days: 90,   badge: '3_months', label: '3 months', emoji: '🎯', heading: 'Three months.',     message: 'Research says 90 days is when new habits truly take root. Yours already have. You did that.' },
  { days: 182,  badge: '6_months', label: '6 months', emoji: '💎', heading: 'Half a year.',      message: 'Six months clean. Half a year of choosing yourself, every single day. That\'s extraordinary.' },
  { days: 365,  badge: '1_year',   label: '1 year',   emoji: '👑', heading: 'One year.',         message: 'A full year. Think about where you were 365 days ago. Look where you are now. You did this.' },
  { days: 730,  badge: '2_years',  label: '2 years',  emoji: '🌟', heading: 'Two years.',        message: 'Two years clean. You\'re living proof that it\'s possible. And you\'re just getting started.' },
  { days: 1095, badge: '3_years',  label: '3 years',  emoji: '✨', heading: 'Three years.',      message: 'Three years. This is who you are now — and it\'s something to be genuinely proud of.' },
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
  // Next milestone
  const next = MILESTONES.find(n => n.days > m.days);
  const nextBlock = next ? `
    <tr><td style="background:#f9fdfd;border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:12px;color:#5a8a8a;margin-bottom:4px;">Next milestone</div>
      <div style="font-size:18px;font-weight:700;color:#0F6E6E;">${next.emoji} ${next.label}</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">${next.days - totalDays} day${next.days - totalDays !== 1 ? 's' : ''} away</div>
    </td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Milestone reached</title></head>
<body style="margin:0;padding:0;background:#e6f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e6f0f0;padding:24px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

  <tr><td style="background:linear-gradient(135deg,#0F6E6E 0%,#1a9a9a 100%);border-radius:16px 16px 0 0;padding:40px 28px 36px;text-align:center;color:#fff;">
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.65;margin-bottom:12px;">CornerDay</div>
    <div style="font-size:56px;margin-bottom:14px;">${m.emoji}</div>
    <div style="font-size:28px;font-weight:900;line-height:1.15;margin-bottom:8px;">${m.heading}</div>
    <div style="font-size:20px;font-weight:600;color:rgba(255,255,255,0.85);">${totalDays} days clean</div>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:28px 28px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">

    <tr><td style="font-size:16px;color:#333;line-height:1.75;padding-bottom:20px;">
      ${firstName}, ${m.message}
    </td></tr>

    <tr><td style="border-left:3px solid #0F6E6E;padding:12px 14px;background:#f9fdfd;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#0F6E6E;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Your milestone</div>
      <div style="font-size:22px;font-weight:900;color:#0F6E6E;">${m.label} ${m.emoji}</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">${totalDays} days without gambling</div>
    </td></tr>

    ${nextBlock ? `<tr><td style="height:12px;"></td></tr>${nextBlock}` : ''}

    <tr><td style="height:24px;"></td></tr>

    <tr><td style="text-align:center;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:16px;line-height:1.6;">
      Keep going. We'll be here every step of the way.
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
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

      // Find a milestone the user crossed today (within last 24 hours)
      const milestone = MILESTONES.find(m => {
        const msAtMilestone = m.days * 86_400_000;
        return elapsed >= msAtMilestone && (elapsed - 86_400_000) < msAtMilestone;
      });

      if (!milestone) { skipped++; continue; }

      // Check badge to prevent duplicate sends
      const { data: existing } = await supabase
        .from('badges')
        .select('id')
        .eq('user_id', user.id)
        .eq('badge_type', milestone.badge)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Award badge + send email in parallel
      const [badgeRes, emailRes] = await Promise.all([
        supabase.from('badges').insert({ user_id: user.id, badge_type: milestone.badge }),
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [user.email],
            subject: `${milestone.emoji} You've reached ${milestone.label} clean — CornerDay`,
            html: buildHtml(esc(user.display_name?.split(' ')?.[0] || 'there'), milestone, totalDays),
          }),
        }),
      ]);

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
