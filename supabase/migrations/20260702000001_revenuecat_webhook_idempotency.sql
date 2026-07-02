-- Dedup table for RevenueCat webhook events. RevenueCat can redeliver the
-- same event (timeouts, retries), and a captured/replayed request could
-- otherwise flip is_premium repeatedly. Each event.id is claimed exactly
-- once via the primary key; a conflict means "already processed, skip."
create table if not exists public.revenuecat_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

alter table public.revenuecat_webhook_events enable row level security;
-- No client access — only the service-role key (used by the edge function) touches this table.

-- Cheap cleanup target for old rows (not scheduled automatically; safe to run periodically).
create index if not exists revenuecat_webhook_events_received_at_idx
  on public.revenuecat_webhook_events (received_at);
