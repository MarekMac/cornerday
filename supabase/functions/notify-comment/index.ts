// Supabase Edge Function: notify-comment
// Triggered by a Supabase Database Webhook on INSERT to community_comments.
// Sends an Expo push notification to the post owner when someone else comments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: string;
    post_id: string;
    user_id: string;
    content: string;
    created_at: string;
  };
  old_record: null | Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!;

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (!timingSafeEqual(auth, `Bearer ${WEBHOOK_SECRET}`)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  try {
    const payload: WebhookPayload = await req.json();

    // Only handle INSERT events
    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { post_id, user_id: commenter_id } = payload.record;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch post to get the owner
    const { data: post, error: postError } = await supabase
      .from('community_posts')
      .select('user_id')
      .eq('id', post_id)
      .maybeSingle();

    if (postError || !post) {
      console.error('Could not fetch post:', postError);
      return new Response(JSON.stringify({ ok: false, error: 'post not found' }), { status: 200 });
    }

    const post_owner_id: string = post.user_id;

    // Don't notify if the commenter is the post owner
    if (commenter_id === post_owner_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'self-comment' }), { status: 200 });
    }

    // Fetch post owner's push token and notification preferences
    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('expo_push_token, display_name, notif_community')
      .eq('id', post_owner_id)
      .maybeSingle();

    if (ownerError || !owner?.expo_push_token) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_token' }), { status: 200 });
    }

    if (owner.notif_community === false) {
      return new Response(JSON.stringify({ ok: true, skipped: 'notif_community_off' }), { status: 200 });
    }

    // Fetch commenter's display name for the notification body
    const { data: commenter } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', commenter_id)
      .maybeSingle();

    const commenterName = commenter?.display_name ?? 'Someone';
    // Never put actual post/comment text in a push body — community stories
    // routinely include relapse details and money talk, and push notifications
    // render on the lock screen where a partner/family member could see it.
    // Keep it to a generic, non-identifying line.

    const message: ExpoPushMessage = {
      to: owner.expo_push_token,
      sound: 'default',
      title: `${commenterName} commented on your story`,
      body: 'Tap to read their reply.',
      data: { screen: `/(tabs)/community/${post_id}` },
    };

    // Send via Expo Push API
    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const expoBody = await expoRes.json();
    if (!expoRes.ok) {
      console.error('Expo push API error:', JSON.stringify(expoBody));
      return new Response(JSON.stringify({ ok: false, error: 'push_api_error', expo: expoBody }), { status: 200 });
    }

    // Single-message response: { data: { status, id } } or { data: { status: 'error', ... } }
    const ticket = expoBody?.data;
    if (ticket?.status === 'error') {
      if (ticket?.details?.error === 'DeviceNotRegistered') {
        await supabase.from('users').update({ expo_push_token: null }).eq('id', post_owner_id);
        console.warn('Cleared stale push token for user:', post_owner_id);
      } else {
        console.error('Expo push error:', JSON.stringify(ticket));
      }
      return new Response(JSON.stringify({ ok: false, error: ticket?.message }), { status: 200 });
    }

    console.log('Push sent to', post_owner_id, '— ticket:', ticket?.id);
    return new Response(JSON.stringify({ ok: true, expo: expoBody }), { status: 200 });
  } catch (err) {
    console.error('notify-comment error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200 });
  }
});
