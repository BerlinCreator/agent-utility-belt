create extension if not exists pgcrypto;

create table if not exists public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Default Key',
  key text not null unique,
  tier text not null default 'free',
  daily_limit integer not null default 100,
  usage_today integer not null default 0,
  last_reset timestamptz default now(),
  created_at timestamptz default now(),
  is_active boolean default true
);

alter table public.api_keys enable row level security;

create policy "Users can view own keys" on public.api_keys
  for select using (auth.uid() = user_id);

create policy "Users can create own keys" on public.api_keys
  for insert with check (auth.uid() = user_id);

create policy "Users can update own keys" on public.api_keys
  for update using (auth.uid() = user_id);

create policy "Users can delete own keys" on public.api_keys
  for delete using (auth.uid() = user_id);
