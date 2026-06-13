import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DAILY_LIMIT = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profile } = await admin
      .from('users')
      .select('is_premium, is_admin, display_name, motivation, trigger, goal, quit_date, ai_messages_today, ai_messages_date')
      .eq('id', user.id)
      .single();

    if (!profile?.is_premium && !profile?.is_admin) {
      return json({ error: 'Premium required' }, 403);
    }

    // Daily limit — admins are exempt
    if (!profile.is_admin) {
      const today = new Date().toISOString().slice(0, 10);
      const isToday = profile.ai_messages_date === today;
      const usedToday = isToday ? (profile.ai_messages_today ?? 0) : 0;

      if (usedToday >= DAILY_LIMIT) {
        return json({ error: 'Daily limit reached', remaining: 0 }, 429);
      }

      // Increment before streaming — message is being consumed regardless of stream outcome
      await admin
        .from('users')
        .update({
          ai_messages_today: usedToday + 1,
          ai_messages_date: today,
        })
        .eq('id', user.id);

      const remaining = DAILY_LIMIT - (usedToday + 1);

      const { messages } = await req.json();
      if (!Array.isArray(messages) || messages.length === 0) {
        return json({ error: 'messages required' }, 400);
      }

      const upstream = await callAnthropic(profile, messages);
      if (!upstream.ok) {
        const err = await upstream.text();
        console.error('Anthropic error:', err);
        return json({ error: 'AI service error' }, 502);
      }

      return new Response(upstream.body, {
        headers: {
          ...CORS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
          'X-Messages-Remaining': String(remaining),
        },
      });
    }

    // Admin path — no limit
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages required' }, 400);
    }

    const upstream = await callAnthropic(profile, messages);
    if (!upstream.ok) {
      const err = await upstream.text();
      console.error('Anthropic error:', err);
      return json({ error: 'AI service error' }, 502);
    }

    return new Response(upstream.body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Messages-Remaining': '999',
      },
    });
  } catch (err) {
    console.error('ai-coach error:', err);
    return json({ error: String(err) }, 500);
  }
});

async function callAnthropic(profile: any, messages: unknown[]) {
  const name = profile.display_name ?? 'there';
  const motivation = profile.motivation ?? 'a better life';
  const trigger = profile.trigger ?? 'urges';
  const goal = profile.goal ?? 'stay free from gambling';

  let daysClean = 0;
  if (profile.quit_date) {
    const ms = Date.now() - new Date(profile.quit_date).getTime();
    daysClean = Math.max(0, Math.floor(ms / 86_400_000));
  }

  const cleanLabel = daysClean === 0
    ? 'just starting out'
    : daysClean === 1 ? '1 day clean' : `${daysClean} days clean`;

  const systemPrompt = `You are AI Corner — a compassionate, evidence-based support companion helping ${name} overcome gambling addiction. You speak in a warm, conversational tone — never clinical or preachy.

About ${name}:
- Why they want to quit: ${motivation}
- Biggest trigger: ${trigger}
- Primary goal: ${goal}
- Recovery progress: ${cleanLabel}

Your approach:
- Ground your support in CBT and motivational interviewing, but keep language natural and human
- Celebrate every step of progress, however small
- When ${name} is struggling with an urge, offer practical grounding techniques tailored to their specific trigger (${trigger})
- If they mention a relapse or slip, respond with compassion — "a slip is a data point, not a failure"
- Reference their personal reason for quitting (${motivation}) when it's genuinely relevant, without being repetitive
- Keep responses concise and focused — 2 to 3 short paragraphs max unless they clearly need more
- If they seem to be in crisis or mention self-harm, immediately share the National Problem Gambling Helpline: 1-800-522-4700 (free, 24/7)

You are a supportive coach, not a replacement for professional therapy. For serious mental health concerns, gently encourage professional support while continuing to offer what you can.`;

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not set');

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });
}
