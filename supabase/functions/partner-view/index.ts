import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    .select('id, user_id, expires_at, share_mood, share_milestones, share_recovery, supporter_email, notify_urge, notify_relapse, notify_milestone')
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
    .maybeSingle();

  const parseTs = (s: string | null): number => {
    if (!s) return 0;
    let iso = s.trim().replace(' ', 'T');
    // Add colon to bare ±HH offset: "+00" → "+00:00", "-05" → "-05:00"
    iso = iso.replace(/([+-])(\d{2})$/, '$1$2:00');
    // Add colon to offset without colon: "+0530" → "+05:30"
    iso = iso.replace(/([+-])(\d{2})(\d{2})$/, '$1$2:$3');
    const ms = Date.parse(iso);
    return isNaN(ms) ? 0 : ms;
  };
  const quitMs = parseTs(user?.quit_timestamp) || parseTs(user?.quit_date ? user.quit_date + 'T00:00:00Z' : null);
  // Guard: if no quit date is set (new user or deleted account) return zero streak
  // rather than Date.now() - 0 which would incorrectly show ~55 years.
  if (!quitMs) {
    return new Response(JSON.stringify({ streakMs: 0, displayName: user?.display_name ?? null }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const streakMs = Math.max(0, Date.now() - quitMs);
  const displayName = user?.display_name ?? null;

  if (req.method === 'GET') {
    const result: Record<string, unknown> = { streakMs, displayName };

    const fetches: Promise<void>[] = [];

    if (link.share_mood !== false) {
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

    if (link.share_milestones !== false) {
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

    if (link.share_recovery === true) {
      fetches.push((async () => {
        const { data: lossRows } = await sb
          .from('losses')
          .select('type, amount')
          .eq('user_id', link.user_id);
        const rows = (lossRows ?? []) as { type: string; amount: number }[];
        const totalLost = rows.filter(r => r.type === 'loss').reduce((s, r) => s + Number(r.amount), 0);
        const totalPaid = rows.filter(r => r.type === 'payment').reduce((s, r) => s + Number(r.amount), 0);
        result.totalLost = totalLost;
        result.totalPaid = totalPaid;
        result.recoveryPct = totalLost > 0 ? Math.min(Math.round((totalPaid / totalLost) * 100), 100) : null;

        // Estimated money saved = weekly_bet / 7 * streak_days (fractional, matches home screen)
        const weeklyBet = Number(user?.weekly_bet ?? 0);
        if (weeklyBet > 0) {
          const streakDays = streakMs / 86_400_000;
          result.moneySaved = Math.round(weeklyBet * streakDays / 7);
          result.currency = user?.currency ?? 'USD';
        }
      })());
    }

    await Promise.all(fetches);

    // Tell the partner page whether the user wants supporter notifications
    // and whether a subscriber email is already on file (boolean only — never expose the address)
    result.notifyEnabled = !!(link.notify_urge || link.notify_relapse || link.notify_milestone);
    result.hasSubscriberEmail = !!(link.supporter_email);

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    // Parse body once — JSON or form-encoded
    const ct = req.headers.get('content-type') ?? '';
    let parsedBody: Record<string, unknown> = {};
    if (ct.includes('application/json')) {
      parsedBody = await req.json().catch(() => ({}));
    } else {
      const form = await req.formData().catch(() => new FormData());
      parsedBody = { email: form.get('email') ?? '', message: form.get('message') ?? '' };
    }

    // Email subscription: body has `email` key → save supporter_email
    const email = String(parsedBody.email ?? '').trim().toLowerCase();
    if (email) {
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailValid) {
        return new Response(JSON.stringify({ error: 'invalid_email' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      await sb.from('partner_links').update({ supporter_email: email }).eq('id', link.id);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Message: body has `message` key
    const message = String(parsedBody.message ?? '').trim().slice(0, 200);

    if (message) {
      const { error: insertErr } = await sb.from('partner_messages').insert({ link_id: link.id, message });
      if (insertErr) {
        return new Response(JSON.stringify({ error: 'Failed to save message' }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

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
