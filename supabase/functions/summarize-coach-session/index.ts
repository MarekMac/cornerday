import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': 'https://cornerday.app',
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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

    const rawBody = await req.text();
    if (rawBody.length > 32768) return json({ error: 'payload_too_large' }, 413);

    const { messages } = JSON.parse(rawBody) as {
      messages: { role: string; content: string }[];
    };

    if (!Array.isArray(messages) || messages.length < 2) {
      return json({ ok: true, skipped: true }, 200);
    }

    const { data: profile } = await admin
      .from('users')
      .select('is_premium, is_admin, coach_context')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_premium && !profile?.is_admin) {
      return json({ error: 'Premium required' }, 403);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return json({ error: 'AI service unavailable' }, 503);

    const conversationText = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? 'User' : 'AI Corner'}: ${m.content}`)
      .join('\n');

    const existingSummary = profile.coach_context ?? '';

    const systemPrompt = `You maintain a concise context summary for an AI gambling recovery coach. Your summaries help the coach remember key details about the user across sessions. Be factual, compassionate, and brief.`;

    const userPrompt = existingSummary
      ? `Previous summary:\n${existingSummary}\n\nNew conversation:\n${conversationText}\n\nWrite an updated summary (max 250 words) that captures: recovery progress, key struggles or breakthroughs mentioned, any goals or plans discussed, emotional patterns, and anything important for continuity. Merge old and new naturally — do not repeat unchanged facts unnecessarily.`
      : `Conversation:\n${conversationText}\n\nWrite a brief summary (max 250 words) capturing: recovery progress, key struggles or breakthroughs mentioned, any goals or plans discussed, emotional patterns, and anything important for an AI coach to remember for future sessions.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error('Anthropic summarize error:', await res.text());
      return json({ error: 'AI service error' }, 502);
    }

    const result = await res.json();
    const newContext = result.content?.[0]?.text?.trim();
    if (!newContext) return json({ ok: true, skipped: true }, 200);

    await admin.from('users').update({ coach_context: newContext }).eq('id', user.id);

    return json({ ok: true }, 200);
  } catch (err) {
    console.error('summarize-coach-session error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
