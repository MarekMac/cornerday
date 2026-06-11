import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    .select('id, user_id, expires_at')
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
    .select('display_name, quit_timestamp, quit_date')
    .eq('id', link.user_id)
    .single();

  const parseTs = (s: string | null): number => {
    if (!s) return 0;
    // PostgreSQL returns "2026-02-02 13:08:00+00" — normalise to ISO 8601
    const iso = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const ms = Date.parse(iso);
    return isNaN(ms) ? 0 : ms;
  };
  const quitMs = parseTs(user?.quit_timestamp) || parseTs(user?.quit_date ? user.quit_date + 'T00:00:00Z' : null);
  const streakMs = Math.max(0, Date.now() - quitMs);
  const displayName = user?.display_name ?? null;

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ streakMs, displayName }), {
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
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
