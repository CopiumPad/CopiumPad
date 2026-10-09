create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('price', 'deposit')),
  target_symbol text,
  target_price numeric,
  target_time timestamptz,
  custom_message varchar(50) not null check (char_length(custom_message) between 1 and 50),
  is_triggered boolean not null default false,
  created_at timestamptz not null default now(),
  constraint alerts_target_matches_type check (
    (type = 'price' and target_symbol is not null and length(trim(target_symbol)) > 0 and target_price is not null and target_price > 0 and target_time is null)
    or
    (type = 'deposit' and target_symbol is null and target_price is null and target_time is not null)
  )
);

alter table public.alerts enable row level security;

drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own" on public.alerts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "alerts_insert_own" on public.alerts;
create policy "alerts_insert_own" on public.alerts
  for insert to authenticated with check (auth.uid() = user_id and is_triggered = false);
drop policy if exists "alerts_delete_own" on public.alerts;
create policy "alerts_delete_own" on public.alerts
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists alerts_user_created_at_idx
  on public.alerts (user_id, created_at desc);