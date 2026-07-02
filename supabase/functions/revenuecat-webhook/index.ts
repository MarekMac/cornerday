import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

const PREMIUM_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

const LAPSE_EVENTS = new Set([
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Validate webhook shared secret (RevenueCat may send raw or Bearer-prefixed)
  const authHeader = req.headers.get('Authorization') ?? '';
  const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
  const authValue = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  const authOk = !!expectedSecret && timingSafeEqual(authValue, expectedSecret);
  if (!authOk) {
    console.warn(`[revenuecat-webhook] auth mismatch — format: ${authHeader.startsWith('Bearer ') ? 'Bearer' : 'raw'}, length: ${authHeader.length}`);
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const event = body?.event;
  const eventType: string = event?.type ?? '';
  const appUserId: string = event?.app_user_id ?? '';
  const eventId: string = event?.id ?? '';
  const environment: string = event?.environment ?? '';

  if (!appUserId) {
    return new Response('OK', { status: 200 });
  }

  // Sandbox/test purchases must never affect a real user's premium status.
  // RevenueCat always sets this field; treat anything but an explicit
  // "PRODUCTION" as untrusted and acknowledge without applying it.
  if (environment !== 'PRODUCTION') {
    console.warn(`[revenuecat-webhook] ignoring non-production event (environment=${environment || 'missing'}, type=${eventType})`);
    return new Response('OK', { status: 200 });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(appUserId)) {
    console.warn(`[revenuecat-webhook] invalid app_user_id format: ${appUserId}`);
    return new Response('OK', { status: 200 });
  }

  const isPremium = PREMIUM_EVENTS.has(eventType)
    ? true
    : LAPSE_EVENTS.has(eventType)
    ? false
    : null;

  // Unknown event type — acknowledge but don't update
  if (isPremium === null) {
    return new Response('OK', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Replay/redelivery guard: claim this event.id exactly once. A conflict
  // means we've already applied it (retry, or a captured/replayed request) — skip.
  if (eventId) {
    const { error: claimError } = await supabase
      .from('revenuecat_webhook_events')
      .insert({ event_id: eventId });
    if (claimError) {
      if (claimError.code === '23505') {
        return new Response('OK', { status: 200 });
      }
      console.error('[revenuecat-webhook] event claim error:', claimError.message);
      return new Response('Internal error', { status: 500 });
    }
  }

  const { data: updated, error } = await supabase
    .from('users')
    .update({ is_premium: isPremium })
    .eq('id', appUserId)
    .select('id');

  if (error) {
    console.error('[revenuecat-webhook] update error:', error.message);
    return new Response('Internal error', { status: 500 });
  }

  if (!updated || updated.length === 0) {
    console.warn(`[revenuecat-webhook] no user row found for app_user_id=${appUserId} (event=${eventType})`);
    return new Response('OK', { status: 200 });
  }

  console.log(`[revenuecat-webhook] ${eventType} → user ${appUserId} → is_premium=${isPremium}`);
  return new Response('OK', { status: 200 });
});
