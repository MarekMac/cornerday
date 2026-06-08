-- Add emoji column to community_reactions
-- Existing rows default to ❤️, unique constraint stays (one reaction per user per post)
alter table community_reactions add column emoji text not null default '❤️';
