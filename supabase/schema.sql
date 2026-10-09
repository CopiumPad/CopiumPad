create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username varchar(15) not null check (char_length(username) between 1 and 15),
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  name text not null,
  quantity numeric not null check (quantity >= 0),
  cost_basis numeric not null check (cost_basis >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

alter table public.profiles enable row level security;
alter table public.positions enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = id);

drop policy if exists "positions_select_own" on public.positions;
create policy "positions_select_own" on public.positions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "positions_insert_own" on public.positions;
create policy "positions_insert_own" on public.positions
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "positions_update_own" on public.positions;
create policy "positions_update_own" on public.positions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "positions_delete_own" on public.positions;
create policy "positions_delete_own" on public.positions
  for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar_images_public_read" on storage.objects;
create policy "avatar_images_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "avatar_images_insert_own_folder" on storage.objects;
create policy "avatar_images_insert_own_folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "avatar_images_update_own_folder" on storage.objects;
create policy "avatar_images_update_own_folder" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "avatar_images_delete_own_folder" on storage.objects;
create policy "avatar_images_delete_own_folder" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );