# CuraPulse · Closed-Loop Emergency Healthcare & Patient Safety Platform
> Engineered by **Team HAVOC** (Anshul, Mayank, Vishv, Shreyanshi) for **Vihaan X (IEEE DTU)** — Software & HealthTech Track.

---

## 🌟 Executive Summary

**CuraPulse** is a unified healthcare and emergency coordination platform designed to eliminate emergency dispatch fragmentation, streamline doctor consultations, protect women patients with verified chaperone protocols, and enforce clinical safety rules.

The platform provides a unified multi-role gateway with 5 interconnected workspaces in a single Next.js 14 App Router architecture:

1. **Patient Mobile Portal ("Riyo")** — Route: `/`  
   * Mobile-first responsive frame with top-left hamburger menu (`☰`), greeting with blood group & allergy chips, active doctor consultation card, recent messages, concentric 3D radar SOS trigger with 4 orbiting data nodes (`Live GPS`, `Blood Group`, `Hospital Pre-intake`, `Family SMS`), and 5 primary navigation tabs: `Home`, `Chats` *(with unread badge)*, `Find care`, `Vitals`, and `Records`.
2. **First-Time Sign-In & Verification** — Route: `/login`  
   * Dual-role authentication portal for Patients (Mobile OTP + Emergency Health Snapshot + ICE contacts + DPDP 2023 consent) and Doctors (National Medical Commission `#DL-2018-09412` verification, council registration, specialization, and 6-digit digital signature PIN).
3. **Doctor Clinical Workspace** — Route: `/doctor`  
   * Clinical command center for Dr. Sunita Sharma featuring active clinic hours, patient queue with priority triage tokens (`#CP-101`), interactive `RxPad` with real-time allergy conflict auto-blocking (e.g. Penicillin / Sulfa), chaperone nurse assignment, and vitals trend charts.
4. **Emergency Support Desk** — Route: `/support`  
   * 24/7 emergency dispatch command center with live Supabase Realtime WebSocket listener, pure Web Audio dual-tone acoustic siren, patient emergency dossier, geospatial trauma center routing (DTU Campus North-West Delhi), ambulance dispatch controls, and a Doctor Credential Vetting desk.
5. **Master Admin Console** — Route: `/admin`  
   * Platform-wide telemetry (Active Doctors, Active SOS, Dispatch Latency), searchable user directory with governance actions (`Suspend Profile`, `Verify Doctor`, `Revoke License`), master emergency audit log, and anonymized research repository.
6. **Server-Side AI Safety Engine** — Route: `/api/symptom-check`  
   * Telemedicine-compliant symptom triage assistant powered by Google Gemini with strict fallback rules that **never prescribe prescription dosages or medications** in accordance with Indian National Medical Commission (NMC) regulations.

---

## 🎨 Design System & Palette (Team HAVOC)

| Color Token | Hex Code | Usage |
| :--- | :--- | :--- |
| **Deep Forest / Pine Teal** | `#132E27` / `#176B63` | Primary brand headers, active cards, and primary action buttons |
| **Mint & Soft Sage** | `#99D5C9` / `#DCEFE8` | Active navigation pills, supportive card surfaces, and ECG line |
| **Warm Canvas** | `#F7FAF8` | Clean, reassuring background canvas |
| **Warm Light Orange** | `#FFEDD5` (bg) / `#FB923C` / `#F97316` | Upcoming appointment slots, unread doctor advice, vitals highlights |
| **Emergency Coral Red** | `#C94C4C` | Reserved strictly for active SOS alerts, sirens, and critical warnings |
| **Slate Ink** | `#263746` | High-contrast readable body typography |

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js 18+ (tested on Node.js v20 / v24)
- npm or pnpm

### Setup
```bash
# Clone the repository
git clone https://github.com/Karasuke-Riyoko/Cura-Pulse.git
cd Cura-Pulse

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

On Windows, you can double-click **`start.bat`** to kill any conflicting processes on port 3000, launch the dev server, and automatically open your default browser.

---

## 🗄️ Supabase Realtime Schema

Run the following SQL in your Supabase SQL Editor to enable Realtime emergency dispatch:

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
create policy "anon insert" on public.sos_incidents for insert to anon with check (true);
create policy "anon read"   on public.sos_incidents for select to anon using (true);
create policy "anon update" on public.sos_incidents for update to anon using (true) with check (true);

-- Enable Realtime replication
alter publication supabase_realtime add table public.sos_incidents;
```

---

## 📂 Project Structure

```text
├── app/
│   ├── layout.tsx              # Root layout with Inter font and canvas styles
│   ├── globals.css             # Tailwind CSS tokens, 3D shadows, and custom animations
│   ├── page.tsx                # Patient Mobile Experience (Riyo)
│   ├── login/
│   │   └── page.tsx            # First-Time Sign-In & Verification Portal
│   ├── doctor/
│   │   └── page.tsx            # Doctor Workspace & RxPad
│   ├── support/
│   │   └── page.tsx            # 24/7 Emergency Support Desk & Incident Dispatch
│   ├── admin/
│   │   └── page.tsx            # Governance, Telemetry & Audit Logs
│   └── api/
│       └── symptom-check/
│           └── route.ts        # Server-side Gemini AI symptom guidance
├── components/
│   ├── Shell.tsx               # Responsive Frame, TopBar Role Switcher & Navigation
│   ├── RoleNav.tsx             # Global TopBar role switcher wrapper
│   └── ui.tsx                  # Design system primitives (Cards, Badges, Buttons, etc.)
├── lib/
│   └── supabase.ts             # Supabase client singleton with graceful offline fallback
├── public/                     # Static assets and icons
├── tailwind.config.js          # Team HAVOC theme tokens and 3D shadows
├── tsconfig.json               # TypeScript strict configuration
├── start.bat                   # Windows one-click launcher
└── package.json
```

---

## 🛡️ Privacy & Compliance
- **Digital Personal Data Protection (DPDP) Act 2023:** All health snapshot records are stored encrypted on the patient's device (`localStorage`). Doctors only access clinical records via explicit 24-hour revocable authorization.
- **NMC Telemedicine Guidelines 2020:** The AI symptom checker does not prescribe medications. Prescriptions require doctor authentication and digital signature PIN verification.
