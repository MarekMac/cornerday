-- Create public avatars bucket (safe to run even if it already exists)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Allow authenticated users to upload avatars
create policy "avatars_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars');

-- Allow authenticated users to delete their own avatars
create policy "avatars_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' AND owner = auth.uid());

-- Allow public read (so avatar URLs work without auth)
create policy "avatars_select"
on storage.objects for select
using (bucket_id = 'avatars');
