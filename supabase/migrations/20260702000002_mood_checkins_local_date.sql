-- The previous unique constraint (mood_checkins_user_day_unique) scopes
-- "one check-in per day" to the UTC calendar day of created_at. The table
-- has no per-user timezone, so this was always a mismatch against what the
-- app actually means by "today" (the user's local day) — and the mismatch
-- can bite in either direction depending on the user's offset:
--   - UTC-negative users could get a spurious second check-in slipped
--     through for the same local day, if a late-night entry rolled onto
--     the next UTC day (already worked around client-side).
--   - The client-side workaround then created the OPPOSITE bug: a client
--     query correctly identifying "no check-in yet today" (local time) could
--     still hit this UTC-scoped constraint on insert, because the *previous*
--     local day's late-evening entry happened to land in the *same* UTC day
--     as today's attempt. The 23505 recovery path would then find and
--     silently overwrite yesterday's row instead of creating today's,
--     and the local-day-aware read query correctly wouldn't recognize
--     that reused old row as "today" — surfacing as the mood immediately
--     resetting to unset right after logging it.
--
-- Fixing this for real requires the DB to know the user's actual local day,
-- not derive one from a UTC timestamp. The client already computes this
-- (see todayStr() in src/app/(tabs)/index.tsx) and now provides it explicitly.

alter table public.mood_checkins add column if not exists local_date date;

-- Best-effort backfill for existing rows: we can't recover the original
-- client's local day after the fact, so approximate with the UTC date
-- (matches the old constraint's behavior — no worse than before for
-- historical rows, and these are single point-in-time entries so exact
-- correctness here is far less important than fixing new writes going forward).
update public.mood_checkins
set local_date = (created_at at time zone 'utc')::date
where local_date is null;

alter table public.mood_checkins alter column local_date set default (now() at time zone 'utc')::date;
alter table public.mood_checkins alter column local_date set not null;

drop index if exists mood_checkins_user_day_unique;

create unique index if not exists mood_checkins_user_local_date_unique
on public.mood_checkins (user_id, local_date);
