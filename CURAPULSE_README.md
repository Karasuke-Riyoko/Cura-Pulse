# CuraPulse: run, demo and Supabase setup

## Run
```bash
npm install
npm run dev        # http://localhost:3000
```
Routes: `/` Patient (Riyo) · `/doctor` Doctor workspace · `/support` Support Desk · `/admin` Master Admin · `POST /api/symptom-check`.
Every page has the same top bar (`components/RoleNav.tsx`) with the active role highlighted.

## Supabase (run once in the SQL editor)
```sql
create table if not exists public.sos_incidents (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  patient_name text,
  phone text,
  blood_group text,
  allergies text[],
  chronic_conditions text[],
  latitude double precision,
  longitude double precision,
  status text default 'ACTIVE'
);
alter table public.sos_incidents enable row level security;
create policy "demo anon insert" on public.sos_incidents for insert to anon with check (true);
create policy "demo anon read"   on public.sos_incidents for select to anon using (true);
create policy "demo anon update" on public.sos_incidents for update to anon using (true) with check (true);
-- Realtime: make sure the table is in the realtime publication
alter publication supabase_realtime add table public.sos_incidents;
```
The patient app retries with comma-separated strings if your columns are `text`, and falls back to a local receipt if the insert fails.

## Gemini note
Google has retired `gemini-1.5-flash` for this key (it returns 404). The route still tries it first, then falls through to
`gemini-3.1-flash-lite`, `gemini-3.5-flash` and `gemini-flash-lite-latest`. If every model fails, it returns a rule-based
offline advisory with the same JSON shape. The key lives only in `app/api/symptom-check/route.ts` (verified: not in the client bundle).

## 3-minute demo script
1. `/` → Use demo patient → Send OTP → Tap to autofill → Continue → Save & enter Riyo. Reload: the passport persists (localStorage `curapulse_patient_passport`).
2. Smart Symptom Checker → "Crushing chest pain…" → Urgency Status CRITICAL → the SOS panel flashes.
3. Press SOS → 5-second countdown with 880 Hz beeps → GPS (DTU fallback) → Supabase insert → family SMS ticks → Call 108 / 112.
4. `/support` → the incident appears live with the siren → pick an ambulance (ETA auto-calculated) → Transmit Pre-Intake → nearest trauma center shown under the map.
5. `/` Find Care → "skin rash" + Show Female Doctors Only → fallback banner with Tier 1 / Tier 2.
6. Chat & Book → Book (token #CP-xxx) → Arrival Slip QR → E-Prescription → Find in Nearby Pharmacies → Chaperone → Vitals (trend chart) → Records (24-hour consent with countdown).
7. `/doctor` → type "Amoxicillin" in the Rx pad for a Penicillin-allergic patient → conflict warning → sign → printable Rx with signature and council seal. New Doctor Registration → submit → it appears in `/support` → Doctor Verification.
8. `/admin` → KPIs (users, active doctors, active SOS, dispatch latency), realtime health, Suspend Profile / Verify Doctor / Revoke License, audit log payload inspector, AI certificate inspector, research repository.
