-- CuraPulse full schema. Safe to run more than once: it skips anything that already exists.

-- 1. User profiles (linked to Supabase Auth)
create table if not exists public.profiles (
  id                 uuid primary key references auth.users on delete cascade,
  role               text default 'patient',   -- patient | doctor | support | admin
  full_name          text,
  phone              text,
  blood_group        text,
  allergies          text[],
  chronic_conditions text[],
  created_at         timestamptz default now()
);

-- 2. SOS incidents (Support Desk listens live)
create table if not exists public.sos_incidents (
  id                 uuid primary key default gen_random_uuid(),
  patient_name       text,
  phone              text,
  blood_group        text,
  allergies          text[],
  chronic_conditions text[],
  latitude           float8,
  longitude          float8,
  status             text default 'ACTIVE',     -- ACTIVE | RESOLVED
  created_at         timestamptz default now()
);

-- 3. Chat between patients and doctors / support
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    text not null,
  patient_id   text not null,
  patient_name text,
  doctor_id    text not null,
  doctor_name  text,
  sender       text not null check (sender in ('patient','doctor','system')),
  body         text not null default '',
  card         text,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
create index if not exists chat_messages_doctor_idx on public.chat_messages (doctor_id, created_at);

-- Demo access for chat (the app uses the public anon key)
alter table public.chat_messages enable row level security;
drop policy if exists "demo read chat"   on public.chat_messages;
drop policy if exists "demo insert chat" on public.chat_messages;
create policy "demo read chat"   on public.chat_messages for select to anon, authenticated using (true);
create policy "demo insert chat" on public.chat_messages for insert to anon, authenticated with check (true);

-- 4. Live updates for SOS and chat (ignored if already on)
do $$ begin alter publication supabase_realtime add table public.sos_incidents;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_messages; exception when duplicate_object then null; end $$;

-- 5. Doctor applications (sign-up → AI document check → Support Desk decision)
create table if not exists public.doctor_applications (
  id                    text primary key,
  user_id               text,
  full_name             text not null,
  email                 text,
  phone                 text,
  age                   int,
  sex                   text,
  nmc_registration_id   text,
  state_medical_council text,
  degree                text,
  specialty             text,
  experience_years      int,
  hospital_affiliation  text,
  address               text,
  consultation_fee      numeric,
  working_hours         text,
  notes                 text,
  documents             text[],
  ai_review             jsonb,
  verification_status   text not null default 'PENDING',  -- PENDING | VERIFIED_ACTIVE | MORE_INFO | REJECTED
  submitted_at          timestamptz default now(),
  decided_at            timestamptz
);
alter table public.doctor_applications enable row level security;
drop policy if exists "demo read apps"   on public.doctor_applications;
drop policy if exists "demo insert apps" on public.doctor_applications;
drop policy if exists "demo update apps" on public.doctor_applications;
create policy "demo read apps"   on public.doctor_applications for select to anon, authenticated using (true);
create policy "demo insert apps" on public.doctor_applications for insert to anon, authenticated with check (true);
create policy "demo update apps" on public.doctor_applications for update to anon, authenticated using (true) with check (true);

-- 6. Bookings and e-prescriptions (patient app <-> doctor console on different devices)
create table if not exists public.appointments (
  id                     uuid primary key default gen_random_uuid(),
  arrival_token          text unique not null,
  patient_id             text,
  patient_name           text,
  age                    int,
  gender                 text,
  blood_group            text,
  allergies              text[],
  chronic_illnesses      text[],
  chief_complaint        text,
  slot                   text,
  doctor_id              text,
  doctor_name            text,
  chaperone_requested    boolean default false,
  attendant_name         text,
  attendant_id           text,
  chaperone_confirmed_at text,
  status                 text default 'Waiting',
  created_at             timestamptz default now()
);
create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  rx_hash       text unique,
  arrival_token text,
  patient_name  text,
  doctor_name   text,
  nmc_reg       text,
  diagnosis     text,
  findings      text,
  medicines     jsonb,
  advice        text[],
  issued_at     timestamptz default now()
);
create table if not exists public.patients (
  id            uuid primary key default gen_random_uuid(),
  arrival_token text,
  patient_name  text,
  created_at    timestamptz default now()
);

alter table public.appointments  enable row level security;
alter table public.prescriptions enable row level security;
alter table public.patients      enable row level security;
drop policy if exists "demo all appts" on public.appointments;
drop policy if exists "demo all rx"    on public.prescriptions;
drop policy if exists "demo all pts"   on public.patients;
create policy "demo all appts" on public.appointments  for all to anon, authenticated using (true) with check (true);
create policy "demo all rx"    on public.prescriptions for all to anon, authenticated using (true) with check (true);
create policy "demo all pts"   on public.patients      for all to anon, authenticated using (true) with check (true);

do $$ begin alter publication supabase_realtime add table public.appointments;        exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.prescriptions;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.doctor_applications; exception when duplicate_object then null; end $$;

-- 7. Make sure SOS and profiles are reachable from the app even if RLS was switched on
alter table public.sos_incidents enable row level security;
drop policy if exists "demo all sos" on public.sos_incidents;
create policy "demo all sos" on public.sos_incidents for all to anon, authenticated using (true) with check (true);
alter table public.profiles enable row level security;
drop policy if exists "demo all profiles" on public.profiles;
create policy "demo all profiles" on public.profiles for all to anon, authenticated using (true) with check (true);

-- ---------- Support Desk progress on SOS (safe to re-run) ----------
alter table public.sos_incidents add column if not exists ambulance_dispatched      boolean default false;
alter table public.sos_incidents add column if not exists ambulance_unit            text;
alter table public.sos_incidents add column if not exists ambulance_dispatched_at   timestamptz;
alter table public.sos_incidents add column if not exists pre_intake_state          text default 'IDLE';
alter table public.sos_incidents add column if not exists pre_intake_transmitted_at timestamptz;
alter table public.sos_incidents add column if not exists first_action_at           timestamptz;

-- ---------- Admin directory + ring (also in update_2026-11-15_admin_ring.sql) ----------
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
