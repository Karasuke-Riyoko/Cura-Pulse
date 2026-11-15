-- CuraPulse update: Admin directory of real sign-ups + patient phone ringing. Safe to re-run.
create table if not exists public.app_users (
  id            text primary key,          -- "<role>:<email or phone>"
  role          text not null,
  full_name     text,
  contact       text,
  method        text,
  age           int,
  sex           text,
  blood_group   text,
  doctor_status text,
  created_at    timestamptz default now(),
  last_seen_at  timestamptz default now()
);
alter table public.app_users enable row level security;
drop policy if exists "demo all app_users" on public.app_users;
create policy "demo all app_users" on public.app_users for all to anon, authenticated using (true) with check (true);
do $$ begin alter publication supabase_realtime add table public.app_users; exception when duplicate_object then null; end $$;

alter table public.sos_incidents add column if not exists support_ring_at timestamptz;
