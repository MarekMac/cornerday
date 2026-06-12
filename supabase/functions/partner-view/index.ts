import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MILESTONE_LABELS: Record<string, string> = {
  '1_hour': '1 Hour', '3_hours': '3 Hours', '6_hours': '6 Hours', '12_hours': '12 Hours',
  '1_day': '1 Day', '3_days': '3 Days', '1_week': '1 Week', '10_days': '10 Days',
  '2_weeks': '2 Weeks', '3_weeks': '3 Weeks', '1_month': '1 Month', '45_days': '45 Days',
  '2_months': '2 Months', '3_months': '3 Months', '4_months': '4 Months',
  '5_months': '5 Months', '6_months': '6 Months', '9_months': '9 Months',
  '1_year': '1 Year', '18_months': '18 Months', '2_years': '2 Years',
  '3_years': '3 Years', '4_years': '4 Years', '5_years': '5 Years',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';

  if (!token) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: link } = await sb
    .from('partner_links')
    .select('id, user_id, expires_at, share_mood, share_milestones, share_recovery')
    .eq('token', token)
    .maybeSingle();

  if (!link) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: 'expired' }), {
      status: 410, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { data: user } = await sb
    .from('users')
    .select('display_name, quit_timestamp, quit_date, weekly_bet, currency')
    .eq('id', link.user_id)
    .single();

  const parseTs = (s: string | null): number => {
    if (!s) return 0;
    const iso = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const ms = Date.parse(iso);
    return isNaN(ms) ? 0 : ms;
  };
  const quitMs = parseTs(user?.quit_timestamp) || parseTs(user?.quit_date ? user.quit_date + 'T00:00:00Z' : null);
  const streakMs = Math.max(0, Date.now() - quitMs);
  const displayName = user?.display_name ?? null;

  if (req.method === 'GET') {
    const result: Record<string, unknown> = { streakMs, displayName };

    const fetches: Promise<void>[] = [];

    if (link.share_mood) {
      fetches.push((async () => {
        const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const { data: moods } = await sb
          .from('mood_checkins')
          .select('mood')
          .eq('user_id', link.user_id)
          .gte('created_at', weekAgo);
        const list = (moods ?? []) as { mood: number }[];
        result.moodAvg = list.length > 0 ? list.reduce((s, m) => s + m.mood, 0) / list.length : null;
        result.moodCheckins = list.length;
      })());
    }

    if (link.share_milestones) {
      fetches.push((async () => {
        const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
        const [badgeCountRes, latestRes, urgeRes] = await Promise.all([
          sb.from('badges').select('id', { count: 'exact', head: true }).eq('user_id', link.user_id),
          sb.from('badges').select('badge_type, earned_at').eq('user_id', link.user_id)
            .order('earned_at', { ascending: false }).limit(1).maybeSingle(),
          sb.from('urge_journal').select('id', { count: 'exact', head: true })
            .eq('user_id', link.user_id).eq('outcome', 'overcame').gte('created_at', weekAgo),
        ]);
        result.milestonesEarned = badgeCountRes.count ?? 0;
        result.latestMilestoneLabel = latestRes.data?.badge_type
          ? (MILESTONE_LABELS[latestRes.data.badge_type] ?? latestRes.data.badge_type)
          : null;
        result.urgesResisted = urgeRes.count ?? 0;
      })());
    }

    if (link.share_recovery) {
      fetches.push((async () => {
        const { data: rows } = await sb
          .from('losses')
          .select('type, amount')
          .eq('user_id', link.user_id)
          .in('type', ['loss', 'payment']);
        const list = (rows ?? []) as { type: string; amount: number }[];
        const totalLost = list.filter(r => r.type === 'loss').reduce((s, r) => s + Number(r.amount), 0);
        const totalPaid = list.filter(r => r.type === 'payment').reduce((s, r) => s + Number(r.amount), 0);
        result.totalLost = totalLost;
        result.totalPaid = totalPaid;
        result.recoveryPct = totalLost > 0 ? Math.min(Math.round((totalPaid / totalLost) * 100), 100) : null;

        // Estimated money saved = weekly_bet / 7 * streak_days
        const weeklyBet = Number(user?.weekly_bet ?? 0);
        if (weeklyBet > 0) {
          const streakDays = Math.floor(streakMs / 86_400_000);
          result.moneySaved = Math.round(weeklyBet * streakDays / 7);
          result.currency = user?.currency ?? 'USD';
        }
      })());
    }

    await Promise.all(fetches);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    let message = '';
    const ct = req.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      message = String(body.message ?? '').trim().slice(0, 200);
    } else {
      const form = await req.formData().catch(() => new FormData());
      message = String(form.get('message') ?? '').trim().slice(0, 200);
    }
    if (message) {
      await sb.from('partner_messages').insert({ link_id: link.id, message });

      // Push notification — non-fatal if token missing or push fails
      try {
        const { data: tokenRow } = await sb
          .from('users')
          .select('expo_push_token')
          .eq('id', link.user_id)
          .maybeSingle();
        if (tokenRow?.expo_push_token) {
          const preview = message.length > 100 ? message.slice(0, 100) + '…' : message;
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: tokenRow.expo_push_token,
              sound: 'default',
              title: 'Someone in your corner 💙',
              body: preview,
              data: { screen: '/(tabs)/' },
            }),
          });
        }
      } catch (_) { /* push is non-fatal */ }
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
