"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardList,
  Droplet,
  FileText,
  HeartPulse,
  Lock,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Phone,
  Pin,
  Pill,
  Plus,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
  Unlock,
  UserRound,
  Users,
  Video,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readSession, signOut, fullName as sessionName } from "@/lib/auth";
import { Shell, useViewState } from "@/components/Shell";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ChoiceChip,
  Eyebrow,
  Field,
  LineChart,
  LinkButton,
  Orb,
  Segmented,
  Skeleton,
  Timeline,
  Toast,
  Toggle,
  cx,
  inputCls,
  inputErrCls,
} from "@/components/ui";

// ============================================================================
// CONSTANTS
// ============================================================================
const PASSPORT_KEY = "curapulse_patient_passport";
const DEMO_OTP = "482910";
const DTU_LAT = 28.7499;
const DTU_LNG = 77.117;

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
const ALLERGY_OPTIONS = ["Penicillin", "Sulfa", "Peanuts", "Latex"];
const CONDITION_OPTIONS = ["Asthma", "Diabetes", "Hypertension", "Epilepsy"];
const GENDERS = ["Female", "Male", "Other"] as const;
const SYMPTOM_PRESETS = [
  "Crushing chest pain spreading to left arm",
  "High fever and body ache since 2 days",
  "Wheezing and tight breathing",
  "Mild headache after screen time",
];
const TIME_SLOTS = ["09:30 AM", "10:30 AM", "12:00 PM", "03:30 PM", "05:00 PM", "06:30 PM"];

// ============================================================================
// TYPES
// ============================================================================
type BloodGroup = (typeof BLOOD_GROUPS)[number];
type Gender = (typeof GENDERS)[number];
type CardType = "appointment" | "arrival" | "prescription" | "chaperone" | "vitals" | "records";
type Urgency = "LOW" | "MEDIUM" | "CRITICAL";
type ToastTone = "ok" | "info" | "warn" | "danger";
type Screen =
  | "home"
  | "symptom"
  | "symptomResult"
  | "sos"
  | "sosCountdown"
  | "sosStatus"
  | "care"
  | "book"
  | "confirmed"
  | "chats"
  | "chat"
  | "rx"
  | "vitals"
  | "records"
  | "share"
  | "snapshot"
  | "assistant";
type TabKey = "home" | "care" | "vitals" | "records" | "chats";

interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

interface Profile {
  name: string;
  age: string;
  gender: Gender | "";
  contact: string;
  bloodGroup: BloodGroup | "";
  allergies: string[];
  conditions: string[];
  emergencyContacts: EmergencyContact[];
  researchOptIn: boolean;
}

interface Passport {
  profile: Profile;
  onboarded: boolean;
  savedAt: string;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  conditions: string[];
  gender: "female" | "male";
  nmcId: string;
  fee: number;
  experience: number;
  safetyIndex: number;
  chaperoneGuaranteed: boolean;
  hospital: string;
  distanceKm: number;
  initials: string;
  nextSlot: string;
  video: boolean;
  womenRatings: number;
}

interface ChatMsg {
  id: string;
  sender: "doctor" | "patient" | "system";
  text?: string;
  time: string;
  card?: CardType;
}

interface Booking {
  docId: string;
  date: string;
  dayKey: string;
  slot: string;
  token: string;
  mode: "inperson" | "video";
  chaperone: boolean;
}

interface Vital {
  id: string;
  /** Short test date shown on charts, e.g. "12 Nov". */
  label: string;
  sys: number;
  dia: number;
  pulse: number;
  glucose: number;
  /** Where the test was taken. */
  source?: "Home" | "Clinic" | "Lab";
  sugarType?: "Fasting" | "After meal" | "Random";
}

interface AiResult {
  urgency_level: Urgency;
  first_aid_steps: string[];
  specialist_recommendation: string;
  contraindication_warnings: string[];
  source?: string;
  model?: string;
}

interface SosReceipt {
  ref: string;
  lat: number;
  lng: number;
  usedFallback: boolean;
  synced: boolean;
  syncNote: string;
  time: string;
}

interface SmsState {
  name: string;
  phone: string;
  status: "queued" | "sent" | "delivered";
}

// ============================================================================
// SEED DATA
// ============================================================================
const EMPTY_PROFILE: Profile = {
  name: "",
  age: "",
  gender: "",
  contact: "",
  bloodGroup: "",
  allergies: [],
  conditions: [],
  emergencyContacts: [{ name: "", relation: "", phone: "" }],
  researchOptIn: false,
};

const DEMO_PROFILE: Profile = {
  name: "Aarohi Deshmukh",
  age: "24",
  gender: "Female",
  contact: "+91 98114 72091",
  bloodGroup: "O+",
  allergies: ["Penicillin"],
  conditions: ["Asthma"],
  emergencyContacts: [
    { name: "Meera Deshmukh", relation: "Mother", phone: "+91 98100 55421" },
    { name: "Ishaan Rao", relation: "Roommate", phone: "+91 99716 20834" },
  ],
  researchOptIn: true,
};

const DOCTORS: Doctor[] = [
  { id: "d1", name: "Dr. Sunita Sharma", specialty: "Cardiology & General Medicine", conditions: ["chest pain", "palpitations", "blood pressure", "hypertension", "breathlessness", "fever", "diabetes"], gender: "female", nmcId: "DL-2018-09412", fee: 750, experience: 14, safetyIndex: 4.9, chaperoneGuaranteed: true, hospital: "Apollo Indraprastha", distanceKm: 1.2, initials: "SS", nextSlot: "Today, 15 min", video: true, womenRatings: 312 },
  { id: "d2", name: "Dr. Ananya Verma", specialty: "Gynaecology & Women's Health", conditions: ["period pain", "pregnancy", "pcos", "pelvic pain", "hormonal"], gender: "female", nmcId: "DL-2016-67219", fee: 800, experience: 11, safetyIndex: 5.0, chaperoneGuaranteed: true, hospital: "Fortis La Femme", distanceKm: 2.4, initials: "AV", nextSlot: "Today, 30 min", video: true, womenRatings: 486 },
  { id: "d3", name: "Dr. Rohit Mathur", specialty: "Internal Medicine", conditions: ["fever", "migraine", "headache", "fatigue", "infection", "diabetes"], gender: "male", nmcId: "DL-2009-39104", fee: 500, experience: 19, safetyIndex: 4.9, chaperoneGuaranteed: true, hospital: "Max Super Speciality, Shalimar Bagh", distanceKm: 0.8, initials: "RM", nextSlot: "Today, 10 min", video: true, womenRatings: 204 },
  { id: "d4", name: "Dr. Vikram Rao", specialty: "Pulmonology", conditions: ["asthma", "wheezing", "cough", "breathlessness", "chest tightness"], gender: "male", nmcId: "DL-2007-51088", fee: 650, experience: 22, safetyIndex: 4.8, chaperoneGuaranteed: true, hospital: "Sir Ganga Ram Hospital", distanceKm: 1.5, initials: "VR", nextSlot: "Today, 20 min", video: false, womenRatings: 158 },
  { id: "d5", name: "Dr. Arjun Khanna", specialty: "Orthopaedics", conditions: ["joint pain", "back pain", "fracture", "sprain", "knee pain"], gender: "male", nmcId: "DL-2012-44190", fee: 700, experience: 16, safetyIndex: 4.9, chaperoneGuaranteed: true, hospital: "BLK-Max Hospital", distanceKm: 3.1, initials: "AK", nextSlot: "Tomorrow, 10:30 AM", video: false, womenRatings: 97 },
  { id: "d6", name: "Dr. Karan Mehta", specialty: "Dermatology", conditions: ["skin rash", "acne", "eczema", "itching", "allergy"], gender: "male", nmcId: "DL-2019-70321", fee: 600, experience: 7, safetyIndex: 4.3, chaperoneGuaranteed: false, hospital: "Rohini Skin Clinic", distanceKm: 1.9, initials: "KM", nextSlot: "Today, 45 min", video: true, womenRatings: 61 },
  { id: "d7", name: "Dr. Neha Kapoor", specialty: "Paediatrics", conditions: ["child fever", "vaccination", "infant care", "child cough"], gender: "female", nmcId: "DL-2015-58830", fee: 650, experience: 12, safetyIndex: 4.7, chaperoneGuaranteed: true, hospital: "Rainbow Children's Hospital", distanceKm: 4.2, initials: "NK", nextSlot: "Today, 1 hr", video: false, womenRatings: 233 },
];

const SUPPORT_CONTACT: Doctor = {
  id: "support",
  name: "CuraPulse Support",
  specialty: "24/7 help desk",
  conditions: [],
  gender: "female",
  nmcId: "",
  fee: 0,
  experience: 0,
  safetyIndex: 5,
  chaperoneGuaranteed: true,
  hospital: "CuraPulse Support Desk",
  distanceKm: 0,
  initials: "CP",
  nextSlot: "",
  video: false,
  womenRatings: 0,
};

const HOSPITALS = [
  { name: "Max Super Speciality, Shalimar Bagh", km: 0.8, er: true },
  { name: "Apollo Indraprastha", km: 1.2, er: true },
  { name: "Sir Ganga Ram Hospital", km: 1.5, er: true },
];

// Free-text disease/symptom -> specialty keyword (simple natural-language search mapping)
const DISEASE_TO_SPECIALTY: { words: string[]; specialty: string }[] = [
  { words: ["chest", "heart", "palpitation", "bp", "pressure"], specialty: "cardiology" },
  { words: ["breath", "wheez", "asthma", "cough", "lung"], specialty: "pulmonology" },
  { words: ["skin", "rash", "acne", "itch", "eczema"], specialty: "dermatology" },
  { words: ["joint", "bone", "knee", "back", "fracture", "sprain"], specialty: "orthopaedics" },
  { words: ["period", "pregnan", "pcos", "pelvic", "hormon"], specialty: "gynaecology" },
  { words: ["child", "baby", "infant", "vaccin"], specialty: "paediatrics" },
  { words: ["fever", "headache", "migraine", "fatigue", "sugar", "diabet"], specialty: "internal medicine" },
];

const RX_ITEMS = [
  { name: "Paracetamol 650 mg", timing: "1 tablet if fever is above 100°F, max 3 a day", kind: "common" as const },
  { name: "Levocetirizine 5 mg", timing: "1 tablet at bedtime for 5 days", kind: "common" as const },
  { name: "Salbutamol Inhaler 100 mcg", timing: "2 puffs when wheezing, keep with you", kind: "critical" as const },
];

const PHARMACIES = [
  { id: "p1", name: "Apollo Pharmacy, Bawana Road", km: 0.4, night: true, govtVerified: true, phone: "+911127871234", out: [] as string[] },
  { id: "p2", name: "MedPlus, Rohini Sec-16", km: 0.9, night: false, govtVerified: true, phone: "+911127893344", out: ["Salbutamol Inhaler 100 mcg"] },
  { id: "p3", name: "Jan Aushadhi Kendra, DTU Gate", km: 0.3, night: false, govtVerified: true, phone: "+911127296655", out: ["Levocetirizine 5 mg"] },
  { id: "p4", name: "Wellness Forever 24x7, Pitampura", km: 2.6, night: true, govtVerified: false, phone: "+911147012299", out: [] as string[] },
];

/** Last few check-ups (not a live feed): each entry is one test with its date and where it was taken. */
const SEED_VITALS: Vital[] = [
  { id: "s1", label: "14 Sep", sys: 142, dia: 92, pulse: 86, glucose: 118, source: "Clinic", sugarType: "Fasting" },
  { id: "s2", label: "03 Oct", sys: 138, dia: 88, pulse: 82, glucose: 112, source: "Home", sugarType: "Fasting" },
  { id: "s3", label: "21 Oct", sys: 134, dia: 86, pulse: 80, glucose: 106, source: "Lab", sugarType: "Fasting" },
  { id: "s4", label: "02 Nov", sys: 130, dia: 84, pulse: 78, glucose: 101, source: "Home", sugarType: "Fasting" },
  { id: "s5", label: "12 Nov", sys: 126, dia: 82, pulse: 76, glucose: 98, source: "Clinic", sugarType: "Fasting" },
];
const shortDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const PAST_VISITS = [
  { date: "02 Sep 2026", doctor: "Dr. Rohit Mathur", reason: "Seasonal fever follow-up", outcome: "Recovered" },
  { date: "18 Jun 2026", doctor: "Dr. Vikram Rao", reason: "Asthma review", outcome: "Inhaler technique reviewed" },
  { date: "11 Mar 2026", doctor: "Dr. Sunita Sharma", reason: "Routine BP check", outcome: "Normal range" },
];

const SHARE_ITEMS = ["Allergies and conditions", "Vitals trend", "Past visit notes", "Prescriptions"];
const SHARE_DURATIONS = { "1h": 60 * 60 * 1000, "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 } as const;
type ShareDuration = keyof typeof SHARE_DURATIONS;

const TAB_OF: Record<Screen, TabKey> = {
  home: "home",
  symptom: "home",
  symptomResult: "home",
  sos: "home",
  sosCountdown: "home",
  sosStatus: "home",
  snapshot: "records",
  assistant: "chats",
  care: "care",
  book: "care",
  confirmed: "care",
  chats: "chats",
  chat: "chats",
  rx: "chats",
  vitals: "vitals",
  records: "records",
  share: "records",
};

// ============================================================================
// HELPERS
// ============================================================================
const clock = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const stamp = () =>
  new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const isValidContact = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || v.replace(/\D/g, "").length >= 10;
const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "CP";

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sanitizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const contacts = Array.isArray(r.emergencyContacts)
    ? (r.emergencyContacts as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c) => ({ name: String(c.name ?? ""), relation: String(c.relation ?? ""), phone: String(c.phone ?? "") }))
    : [];
  const bg = String(r.bloodGroup ?? "");
  const g = String(r.gender ?? "");
  return {
    name: String(r.name ?? ""),
    age: String(r.age ?? ""),
    gender: (GENDERS as readonly string[]).includes(g) ? (g as Gender) : "",
    contact: String(r.contact ?? ""),
    bloodGroup: (BLOOD_GROUPS as readonly string[]).includes(bg) ? (bg as BloodGroup) : "",
    allergies: arr(r.allergies),
    conditions: arr(r.conditions),
    emergencyContacts: contacts.length ? contacts : [{ name: "", relation: "", phone: "" }],
    researchOptIn: Boolean(r.researchOptIn),
  };
}

function nextDays(): { key: string; label: string; short: string }[] {
  const out: { key: string; label: string; short: string }[] = [];
  const base = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
    out.push({ key: d.toDateString(), label: i === 0 ? `Today · ${day}` : i === 1 ? `Tomorrow · ${day}` : day, short: i === 0 ? "Today" : i === 1 ? "Tomorrow" : day });
  }
  return out;
}

function toIcsDate(dayKey: string, slot: string, addMin = 0): string {
  const d = new Date(dayKey);
  const m = slot.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
    d.setHours(h, Number(m[2]) + addMin, 0, 0);
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const URGENCY_COPY: Record<Urgency, { title: string; sub: string; tone: "crit" | "warn" | "ok" }> = {
  CRITICAL: { title: "Get emergency help now", sub: "What you describe could be serious. Don't wait.", tone: "crit" },
  MEDIUM: { title: "See a doctor soon", sub: "Book a visit within the next 24 hours.", tone: "warn" },
  LOW: { title: "Self-care is likely fine", sub: "Rest and watch how you feel. Book a visit if it doesn't ease.", tone: "ok" },
};

// ============================================================================
// SMALL COMPONENTS
// ============================================================================
function QRMock({ seed, size = 96 }: { seed: string; size?: number }) {
  const n = 11;
  const h = hashString(seed);
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const inFinder = (rr: number, cc: number) => rr >= 0 && rr < 3 && cc >= 0 && cc < 3;
    if (inFinder(r, c) || inFinder(r, c - (n - 3)) || inFinder(r - (n - 3), c)) {
      const lr = r < 3 ? r : r - (n - 3);
      const lc = c < 3 ? c : c - (n - 3);
      cells.push(!(lr === 1 && lc === 1 && (r + c) % 2 === 1));
    } else {
      cells.push(((h >>> (i % 29)) ^ (i * 13)) % 3 !== 0);
    }
  }
  return (
    <div className="shrink-0 rounded-lg border border-line bg-white p-1.5" style={{ width: size, height: size }} role="img" aria-label="Arrival QR token">
      <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {cells.map((on, i) => (
          <div key={i} className={on ? "bg-ink" : "bg-white"} />
        ))}
      </div>
    </div>
  );
}

function ScreenHeader({ title, sub, onBack, right }: { title: React.ReactNode; sub?: React.ReactNode; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Back" className="-ml-1 mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-[14px] text-ink-muted">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function RowButton({ icon, title, sub, onClick, right }: { icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; onClick: () => void; right?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3.5 text-left shadow-card transition hover:border-brand/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage text-brand">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        {sub && <span className="block truncate text-[13px] text-ink-muted">{sub}</span>}
      </span>
      {right ?? <ChevronRight className="h-5 w-5 shrink-0 text-ink-soft" />}
    </button>
  );
}

// ============================================================================
// PAGE
// ============================================================================
export default function PatientPortal() {
  const view = useViewState("phone");
  const P = view.isPhone;

  // ---- boot / persistence ----
  const [mounted, setMounted] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [obStep, setObStep] = useState<1 | 2 | 3 | 4>(1);
  const [allergyDraft, setAllergyDraft] = useState("");
  const [conditionDraft, setConditionDraft] = useState("");
  const [noAllergies, setNoAllergies] = useState(false);

  // ---- onboarding ----
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // ---- nav ----
  const [screen, setScreen] = useState<Screen>("home");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const historyRef = useRef<Screen[]>([]);
  const [chatDoctor, setChatDoctor] = useState<Doctor | null>(null);
  const [bookDoc, setBookDoc] = useState<Doctor | null>(null);

  // ---- toast ----
  const [toast, setToast] = useState<{ msg: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- search ----
  const [query, setQuery] = useState("");
  const [femaleOnly, setFemaleOnly] = useState(false);
  const isWoman = profile.gender === "Female";
  const [todayOnly, setTodayOnly] = useState(false);
  const [videoOnly, setVideoOnly] = useState(false);
  const [simulateNoFemale, setSimulateNoFemale] = useState(false);

  // ---- symptom checker ----
  const [symptoms, setSymptoms] = useState("");
  const [checking, setChecking] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);

  // ---- SOS ----
  const [sosCounting, setSosCounting] = useState(false);
  const [sosSeconds, setSosSeconds] = useState(5);
  const [sosSending, setSosSending] = useState(false);
  const [sosReceipt, setSosReceipt] = useState<SosReceipt | null>(null);
  const [smsLog, setSmsLog] = useState<SmsState[]>([]);
  const [deskAck, setDeskAck] = useState<string | null>(null);
  const [alarmOn, setAlarmOn] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const sosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alarmTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const dispatchLock = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ---- chat threads ----
  const [threads, setThreads] = useState<Record<string, ChatMsg[]>>({});
  const [dismissedSuggest, setDismissedSuggest] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "doctors" | "support">("all");
  const [readUpTo, setReadUpTo] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  // ---- AI assistant (kept only in memory on this device) ----
  const [aiMsgs, setAiMsgs] = useState<{ id: string; role: "user" | "assistant"; text: string; suggestions?: { label: string; action: string; specialty?: string }[]; emergency?: boolean }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiEndRef = useRef<HTMLDivElement | null>(null);
  const [patientId, setPatientId] = useState("");
  const [liveChat, setLiveChat] = useState<"connecting" | "live" | "offline">("connecting");
  const fallbackTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [flashCard, setFlashCard] = useState<CardType | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatIdRef = useRef<string | null>(null);

  // ---- booking & card state ----
  const days = useMemo(() => nextDays(), []);
  const [apptDayIdx, setApptDayIdx] = useState(0);
  const [apptSlot, setApptSlot] = useState("10:30 AM");
  const [apptMode, setApptMode] = useState<"inperson" | "video">("inperson");
  const [apptChaperone, setApptChaperone] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [etaShared, setEtaShared] = useState<string | null>(null);
  const [reserve, setReserve] = useState<{ id: string; status: "pending" | "confirmed" } | null>(null);
  const [chaperoneOn, setChaperoneOn] = useState(false);
  const [chaperonePass, setChaperonePass] = useState<string | null>(null);

  // ---- vitals ----
  const [vitals, setVitals] = useState<Vital[]>(SEED_VITALS);
  const [vMetric, setVMetric] = useState<"bp" | "pulse" | "sugar">("bp");
  const [logOpen, setLogOpen] = useState(false);
  const [vSys, setVSys] = useState("124");
  const [vDia, setVDia] = useState("80");
  const [vPulse, setVPulse] = useState("76");
  const [vGlu, setVGlu] = useState("96");
  const [vDate, setVDate] = useState("");
  const [vSource, setVSource] = useState<"Home" | "Clinic" | "Lab">("Home");
  const [vSugarType, setVSugarType] = useState<"Fasting" | "After meal" | "Random">("Fasting");
  const [vitalsError, setVitalsError] = useState<string | null>(null);

  // ---- records ----
  const [recordConsent, setRecordConsent] = useState<"pending" | "granted" | "denied" | "revoked">("pending");
  const [recordExpiry, setRecordExpiry] = useState<number | null>(null);
  const [sharedWith, setSharedWith] = useState<string>("");
  const [shareItems, setShareItems] = useState<string[]>(SHARE_ITEMS.slice(0, 2));
  const [shareDocId, setShareDocId] = useState("d1");
  const [shareDur, setShareDur] = useState<ShareDuration>("24h");
  const [nowTick, setNowTick] = useState(0);

  // ==========================================================================
  // INFRA
  // ==========================================================================
  const showToast = useCallback((msg: string, tone: ToastTone = "info", ms = 3800) => {
    setToast({ msg, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };

  const scrollTop = () => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      document.getElementById("cp-scroll")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    });
  };

  const go = (s: Screen) => {
    historyRef.current.push(screen);
    setScreen(s);
    scrollTop();
  };
  const back = () => {
    const prev = historyRef.current.pop();
    setScreen(prev ?? "home");
    scrollTop();
  };
  const goTab = (k: string) => {
    historyRef.current = [];
    setScreen(k as Screen);
    scrollTop();
  };

  // Load offline passport once on the client (avoids hydration mismatch).
  useEffect(() => {
    // Patients must sign in first (name, age, sex, email/phone code) on /login.
    const session = readSession();
    if (!session || session.role !== "patient") {
      window.location.replace("/login");
      return;
    }
    let restored = false;
    try {
      const raw = window.localStorage.getItem(PASSPORT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Passport>;
        const p = sanitizeProfile(parsed.profile);
        if (p) {
          setProfile(p);
          if (parsed.onboarded && (!p.name || p.name === sessionName(session))) {
            setOnboarded(true);
            setOtpVerified(true);
            restored = true;
          }
          if (typeof parsed.savedAt === "string") setSavedAt(parsed.savedAt);
        }
      }
    } catch {
      // Storage unavailable (private mode). App keeps working in memory.
    }
    if (!restored) {
      // New sign-in: start profile setup with the details given at sign-up.
      const g = (GENDERS as readonly string[]).includes(session.sex) ? (session.sex as Gender) : "";
      setProfile({ ...EMPTY_PROFILE, name: sessionName(session), age: session.age, gender: g, contact: session.contact });
      setOtpVerified(true);
      setObStep(2);
    }
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const t = clock();
    setThreads({
      d1: [
        { id: "m-seed-1", sender: "doctor", time: t, text: "Hello, I've reviewed last week's BP readings. They're trending down nicely. Keep logging them each morning." },
      ],
      d4: [
        { id: "m-seed-2", sender: "doctor", time: t, text: "How is the inhaler technique going since our review?" },
        { id: "m-seed-3", sender: "patient", time: t, text: "Much better, thank you doctor." },
      ],
    });
    setMounted(true);
    const list = timers.current;
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      list.forEach(clearTimeout);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (sosTimer.current) clearTimeout(sosTimer.current);
      if (alarmTimer.current) clearInterval(alarmTimer.current);
      if (holdTimer.current) clearInterval(holdTimer.current);
    };
  }, []);

  // Persist the passport whenever it changes after onboarding.
  useEffect(() => {
    if (!mounted || !onboarded) return;
    try {
      const at = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      const passport: Passport = { profile, onboarded: true, savedAt: at };
      window.localStorage.setItem(PASSPORT_KEY, JSON.stringify(passport));
      setSavedAt(at);
    } catch {
      // Ignore quota / privacy errors.
    }
  }, [profile, onboarded, mounted]);

  // 1-second tick for consent countdown
  useEffect(() => {
    if (recordConsent !== "granted") return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    setNowTick(Date.now());
    return () => clearInterval(t);
  }, [recordConsent]);

  useEffect(() => {
    if (recordConsent === "granted" && recordExpiry && nowTick > recordExpiry) {
      setRecordConsent("revoked");
      setRecordExpiry(null);
    }
  }, [nowTick, recordConsent, recordExpiry]);

  // ==========================================================================
  // AUDIO
  // ==========================================================================
  const getAudio = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    try {
      if (!audioRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        audioRef.current = new Ctor();
      }
      if (audioRef.current.state === "suspended") {
        audioRef.current.resume().catch(() => {});
      }
      return audioRef.current;
    } catch {
      return null;
    }
  };

  const beep = (freq = 880, ms = 240) => {
    const ctx = getAudio();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000);
    } catch {
      // Audio blocked; visual countdown still runs.
    }
  };

  const toggleAlarm = () => {
    if (alarmOn) {
      if (alarmTimer.current) clearInterval(alarmTimer.current);
      alarmTimer.current = null;
      setAlarmOn(false);
      return;
    }
    getAudio();
    let hi = false;
    alarmTimer.current = setInterval(() => {
      hi = !hi;
      beep(hi ? 1320 : 880, 380);
    }, 420);
    setAlarmOn(true);
  };

  // ==========================================================================
  // SOS
  // ==========================================================================
  const startSOS = () => {
    if (sosCounting || sosSending) return;
    getAudio(); // unlock audio inside the user gesture
    dispatchLock.current = false;
    setSosSeconds(5);
    setSosCounting(true);
    historyRef.current.push("sos");
    setScreen("sosCountdown");
    scrollTop();
  };

  const beginHold = () => {
    if (holdTimer.current || sosCounting || sosSending) return;
    getAudio();
    const started = Date.now();
    setHoldPct(0);
    holdTimer.current = setInterval(() => {
      const pct = Math.min(((Date.now() - started) / 1500) * 100, 100);
      setHoldPct(pct);
      if (pct >= 100) {
        if (holdTimer.current) clearInterval(holdTimer.current);
        holdTimer.current = null;
        setHoldPct(0);
        startSOS();
      }
    }, 40);
  };
  const endHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHoldPct(0);
  };

  const cancelSOS = () => {
    if (sosTimer.current) clearTimeout(sosTimer.current);
    setSosCounting(false);
    setSosSeconds(5);
    setScreen("sos");
    showToast("SOS cancelled. No alert was sent.", "info");
  };

  useEffect(() => {
    if (!sosCounting) return;
    if (sosSeconds > 0) {
      beep(880, 240);
      sosTimer.current = setTimeout(() => setSosSeconds((s) => s - 1), 1000);
    } else if (!dispatchLock.current) {
      dispatchLock.current = true;
      beep(1320, 500);
      void dispatchSOS();
    }
    return () => {
      if (sosTimer.current) clearTimeout(sosTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sosCounting, sosSeconds]);

  const getPosition = async (): Promise<{ lat: number; lng: number; fallback: boolean }> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return { lat: DTU_LAT, lng: DTU_LNG, fallback: true };
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        const guard = setTimeout(() => reject(new Error("timeout")), 3000);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            clearTimeout(guard);
            resolve(p);
          },
          (e) => {
            clearTimeout(guard);
            reject(e);
          },
          { enableHighAccuracy: true, timeout: 2800, maximumAge: 0 }
        );
      });
      return { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)), fallback: false };
    } catch {
      return { lat: DTU_LAT, lng: DTU_LNG, fallback: true };
    }
  };

  const sendFamilySms = (lat: number, lng: number) => {
    const contacts = profile.emergencyContacts.filter((c) => c.name.trim() && c.phone.trim());
    const list: SmsState[] = contacts.length
      ? contacts.map((c) => ({ name: `${c.name}${c.relation ? ` (${c.relation})` : ""}`, phone: c.phone, status: "queued" }))
      : [{ name: "No emergency contact saved", phone: "Add one in your snapshot", status: "queued" }];
    setSmsLog(list);
    console.log(
      `[CuraPulse SMS Gateway] "${profile.name || "A CuraPulse user"} triggered SOS. Live location: https://maps.google.com/?q=${lat},${lng}"`,
      list
    );
    list.forEach((_, i) => {
      later(() => setSmsLog((prev) => prev.map((s, j) => (j === i ? { ...s, status: "sent" } : s))), 700 + i * 500);
      later(() => setSmsLog((prev) => prev.map((s, j) => (j === i ? { ...s, status: "delivered" } : s))), 1800 + i * 600);
    });
  };

  const dispatchSOS = async () => {
    setSosCounting(false);
    setSosSending(true);
    const { lat, lng, fallback } = await getPosition();
    const base = {
      patient_name: profile.name || "Unregistered Patient",
      phone: profile.contact || "Not provided",
      blood_group: profile.bloodGroup || "Unknown",
      latitude: lat,
      longitude: lng,
      status: "ACTIVE",
    };

    let synced = false;
    let syncNote = "Saved on this phone. The Support Desk gets it when the network returns.";
    let ref = `SOS-${Math.floor(100000 + Math.random() * 900000)}`;
    let insertedId: string | null = null;

    try {
      const first = await supabase
        .from("sos_incidents")
        .insert([{ ...base, allergies: profile.allergies, chronic_conditions: profile.conditions }])
        .select("id")
        .single();
      if (!first.error) {
        synced = true;
        insertedId = first.data?.id != null ? String(first.data.id) : null;
      } else {
        // Retry: columns may be text instead of text[], or select may be blocked by RLS.
        const second = await supabase
          .from("sos_incidents")
          .insert([{ ...base, allergies: profile.allergies.join(", "), chronic_conditions: profile.conditions.join(", ") }]);
        if (!second.error) {
          synced = true;
        } else {
          const third = await supabase.from("sos_incidents").insert([{ ...base, allergies: profile.allergies, chronic_conditions: profile.conditions }]);
          if (!third.error) synced = true;
          else syncNote = /fetch|network|timeout/i.test(third.error.message) ? "No connection to the Support Desk. The alert is saved on this phone." : `The desk refused the alert (${third.error.message}). It is saved on this phone.`;
        }
      }
    } catch (err) {
      syncNote = `No network. Alert saved on this phone. ${err instanceof Error ? err.message : ""}`.trim();
    }

    if (synced) {
      syncNote = "Received by the 24/7 Support Desk.";
      if (insertedId) ref = `SOS-${insertedId}`;
    }

    setSosReceipt({ ref, lat, lng, usedFallback: fallback, synced, syncNote, time: stamp() });
    setSosSending(false);
    setDeskAck(null);
    setScreen("sosStatus");
    scrollTop();
    sendFamilySms(lat, lng);
    showToast(synced ? "Emergency alert sent to the Support Desk" : "Alert not sent yet. Call 108 now if you can.", synced ? "ok" : "warn", 5000);

    if (insertedId) {
      const channel = supabase
        .channel(`patient-sos-${insertedId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sos_incidents", filter: `id=eq.${insertedId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const st = String(row.status ?? "");
            if (st === "RESOLVED") setDeskAck("Support Desk marked your incident resolved.");
            else if (row.ambulance_dispatched) setDeskAck(`Ambulance ${String(row.ambulance_unit ?? "")} is on the way. Stay where you are and keep your phone on.`);
            else if (row.pre_intake_state === "CONFIRMED") setDeskAck("The hospital has received your health snapshot and is getting ready.");
            else if (row.first_action_at) setDeskAck("A Support Desk agent has opened your alert.");
          }
        )
        .subscribe();
      later(() => void supabase.removeChannel(channel), 30 * 60 * 1000);
    }
    if (synced) later(() => setDeskAck((d) => d ?? "An agent is reviewing your Emergency Health Snapshot."), 4000);
  };

  const retrySOS = () => {
    if (sosSending) return;
    dispatchLock.current = true;
    void dispatchSOS();
  };

  // ==========================================================================
  // ONBOARDING
  // ==========================================================================
  const sendOtp = () => {
    if (!isValidContact(profile.contact)) {
      setOtpError("Enter a valid 10-digit mobile number.");
      return;
    }
    setOtpError(null);
    setOtpSent(true);
    setOtp("");
    setOtpVerified(false);
    showToast(`Demo code sent to ${profile.contact}: ${DEMO_OTP}`, "info", 6000);
  };

  const onOtpChange = (raw: string) => {
    const v = raw.replace(/\D/g, "").slice(0, 6);
    setOtp(v);
    if (v.length < 6) {
      setOtpVerified(false);
      setOtpError(null);
      return;
    }
    if (v === DEMO_OTP) {
      setOtpVerified(true);
      setOtpError(null);
      showToast("Number verified", "ok", 2000);
    } else {
      setOtpVerified(false);
      setOtpError("That code doesn't match. Tap the demo code below to fill it.");
    }
  };

  const autofillOtp = () => {
    setOtpSent(true);
    setOtp(DEMO_OTP);
    setOtpVerified(true);
    setOtpError(null);
    showToast("Code filled and verified", "ok", 2000);
  };

  const nextStep = () => {
    const errs: string[] = [];
    if (obStep === 1) {
      if (!otpVerified) errs.push("Verify your mobile number with the one-time code.");
    } else if (obStep === 2) {
      if (profile.name.trim().length < 2) errs.push("Enter your full name.");
      const ageN = Number(profile.age);
      if (!profile.age || !Number.isFinite(ageN) || ageN < 1 || ageN > 120) errs.push("Enter a valid age.");
      if (!profile.gender) errs.push("Select your gender.");
      if (!profile.bloodGroup) errs.push("Select your blood group.");
      if (!profile.allergies.length && !noAllergies) errs.push("Add your allergies, or tick “No known allergies”.");
    } else if (obStep === 3) {
      const bad = profile.emergencyContacts.some((c) => (c.name.trim() || c.phone.trim()) && c.phone.replace(/\D/g, "").length < 10);
      if (bad) errs.push("Each emergency contact needs a 10-digit phone number.");
    }
    setFormErrors(errs);
    if (!errs.length && obStep < 4) setObStep((s) => (s + 1) as 1 | 2 | 3 | 4);
    scrollTop();
  };

  const finishOnboarding = () => {
    setProfile((p) => ({
      ...p,
      name: p.name.trim(),
      contact: p.contact.trim(),
      emergencyContacts: p.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()).length
        ? p.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim())
        : [{ name: "", relation: "", phone: "" }],
    }));
    setOnboarded(true);
    historyRef.current = [];
    setScreen("home");
    scrollTop();
    showToast("Emergency Health Snapshot saved to this device", "ok");
  };

  const loadDemo = () => {
    setProfile(DEMO_PROFILE);
    setNoAllergies(false);
    setFormErrors([]);
    autofillOtp();
    showToast("Sample patient loaded and verified.", "info", 3000);
  };

  const editSnapshot = () => {
    setOnboarded(false);
    setObStep(2);
    setFormErrors([]);
    scrollTop();
  };

  const resetPassport = () => {
    try {
      window.localStorage.removeItem(PASSPORT_KEY);
    } catch {
      // ignore
    }
    setProfile(EMPTY_PROFILE);
    setOnboarded(false);
    setOtpSent(false);
    setOtp("");
    setSavedAt(null);
    setChatDoctor(null);
    signOut();
    window.location.replace("/login");
  };

  const addAllergy = () => {
    const v = allergyDraft.trim();
    if (!v) return;
    setProfile((p) => ({ ...p, allergies: p.allergies.includes(v) ? p.allergies : [...p.allergies, v] }));
    setNoAllergies(false);
    setAllergyDraft("");
  };
  const addCondition = () => {
    const v = conditionDraft.trim();
    if (!v) return;
    setProfile((p) => ({ ...p, conditions: p.conditions.includes(v) ? p.conditions : [...p.conditions, v] }));
    setConditionDraft("");
  };

  // ==========================================================================
  // SYMPTOM CHECKER
  // ==========================================================================
  const runChecker = async (text?: string) => {
    const s = (text ?? symptoms).trim();
    if (!s) {
      showToast("Describe how you feel first.", "warn");
      return;
    }
    if (text) setSymptoms(text);
    setChecking(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/symptom-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: s,
          age: Number(profile.age) || undefined,
          allergies: profile.allergies,
          chronic_conditions: profile.conditions,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AiResult;
      if (!data || !data.urgency_level) throw new Error("bad response");
      setAiResult(data);
      if (data.urgency_level === "CRITICAL") beep(1320, 300);
    } catch {
      // Device is offline: the same safety rules run locally.
      const critical = /chest|breath|unconscious|stroke|seizure|bleeding|faint|numb/i.test(s);
      setAiResult({
        urgency_level: critical ? "CRITICAL" : "MEDIUM",
        first_aid_steps: critical
          ? [
              "Start SOS now or call 108.",
              "Sit or lie in the position that makes breathing easiest and loosen tight clothing.",
              "Do not eat, drink or drive yourself to hospital.",
            ]
          : ["Rest, sip water and avoid heavy activity.", "Book a doctor within 24 hours.", "Start SOS if things get suddenly worse."],
        specialist_recommendation: critical ? "Emergency Medicine" : "General Physician",
        contraindication_warnings: profile.allergies.length
          ? [`Tell every doctor about your allergies: ${profile.allergies.join(", ")}.`]
          : ["Do not start any new medicine without a doctor's advice."],
        source: "device-offline",
      });
    } finally {
      setChecking(false);
    }
    historyRef.current.push("symptom");
    setScreen("symptomResult");
    scrollTop();
  };

  const findSpecialistFromAi = () => {
    if (!aiResult) return;
    const spec = aiResult.specialist_recommendation.toLowerCase();
    const mapped = ["cardio", "pulmo", "derma", "ortho", "gynae", "gyne", "paedi", "pedia"].find((k) => spec.includes(k)) ?? "medicine";
    setQuery(mapped);
    go("care");
  };

  // ==========================================================================
  // SEARCH
  // ==========================================================================
  const searchResult = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mapped = q ? DISEASE_TO_SPECIALTY.find((m) => m.words.some((w) => q.includes(w)))?.specialty : undefined;
    const matches = DOCTORS.filter((d) => {
      if (todayOnly && !d.nextSlot.startsWith("Today")) return false;
      if (videoOnly && !d.video) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        d.hospital.toLowerCase().includes(q) ||
        d.conditions.some((c) => c.includes(q) || q.includes(c)) ||
        (mapped ? d.specialty.toLowerCase().includes(mapped) : false)
      );
    }).sort((a, b) => a.distanceKm - b.distanceKm);

    if (!femaleOnly) return { list: matches, fallback: false, tier1: [] as Doctor[], tier2: [] as Doctor[], mapped };

    const female = simulateNoFemale ? [] : matches.filter((d) => d.gender === "female");
    if (female.length) {
      return {
        list: [...female].sort((a, b) => b.safetyIndex - a.safetyIndex || a.distanceKm - b.distanceKm),
        fallback: false,
        tier1: [] as Doctor[],
        tier2: [] as Doctor[],
        mapped,
      };
    }
    const pool = (matches.length ? matches : DOCTORS).filter((d) => !(simulateNoFemale && d.gender === "female"));
    const tier1 = pool
      .filter((d) => d.safetyIndex >= 4.8 && d.chaperoneGuaranteed)
      .sort((a, b) => b.safetyIndex - a.safetyIndex || b.experience - a.experience);
    const tier2 = pool.filter((d) => !tier1.includes(d)).sort((a, b) => b.experience - a.experience);
    return { list: [] as Doctor[], fallback: true, tier1, tier2, mapped };
  }, [query, femaleOnly, simulateNoFemale, todayOnly, videoOnly]);

  // ==========================================================================
  // CHAT
  // ==========================================================================
  const messages = chatDoctor ? threads[chatDoctor.id] ?? [] : [];
  const setMessages = (fn: (prev: ChatMsg[]) => ChatMsg[], docId?: string) => {
    const id = docId ?? chatIdRef.current;
    if (!id) return;
    setThreads((t) => ({ ...t, [id]: fn(t[id] ?? []) }));
  };

  const scrollEnd = () => later(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 80);

  const openChat = (doc: Doctor) => {
    chatIdRef.current = doc.id;
    if (!threads[doc.id]?.length) {
      const t = clock();
      const hello =
        doc.id === "support"
          ? `Hi ${profile.name.split(" ")[0] || "there"}, this is the CuraPulse Support Desk. We can help with bookings, pharmacies or anything in the app.`
          : `Namaste ${profile.name.split(" ")[0] || "there"}, I'm ${doc.name}. I can see your Emergency Health Snapshot (Blood ${profile.bloodGroup || "not set"}${
              profile.allergies.length ? `, allergic to ${profile.allergies.join(", ")}` : ""
            }). How can I help today?`;
      setThreads((prev) => ({
        ...prev,
        [doc.id]: [
          { id: `m-hello-${doc.id}`, sender: "doctor", time: t, text: hello },
          ...(doc.id === "support" ? [] : [{ id: `card-appointment`, sender: "doctor" as const, time: t, card: "appointment" as CardType }]),
        ],
      }));
    }
    setChatDoctor(doc);
    if (screen !== "chat") go("chat");
    scrollEnd();
  };

  const pushCard = (card: CardType, sender: ChatMsg["sender"] = "doctor") => {
    const id = `card-${card}`;
    setMessages((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, { id, sender, time: clock(), card }]));
    setFlashCard(card);
    later(() => setFlashCard(null), 1600);
    later(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 140);
  };

  const sysMsg = (text: string, docId?: string) =>
    setMessages((prev) => [...prev, { id: `sys-${uid()}`, sender: "system", time: clock(), text }], docId);

  const craftReply = (text: string, doc: Doctor): { text: string; card?: CardType } => {
    const t = text.toLowerCase();
    if (/chest|breath|faint|severe|unconscious|bleed/.test(t))
      return {
        text: "That needs to be checked in person straight away. If it is severe or getting worse, start SOS now. I've opened your arrival slip so the hospital is ready for you.",
        card: "arrival",
      };
    if (doc.id === "support") return { text: "Thanks, a support agent will reply here shortly. For anything urgent, use SOS or call 108." };
    if (/prescri|medicine|tablet|pharmac|chemist/.test(t))
      return { text: "I've issued your e-prescription below. Tap Find nearby pharmacies to see who has it in stock.", card: "prescription" };
    if (/bp|pressure|sugar|glucose|vital|pulse/.test(t))
      return { text: "Please log today's readings in the vitals card. I'll review the trend before your visit.", card: "vitals" };
    if (/female|woman|lady|chaperone|nurse|attendant|uncomfortable/.test(t))
      return { text: "Of course. You can request a female chaperone nurse for your physical examination with the card below.", card: "chaperone" };
    if (/record|history|report|previous|past/.test(t))
      return { text: "To review your past records I need your permission. I've sent a 24-hour access request below.", card: "records" };
    if (/book|slot|appointment|visit|when/.test(t))
      return { text: "Pick a date and time in the booking card and tap Confirm. Your token appears right away.", card: "appointment" };
    if (/fever|cold|cough|flu|throat/.test(t))
      return { text: "Noted. Rest, warm fluids and steam usually help. Please log your vitals, and we'll talk about it at your visit.", card: "vitals" };
    if (/thank|ok|okay|great/.test(t)) return { text: "You're welcome. I'm here whenever you need me. Take care!" };
    return { text: `Thanks, noted. I'll keep this in your file at ${doc.hospital}. Use the quick actions to book, share your arrival, or log vitals.` };
  };

  // ---- live chat (Supabase chat_messages) ----
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem("curapulse_patient_id") || "";
      if (!id) {
        id = `pt-${uid()}`;
        localStorage.setItem("curapulse_patient_id", id);
      }
    } catch {
      id = `pt-${uid()}`;
    }
    setPatientId(id);
  }, []);

  const rowToMsg = (row: Record<string, unknown>): ChatMsg => ({
    id: `db-${String(row.id)}`,
    sender: (row.sender as ChatMsg["sender"]) || "doctor",
    text: (row.body as string) || undefined,
    card: (row.card as CardType) || undefined,
    time: row.created_at ? new Date(String(row.created_at)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : clock(),
  });

  const addLiveRow = (row: Record<string, unknown>) => {
    const docId = String(row.doctor_id || "");
    if (!docId) return;
    const msg = rowToMsg(row);
    setThreads((t) => {
      const cur = t[docId] ?? [];
      if (cur.some((m) => m.id === msg.id)) return t;
      return { ...t, [docId]: [...cur, msg] };
    });
    if (msg.sender !== "patient") {
      if (fallbackTimers.current[docId]) {
        clearTimeout(fallbackTimers.current[docId]);
        delete fallbackTimers.current[docId];
      }
      setTyping(false);
    }
  };

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      try {
        const { data, error } = await supabase.from("chat_messages").select("*").eq("patient_id", patientId).order("created_at", { ascending: true }).limit(500);
        if (cancelled) return;
        if (error) throw error;
        (data ?? []).forEach((r) => addLiveRow(r as Record<string, unknown>));
        setLiveChat("live");
        channel = supabase
          .channel(`curapulse-chat-${patientId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `patient_id=eq.${patientId}` }, (payload: { new: Record<string, unknown> }) => addLiveRow(payload.new))
          .subscribe();
      } catch {
        if (!cancelled) setLiveChat("offline");
      }
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
      Object.values(fallbackTimers.current).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Live updates for the current booking: doctor calls you in, or issues an e-prescription on their device.
  useEffect(() => {
    if (!booking) return;
    const token = booking.token;
    const docId = booking.docId;
    const doc = DOCTORS.find((d) => d.id === docId);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`curapulse-booking-${token}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments", filter: `arrival_token=eq.${token}` }, (payload: { new: Record<string, unknown> }) => {
          const st = String(payload.new?.status ?? "");
          if (st === "In Consultation") {
            showToast(`${doc?.name ?? "Your doctor"} is ready for you now (token ${token}).`, "ok", 6000);
            sysMsg(`${doc?.name ?? "Your doctor"} has called token ${token} in.`, docId);
          }
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "prescriptions", filter: `arrival_token=eq.${token}` }, (payload: { new: Record<string, unknown> }) => {
          const r = payload.new ?? {};
          const meds = Array.isArray(r.medicines) ? (r.medicines as Record<string, unknown>[]).map((m) => `${m.name ?? "Medicine"} ${m.dosage ?? ""}`.trim()).join(", ") : "";
          setThreads((t) => ({
            ...t,
            [docId]: [
              ...(t[docId] ?? []),
              { id: `rx-${String(r.rx_hash ?? uid())}`, sender: "doctor", time: clock(), text: `E-prescription ${String(r.rx_hash ?? "")} issued${r.diagnosis ? ` for ${String(r.diagnosis)}` : ""}.${meds ? ` Medicines: ${meds}.` : ""} Show it at any pharmacy.` },
            ],
          }));
          showToast(`New e-prescription from ${doc?.name ?? "your doctor"}. It's in your chat.`, "ok", 6000);
        })
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.token]);

  const askAssistant = async (e?: React.FormEvent, preset?: string) => {
    e?.preventDefault();
    const text = (preset ?? aiInput).trim();
    if (!text || aiBusy) return;
    const next = [...aiMsgs, { id: `u-${uid()}`, role: "user" as const, text }];
    setAiMsgs(next);
    setAiInput("");
    setAiBusy(true);
    later(() => aiEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Data minimisation: no name, phone or contact details leave the device.
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, text: m.text })),
          profile: { age: profile.age, sex: profile.gender, allergies: profile.allergies, conditions: profile.conditions },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Assistant unavailable");
      setAiMsgs((m) => [...m, { id: `a-${uid()}`, role: "assistant", text: json.reply, suggestions: json.suggestions, emergency: json.emergency }]);
    } catch (err) {
      setAiMsgs((m) => [...m, { id: `a-${uid()}`, role: "assistant", text: err instanceof Error && /too many/i.test(err.message) ? err.message : "I can't connect right now. Check your internet and try again.", suggestions: [] }]);
    }
    setAiBusy(false);
    later(() => aiEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 60);
  };

  const runAiAction = (a: { action: string; specialty?: string }) => {
    if (a.action === "sos") go("sos");
    else if (a.action === "book") {
      setQuery(a.specialty ?? "");
      goTab("care");
    } else if (a.action === "pharmacies") go("rx");
    else if (a.action === "vitals") goTab("vitals");
    else if (a.action === "records") goTab("records");
    else if (a.action === "symptom") go("symptom");
  };

  const scriptedReply = (text: string, doc: Doctor) => {
    setTyping(false);
    const reply = craftReply(text, doc);
    setMessages((prev) => [...prev, { id: `d-${uid()}`, sender: "doctor", text: reply.text, time: clock() }], doc.id);
    if (reply.card) {
      chatIdRef.current = doc.id;
      pushCard(reply.card, reply.card === "arrival" || reply.card === "chaperone" ? "system" : "doctor");
    }
    scrollEnd();
  };

  const sendChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || !chatDoctor) return;
    const doc = chatDoctor;
    const rowId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null;
    setMessages((prev) => [...prev, { id: rowId ? `db-${rowId}` : `p-${uid()}`, sender: "patient", text, time: clock() }]);
    setChatInput("");
    scrollEnd();
    if (liveChat !== "live" || !patientId || !rowId) {
      setTyping(true);
      later(() => scriptedReply(text, doc), 1100);
      return;
    }
    void (async () => {
      let ok = false;
      try {
        const { error } = await supabase.from("chat_messages").insert({
          id: rowId,
          thread_id: `${patientId}:${doc.id}`,
          patient_id: patientId,
          patient_name: profile.name || "Patient",
          doctor_id: doc.id,
          doctor_name: doc.name,
          sender: "patient",
          body: text,
        });
        ok = !error;
      } catch {
        ok = false;
      }
      if (!ok) {
        setLiveChat("offline");
        setTyping(true);
        later(() => scriptedReply(text, doc), 1100);
        return;
      }
      // Sent live. If nobody answers from the doctor portal soon, say so honestly.
      if (fallbackTimers.current[doc.id]) clearTimeout(fallbackTimers.current[doc.id]);
      fallbackTimers.current[doc.id] = setTimeout(() => {
        delete fallbackTimers.current[doc.id];
        sysMsg(`${doc.id === "support" ? "The support desk" : doc.name} hasn't opened this yet. Your message is saved and their reply will appear here. For anything urgent, use SOS or call 108.`, doc.id);
      }, 45000);
    })();
  };

  useEffect(() => {
    if (screen === "chat" && chatDoctor) setReadUpTo((r) => (r[chatDoctor.id] === messages.length ? r : { ...r, [chatDoctor.id]: messages.length }));
    if (screen !== "chat") setActionsOpen(false);
  }, [screen, chatDoctor, messages.length]);

  useEffect(() => {
    if (screen === "chat" && chatDoctor) chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing, chatDoctor, screen]);

  // ---- booking ----
  const startBooking = (doc: Doctor) => {
    setBookDoc(doc);
    setApptDayIdx(doc.nextSlot.startsWith("Tomorrow") ? 1 : 0);
    setApptMode("inperson");
    setApptChaperone(doc.gender === "male" && profile.gender === "Female");
    go("book");
  };

  const confirmBooking = (doc: Doctor, fromChat = false) => {
    const token = `CP-${100 + Math.floor(Math.random() * 900)}`;
    const day = days[apptDayIdx];
    const b: Booking = { docId: doc.id, date: day.label, dayKey: day.key, slot: apptSlot, token, mode: apptMode, chaperone: apptChaperone };
    setBooking(b);
    setEtaShared(null);
    chatIdRef.current = doc.id;
    if (!threads[doc.id]?.length) {
      setThreads((prev) => ({
        ...prev,
        [doc.id]: [{ id: `m-hello-${doc.id}`, sender: "doctor", time: clock(), text: `Hello ${profile.name.split(" ")[0] || "there"}, I'm ${doc.name}. See you at your visit.` }],
      }));
    }
    sysMsg(`Appointment confirmed with ${doc.name}: ${day.label}, ${apptSlot}. Token ${token}.`, doc.id);
    if (apptChaperone) {
      const pass = `CHP-${1000 + Math.floor(Math.random() * 9000)}-F`;
      setChaperoneOn(true);
      setChaperonePass(pass);
      sysMsg(`Female chaperone nurse requested. Pass ${pass} will be checked at the exam room door.`, doc.id);
    }
    showToast(`Booked · Token ${token}`, "ok");
    // Send the booking to the doctor's queue on any device.
    void (async () => {
      try {
        await supabase.from("appointments").insert({
          arrival_token: token,
          patient_id: patientId || null,
          patient_name: profile.name || "Patient",
          age: Number(profile.age) || null,
          gender: profile.gender || null,
          blood_group: profile.bloodGroup || null,
          allergies: profile.allergies,
          chronic_illnesses: profile.conditions,
          chief_complaint: symptoms.trim() || `Booked from the CuraPulse app (${apptMode === "video" ? "video visit" : "in person"})`,
          slot: `${day.label}, ${apptSlot}`,
          doctor_id: doc.id,
          doctor_name: doc.name,
          chaperone_requested: apptChaperone,
          status: "Waiting",
        });
      } catch {
        // Offline: booking stays on this device.
      }
    })();
    if (fromChat) later(() => pushCard("arrival", "system"), 600);
    else go("confirmed");
  };

  const downloadIcs = () => {
    if (!booking) return;
    const doc = DOCTORS.find((d) => d.id === booking.docId);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CuraPulse//Patient//EN",
      "BEGIN:VEVENT",
      `UID:${booking.token}@curapulse`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART:${toIcsDate(booking.dayKey, booking.slot)}`,
      `DTEND:${toIcsDate(booking.dayKey, booking.slot, 30)}`,
      `SUMMARY:${booking.mode === "video" ? "Video visit" : "Visit"} with ${doc?.name ?? "doctor"}`,
      `LOCATION:${booking.mode === "video" ? "CuraPulse video" : doc?.hospital ?? ""}`,
      `DESCRIPTION:Token ${booking.token}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    try {
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `curapulse-${booking.token}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Calendar file downloaded", "ok");
    } catch {
      showToast("Couldn't create the calendar file on this device.", "warn");
    }
  };

  const shareEta = (doc: Doctor | null) => {
    if (!doc) return;
    const mins = Math.round(doc.distanceKm * 6) + 4;
    const label = `~${mins} min, shared at ${clock()}`;
    setEtaShared(label);
    sysMsg(`Arrival ETA (${label}) sent to the ${doc.hospital} front desk.`, doc.id);
    showToast("Arrival time shared with the front desk", "ok");
  };

  const toggleChaperone = () => {
    if (chaperoneOn) {
      setChaperoneOn(false);
      setChaperonePass(null);
      sysMsg("Chaperone request withdrawn.");
      return;
    }
    const pass = `CHP-${1000 + Math.floor(Math.random() * 9000)}-F`;
    setChaperoneOn(true);
    setChaperonePass(pass);
    sysMsg(`Female chaperone nurse requested. Pass ${pass} will be checked at the exam room door.`);
    showToast("Chaperone nurse requested", "ok");
  };

  const reservePharmacy = (id: string, name: string) => {
    setReserve({ id, status: "pending" });
    showToast(`Prescription sent to ${name}. Waiting for them to confirm.`, "info");
    later(() => {
      setReserve((r) => (r && r.id === id ? { ...r, status: "confirmed" } : r));
      showToast(`${name} confirmed your order (demo pharmacy)`, "ok");
    }, 2600);
  };

  // ---- vitals ----
  const logVitals = () => {
    const sys = Number(vSys);
    const dia = Number(vDia);
    const pulse = Number(vPulse);
    const glu = Number(vGlu);
    if ([sys, dia, pulse, glu].some((n) => !Number.isFinite(n) || n <= 0)) {
      setVitalsError("Enter all four readings as numbers.");
      return;
    }
    if (sys < 60 || sys > 260 || dia < 30 || dia > 160 || pulse < 30 || pulse > 220 || glu < 30 || glu > 600) {
      setVitalsError("One value looks out of range. Please re-check your device.");
      return;
    }
    setVitalsError(null);
    const when = vDate ? new Date(`${vDate}T12:00:00`) : new Date();
    const entry: Vital = { id: uid(), label: shortDate(when), sys, dia, pulse, glucose: glu, source: vSource, sugarType: vSugarType };
    setVitals((prev) => [...prev, entry].slice(-8));
    setLogOpen(false);
    const docId = chatIdRef.current && chatIdRef.current !== "support" ? chatIdRef.current : "d1";
    setMessages((prev) => [...prev, { id: `pv-${entry.id}`, sender: "patient", time: entry.label, text: `Test on ${entry.label} (${vSource}): BP ${sys}/${dia} mmHg · Pulse ${pulse} bpm · ${vSugarType} sugar ${glu} mg/dL` }], docId);
    const high = sys >= 160 || dia >= 100 || glu >= 250;
    later(() => {
      setMessages(
        (prev) => [
          ...prev,
          {
            id: `dv-${entry.id}`,
            sender: "doctor",
            time: clock(),
            text: high
              ? "That reading is higher than I'd like. Please sit and rest for 10 minutes and log again. If you get chest pain, a bad headache or blurred vision, start SOS."
              : "Thanks, synced to your record. The trend looks steady.",
          },
        ],
        docId
      );
      scrollEnd();
    }, 900);
    showToast(high ? "Reading saved. It's above your target range." : "Reading saved and shared with your doctor", high ? "warn" : "ok");
  };

  // ---- records ----
  const grantRecords = (docName?: string, ms = SHARE_DURATIONS["24h"]) => {
    const who = docName ?? chatDoctor?.name ?? "the doctor";
    setRecordConsent("granted");
    setRecordExpiry(Date.now() + ms);
    setSharedWith(who);
    sysMsg(`You gave ${who} access to your past records. You can stop sharing any time.`);
  };

  const denyRecords = () => {
    setRecordConsent("denied");
    sysMsg("Record access declined. Your past notes stay locked.");
  };

  const revokeRecords = () => {
    setRecordConsent("revoked");
    setRecordExpiry(null);
    sysMsg("Sharing stopped. The doctor can no longer view your past notes.");
    showToast("Sharing stopped", "ok");
  };

  const expiryText = () => {
    if (!recordExpiry) return "";
    const ms = Math.max(recordExpiry - (nowTick || Date.now()), 0);
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${d ? `${d}d ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // ==========================================================================
  // DERIVED
  // ==========================================================================
  const firstName = profile.name.split(" ")[0] || "there";
  const grid2 = P ? "grid-cols-1" : "grid-cols-2";
  const grid3 = P ? "grid-cols-1" : "grid-cols-3";
  const bookedDoc = booking ? DOCTORS.find((d) => d.id === booking.docId) ?? null : null;
  const latest = vitals[vitals.length - 1];
  const threadIds = Object.keys(threads).filter((k) => (threads[k] ?? []).length);
  const suggestions = DOCTORS.filter((d) => !threads[d.id]?.length && !dismissedSuggest.includes(d.id)).slice(0, 3);
  const greeting = (() => {
    if (!mounted) return "Hello";
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  // ==========================================================================
  // RENDER: CHAT CARDS
  // ==========================================================================
  const wrap = (card: CardType) => cx("transition-all duration-500", flashCard === card && "ring-4 ring-brand/30");

  const renderCard = (card: CardType, id: string) => {
    const doc = chatDoctor;
    if (!doc) return null;
    switch (card) {
      case "appointment":
        return (
          <Card id={id} className={cx("p-4", wrap(card))}>
            <CardHeader title="Book a visit" sub={`${doc.name} · ₹${doc.fee}`} right={<CalendarDays className="h-5 w-5 text-brand" />} />
            {booking && booking.docId === doc.id ? (
              <div className="space-y-2">
                <Badge tone="ok">Confirmed</Badge>
                <p className="text-[14px] text-ink">
                  {booking.date}, {booking.slot}. Token <span className="font-bold tabular">{booking.token}</span>
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {days.slice(0, 3).map((d, i) => (
                    <ChoiceChip key={d.key} on={apptDayIdx === i} onClick={() => setApptDayIdx(i)}>
                      {d.short}
                    </ChoiceChip>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TIME_SLOTS.slice(0, 4).map((s) => (
                    <ChoiceChip key={s} on={apptSlot === s} onClick={() => setApptSlot(s)}>
                      {s}
                    </ChoiceChip>
                  ))}
                </div>
                <Button className="mt-3" full size="md" onClick={() => confirmBooking(doc, true)}>
                  Confirm {days[apptDayIdx].short}, {apptSlot}
                </Button>
              </>
            )}
          </Card>
        );
      case "arrival":
        return (
          <Card id={id} className={cx("p-4", wrap(card))}>
            <CardHeader title="Arrival slip" sub={doc.hospital} right={<MapPin className="h-5 w-5 text-brand" />} />
            <div className="flex items-center gap-3">
              <QRMock seed={`${booking?.token ?? "walk-in"}-${profile.name}`} size={84} />
              <div className="min-w-0 text-[14px]">
                <p className="font-bold text-ink">Token {booking?.token ?? "Walk-in"}</p>
                <p className="text-ink-muted">Show this at the front desk.</p>
                <p className="text-ink-muted">Blood {profile.bloodGroup || "not set"}</p>
              </div>
            </div>
            {etaShared ? (
              <Alert tone="ok" className="mt-3" title="Arrival time shared">
                {etaShared}
              </Alert>
            ) : (
              <Button className="mt-3" variant="secondary" full size="md" icon={<Navigation className="h-4 w-4" />} onClick={() => shareEta(doc)}>
                Share arrival time
              </Button>
            )}
          </Card>
        );
      case "prescription":
        return (
          <Card id={id} className={cx("p-4", wrap(card))}>
            <CardHeader title="E-prescription" sub={`Signed by ${doc.name} · NMC ${doc.nmcId}`} right={<Pill className="h-5 w-5 text-brand" />} />
            <ul className="space-y-2">
              {RX_ITEMS.map((r) => (
                <li key={r.name} className="rounded-xl bg-canvas p-2.5 text-[14px]">
                  <p className="font-bold text-ink">
                    {r.name} {r.kind === "critical" && <Badge tone="warn">Keep with you</Badge>}
                  </p>
                  <p className="text-ink-muted">{r.timing}</p>
                </li>
              ))}
            </ul>
            <Button className="mt-3" full size="md" icon={<MapPin className="h-4 w-4" />} onClick={() => go("rx")}>
              Find nearby pharmacies
            </Button>
          </Card>
        );
      case "chaperone":
        return (
          <Card id={id} tone="lav" className={cx("p-4", wrap(card))}>
            <CardHeader title="Chaperone nurse" sub="A female nurse stays in the room during your exam." right={<Shield className="h-5 w-5 text-lav-ink" />} />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold text-ink">{chaperoneOn ? "Requested" : "Not requested"}</span>
              <Toggle on={chaperoneOn} onChange={toggleChaperone} label="Request chaperone nurse" />
            </div>
            {chaperonePass && (
              <p className="mt-2 text-[13px] text-lav-ink">
                Pass <span className="font-bold tabular">{chaperonePass}</span> is checked at the exam room door.
              </p>
            )}
          </Card>
        );
      case "vitals":
        return (
          <Card id={id} className={cx("p-4", wrap(card))}>
            <CardHeader title="Share your last test" sub={`${latest.label}: BP ${latest.sys}/${latest.dia} · Pulse ${latest.pulse} · Sugar ${latest.glucose}`} right={<Activity className="h-5 w-5 text-brand" />} />
            <Button full size="md" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setLogOpen(true)}>
              Log a reading
            </Button>
          </Card>
        );
      case "records":
        return (
          <Card id={id} className={cx("p-4", wrap(card))}>
            <CardHeader title="Record access request" sub={`${doc.name} asks to see your past visit notes for 24 hours.`} right={<Lock className="h-5 w-5 text-brand" />} />
            {recordConsent === "granted" ? (
              <>
                <Badge tone="ok">Shared · ends in {expiryText()}</Badge>
                <Button className="mt-3" full size="md" variant="quiet" onClick={revokeRecords}>
                  Stop sharing now
                </Button>
              </>
            ) : recordConsent === "pending" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button size="md" variant="quiet" onClick={denyRecords}>
                  Decline
                </Button>
                <Button size="md" onClick={() => grantRecords()}>
                  Allow 24 h
                </Button>
              </div>
            ) : (
              <Badge tone="neutral" icon={<Lock className="h-3 w-3" />}>
                {recordConsent === "denied" ? "Declined" : "Sharing stopped"}
              </Badge>
            )}
          </Card>
        );
      default:
        return null;
    }
  };

  // ==========================================================================
  // RENDER: DOCTOR CARD
  // ==========================================================================
  const DoctorCard = ({ d }: { d: Doctor }) => (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar initials={d.initials} size={48} tone={d.gender === "female" ? "lav" : "mist"} />
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold leading-tight text-ink">{d.name}</p>
          <p className="text-[13.5px] text-ink-muted">{d.specialty}</p>
          <p className="text-[13px] text-ink-muted">
            {d.hospital} · {d.distanceKm} km
          </p>
        </div>
        <p className="shrink-0 text-right text-[15px] font-bold text-ink">₹{d.fee}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="ok" icon={<BadgeCheck className="h-3 w-3" />}>
          NMC verified
        </Badge>
        {isWoman && (
          <Badge tone="lav" icon={<Users className="h-3 w-3" />}>
            {d.safetyIndex.toFixed(1)} from {d.womenRatings} women
          </Badge>
        )}
        {d.chaperoneGuaranteed && (
          <Badge tone="info" icon={<Shield className="h-3 w-3" />}>
            Chaperone available
          </Badge>
        )}
        {d.video && (
          <Badge tone="neutral" icon={<Video className="h-3 w-3" />}>
            Video
          </Badge>
        )}
      </div>
      <p className="mt-2 text-[13px] font-semibold text-brand">Next slot: {d.nextSlot}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="md" variant="quiet" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openChat(d)}>
          Message
        </Button>
        <Button size="md" onClick={() => startBooking(d)}>
          Book visit
        </Button>
      </div>
    </Card>
  );

  // ==========================================================================
  // RENDER: ONBOARDING
  // ==========================================================================
  const renderOnboarding = () => {
    const stepLabel = ["Verify", "Health profile", "Emergency contacts", "Review"][obStep - 1];
    return (
      <div className={cx("mx-auto", P ? "px-5 py-6" : "max-w-xl py-4")}>
        {obStep > 1 && (
          <div className="mb-5">
            {obStep === 2 && <p className="mb-1 text-[13px] font-semibold text-brand">Signed in. Now set up your health profile.</p>}
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setObStep((s) => (s - 1) as 1 | 2 | 3 | 4)} className={cx("flex items-center gap-1 text-[14px] font-semibold text-brand", obStep === 2 && "invisible")}>
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <span className="text-[13px] font-semibold text-ink-muted">
                Step {obStep - 1} of 3 · {stepLabel}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5" aria-hidden>
              {[2, 3, 4].map((i) => (
                <span key={i} className={cx("h-1.5 rounded-full", i <= obStep ? "bg-brand" : "bg-line")} />
              ))}
            </div>
          </div>
        )}

        {formErrors.length > 0 && (
          <Alert tone="crit" className="mb-4" title="Please fix this first">
            <ul className="list-disc pl-4">
              {formErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        {obStep === 1 && (
          <div className="space-y-5">
            <div className="flex flex-col items-center pt-2 text-center">
              <Orb size={P ? 132 : 150} />
              <h1 className="mt-6 font-brand text-[34px] font-semibold leading-[1.1] text-ink">Know what to do next.</h1>
              <p className="mt-2 max-w-sm text-[15px] text-ink-muted">Clear guidance when you feel unwell, help in an emergency, and verified doctors near you.</p>
            </div>
            <Field label="Mobile number" htmlFor="ob-phone" error={otpError ?? undefined} help={!otpError ? "We send a one-time code. Nothing else." : undefined}>
              <input
                id="ob-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98xxx xxxxx"
                value={profile.contact}
                onChange={(e) => setProfile((p) => ({ ...p, contact: e.target.value }))}
                className={cx(inputCls, otpError && !otpSent && inputErrCls)}
              />
            </Field>
            {!otpSent ? (
              <Button full onClick={sendOtp}>
                Send one-time code
              </Button>
            ) : (
              <div className="space-y-3">
                <Field label="6-digit code" htmlFor="ob-otp">
                  <input
                    id="ob-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => onOtpChange(e.target.value)}
                    className={cx(inputCls, "tabular text-center text-[20px] tracking-[0.4em]", otpError && inputErrCls)}
                  />
                </Field>
                {otpVerified ? (
                  <Badge tone="ok">Number verified</Badge>
                ) : (
                  <button type="button" onClick={autofillOtp} className="text-[14px] font-semibold text-brand underline-offset-2 hover:underline">
                    Demo: tap to fill {DEMO_OTP}
                  </button>
                )}
              </div>
            )}
            <Button full variant={otpVerified ? "primary" : "secondary"} onClick={nextStep} disabled={!otpVerified}>
              Continue
            </Button>
          </div>
        )}

        {obStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[24px] font-bold text-ink">Your health profile</h2>
              <p className="text-[14px] text-ink-muted">Doctors and emergency staff see this first.</p>
            </div>
            <Field label="Full name" htmlFor="ob-name">
              <input id="ob-name" autoComplete="name" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age" htmlFor="ob-age">
                <input id="ob-age" inputMode="numeric" value={profile.age} onChange={(e) => setProfile((p) => ({ ...p, age: e.target.value.replace(/\D/g, "").slice(0, 3) }))} className={inputCls} />
              </Field>
              <div>
                <p className="mb-1.5 text-[14px] font-semibold text-ink">Gender</p>
                <div className="flex flex-wrap gap-1.5">
                  {GENDERS.map((g) => (
                    <ChoiceChip key={g} on={profile.gender === g} onClick={() => setProfile((p) => ({ ...p, gender: g }))} className="!h-9 !px-3 !text-[13px]">
                      {g}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[14px] font-semibold text-ink">Blood group</p>
              <div className="grid grid-cols-4 gap-2">
                {BLOOD_GROUPS.map((b) => (
                  <ChoiceChip key={b} on={profile.bloodGroup === b} onClick={() => setProfile((p) => ({ ...p, bloodGroup: b }))} className="justify-center">
                    {b}
                  </ChoiceChip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[14px] font-semibold text-ink">Allergies</p>
              <div className="flex gap-2">
                <input
                  aria-label="Add an allergy"
                  placeholder="Type an allergy"
                  value={allergyDraft}
                  onChange={(e) => setAllergyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAllergy();
                    }
                  }}
                  className={inputCls}
                />
                <Button variant="secondary" onClick={addAllergy} aria-label="Add allergy" icon={<Plus className="h-4 w-4" />}>
                  Add
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from(new Set([...ALLERGY_OPTIONS, ...profile.allergies])).map((a) => (
                  <ChoiceChip
                    key={a}
                    on={profile.allergies.includes(a)}
                    onClick={() => {
                      setNoAllergies(false);
                      setProfile((p) => ({ ...p, allergies: toggleIn(p.allergies, a) }));
                    }}
                  >
                    {a}
                  </ChoiceChip>
                ))}
              </div>
              <div className="mt-2">
                <Checkbox
                  checked={noAllergies}
                  onChange={(v) => {
                    setNoAllergies(v);
                    if (v) setProfile((p) => ({ ...p, allergies: [] }));
                  }}
                >
                  No known allergies
                </Checkbox>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[14px] font-semibold text-ink">Ongoing conditions</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...CONDITION_OPTIONS, ...profile.conditions])).map((c) => (
                  <ChoiceChip key={c} on={profile.conditions.includes(c)} onClick={() => setProfile((p) => ({ ...p, conditions: toggleIn(p.conditions, c) }))}>
                    {c}
                  </ChoiceChip>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  aria-label="Add a condition"
                  placeholder="Other condition"
                  value={conditionDraft}
                  onChange={(e) => setConditionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCondition();
                    }
                  }}
                  className={inputCls}
                />
                <Button variant="secondary" onClick={addCondition} icon={<Plus className="h-4 w-4" />}>
                  Add
                </Button>
              </div>
            </div>
            <Button full onClick={nextStep}>
              Continue
            </Button>
          </div>
        )}

        {obStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[24px] font-bold text-ink">Emergency contacts</h2>
              <p className="text-[14px] text-ink-muted">They get your location by SMS when you start SOS.</p>
            </div>
            {profile.emergencyContacts.map((c, i) => (
              <Card key={i} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <Eyebrow>Contact {i + 1}</Eyebrow>
                  {profile.emergencyContacts.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove contact ${i + 1}`}
                      onClick={() => setProfile((p) => ({ ...p, emergencyContacts: p.emergencyContacts.filter((_, j) => j !== i) }))}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-canvas"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {(["name", "relation", "phone"] as const).map((k) => (
                  <Field key={k} label={k === "name" ? "Name" : k === "relation" ? "Relation" : "Phone"} htmlFor={`ec-${i}-${k}`}>
                    <input
                      id={`ec-${i}-${k}`}
                      type={k === "phone" ? "tel" : "text"}
                      value={c[k]}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, emergencyContacts: p.emergencyContacts.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }))
                      }
                      className={inputCls}
                    />
                  </Field>
                ))}
              </Card>
            ))}
            {profile.emergencyContacts.length < 3 && (
              <Button
                full
                variant="secondary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setProfile((p) => ({ ...p, emergencyContacts: [...p.emergencyContacts, { name: "", relation: "", phone: "" }] }))}
              >
                Add another contact
              </Button>
            )}
            <Button full onClick={nextStep}>
              Continue
            </Button>
          </div>
        )}

        {obStep === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[24px] font-bold text-ink">Your Emergency Health Snapshot</h2>
              <p className="text-[14px] text-ink-muted">Saved on this phone, so it works without network.</p>
            </div>
            {renderSnapshotCard()}
            <Checkbox checked={profile.researchOptIn} onChange={(v) => setProfile((p) => ({ ...p, researchOptIn: v }))}>
              Let doctors use my anonymised data for research (optional)
            </Checkbox>
            <Button full onClick={finishOnboarding}>
              Save snapshot
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderSnapshotCard = () => (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 bg-sage px-4 py-3">
        <Avatar initials={initialsOf(profile.name)} size={44} tone="brand" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink">{profile.name || "Name not set"}</p>
          <p className="text-[13px] text-sage-ink">
            {profile.age ? `${profile.age} yrs` : "Age not set"} · {profile.gender || "Gender not set"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase text-sage-ink">Blood</p>
          <p className="flex items-center gap-1 text-[22px] font-bold text-ink">
            <Droplet className="h-4 w-4 text-coral" />
            {profile.bloodGroup || "—"}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4 text-[14px]">
        <div>
          <Eyebrow>Allergies</Eyebrow>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {profile.allergies.length ? profile.allergies.map((a) => <Badge key={a} tone="crit">{a}</Badge>) : <span className="text-ink-muted">No known allergies</span>}
          </div>
        </div>
        <div>
          <Eyebrow>Conditions</Eyebrow>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {profile.conditions.length ? profile.conditions.map((c) => <Badge key={c} tone="info" noIcon>{c}</Badge>) : <span className="text-ink-muted">None listed</span>}
          </div>
        </div>
        <div>
          <Eyebrow>Emergency contacts</Eyebrow>
          {profile.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()).length ? (
            <ul className="mt-1 space-y-1">
              {profile.emergencyContacts
                .filter((c) => c.name.trim() || c.phone.trim())
                .map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="text-ink">
                      {c.name} {c.relation && <span className="text-ink-muted">({c.relation})</span>}
                    </span>
                    <span className="tabular text-ink-muted">{c.phone}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-1 text-ink-muted">None saved</p>
          )}
        </div>
      </div>
    </Card>
  );

  // ==========================================================================
  // RENDER: SCREENS
  // ==========================================================================
  const renderHome = () => (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] text-ink-muted">{greeting},</p>
          <h1 className="font-brand text-[30px] font-semibold leading-tight text-ink">{firstName}</h1>
        </div>
        {online ? (
          <Badge tone="ok">Online</Badge>
        ) : (
          <Badge tone="warn" icon={<WifiOff className="h-3 w-3" />}>
            Offline
          </Badge>
        )}
      </div>
      {!online && (
        <Alert tone="offline" title="You're offline">
          Your snapshot and SOS still work. Alerts send when the network returns, so call 108 if it's urgent.
        </Alert>
      )}

      <div className={cx("grid gap-4", grid2)}>
        <Card className="p-5">
          <Eyebrow>Not feeling well?</Eyebrow>
          <h2 className="mt-1 text-[20px] font-bold text-ink">Tell us what's happening</h2>
          <p className="mt-1 text-[14px] text-ink-muted">Get clear next steps in under a minute. This is guidance, not a diagnosis.</p>
          <Button className="mt-4" full icon={<Stethoscope className="h-5 w-5" />} onClick={() => go("symptom")}>
            Check my symptoms
          </Button>
        </Card>

        <Card tone="emergency" className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral-tint text-coral-dark">
              <Siren className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[18px] font-bold text-ink">Emergency help</h2>
              <p className="text-[14px] text-ink-muted">Alerts the 24/7 desk and your contacts with your location.</p>
            </div>
          </div>
          <Button className="mt-4" full variant="emergency" icon={<Siren className="h-5 w-5" />} onClick={() => go("sos")}>
            Get emergency help
          </Button>
        </Card>
      </div>

      {booking && bookedDoc && (
        <Card tone="sage" className="p-4">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-ink">
                {booking.date}, {booking.slot}
              </p>
              <p className="truncate text-[13px] text-sage-ink">
                {bookedDoc.name} · Token {booking.token}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => go("confirmed")}>
              View
            </Button>
          </div>
        </Card>
      )}

      <div>
        <Eyebrow className="mb-2">Quick access</Eyebrow>
        <div className={cx("grid gap-2.5", P ? "grid-cols-1" : "grid-cols-2")}>
          <RowButton icon={<Sparkles className="h-5 w-5" />} title="Ask CuraPulse Assistant" sub="AI health tips and next steps" onClick={() => go("assistant")} />
          <RowButton icon={<Search className="h-5 w-5" />} title="Find care" sub={isWoman ? "Verified doctors, women-rated" : "Verified doctors near you"} onClick={() => goTab("care")} />
          <RowButton icon={<Pill className="h-5 w-5" />} title="Pharmacies" sub="Govt-verified stock near you" onClick={() => go("rx")} />
          <RowButton icon={<HeartPulse className="h-5 w-5" />} title="Last test results" sub={`${latest.label}: BP ${latest.sys}/${latest.dia}`} onClick={() => goTab("vitals")} />
          <RowButton icon={<ClipboardList className="h-5 w-5" />} title="Emergency Health Snapshot" sub={savedAt ? `Saved on this device · ${savedAt}` : "Saved on this device"} onClick={() => go("snapshot")} />
        </div>
      </div>
    </div>
  );

  const renderSymptom = () => (
    <div className="space-y-4">
      <ScreenHeader title="How are you feeling?" sub="Describe it in your own words." onBack={back} />
      <Field label="What's happening" htmlFor="sym-text" help="Include when it started and how bad it is.">
        <textarea
          id="sym-text"
          rows={5}
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          placeholder="e.g. headache since this morning, mild fever"
          className={cx(inputCls, "h-auto py-3 leading-snug")}
        />
      </Field>
      <div>
        <Eyebrow className="mb-2">Or start from an example</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {SYMPTOM_PRESETS.map((s) => (
            <ChoiceChip key={s} on={symptoms === s} onClick={() => setSymptoms(s)}>
              {s}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {(profile.allergies.length > 0 || profile.conditions.length > 0) && (
        <Alert tone="info" title="We'll take your snapshot into account">
          {[profile.allergies.length ? `Allergies: ${profile.allergies.join(", ")}` : "", profile.conditions.length ? `Conditions: ${profile.conditions.join(", ")}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </Alert>
      )}
      <Button full loading={checking} disabled={checking} onClick={() => void runChecker()}>
        {checking ? "Checking…" : "Get next steps"}
      </Button>
      <p className="text-center text-[12.5px] text-ink-soft">CuraPulse gives guidance, never prescriptions. In an emergency, call 108.</p>
    </div>
  );

  const renderSymptomResult = () => {
    if (!aiResult) return renderSymptom();
    const u = URGENCY_COPY[aiResult.urgency_level] ?? URGENCY_COPY.MEDIUM;
    const crit = aiResult.urgency_level === "CRITICAL";
    return (
      <div className="space-y-4">
        <ScreenHeader title="Your next steps" sub={`“${symptoms}”`} onBack={back} />
        <Card tone={crit ? "emergency" : u.tone === "warn" ? "plain" : "sage"} className="p-5">
          <Badge tone={u.tone}>{aiResult.urgency_level === "CRITICAL" ? "Urgent" : aiResult.urgency_level === "MEDIUM" ? "Soon" : "Not urgent"}</Badge>
          <h2 className={cx("mt-2 text-[22px] font-bold", crit ? "text-coral-dark" : "text-ink")}>{u.title}</h2>
          <p className="mt-1 text-[14px] text-ink-muted">{u.sub}</p>
          {crit && (
            <div className="mt-4 grid gap-2">
              <Button full variant="emergency" icon={<Siren className="h-5 w-5" />} onClick={() => go("sos")}>
                Get emergency help
              </Button>
              <LinkButton full variant="emergencyOutline" href="tel:108" icon={<Phone className="h-5 w-5" />}>
                Call 108
              </LinkButton>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader title="What to do now" />
          <ol className="space-y-2.5">
            {aiResult.first_aid_steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage text-[13px] font-bold text-brand">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Card>

        {aiResult.contraindication_warnings.length > 0 && (
          <Alert tone="warn" title="Be careful with">
            <ul className="list-disc pl-4">
              {aiResult.contraindication_warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Card tone="mist" className="p-4">
          <p className="text-[13px] font-semibold text-mist-ink">Suggested doctor</p>
          <p className="text-[17px] font-bold text-ink">{aiResult.specialist_recommendation}</p>
          <Button className="mt-3" full variant="secondary" icon={<Search className="h-4 w-4" />} onClick={findSpecialistFromAi}>
            Find a {aiResult.specialist_recommendation}
          </Button>
        </Card>

        <p className="text-center text-[12.5px] text-ink-soft">
          {aiResult.source === "device-offline" || aiResult.source === "offline-rules"
            ? "Offline safety rules on this device were used."
            : `Guidance by AI${aiResult.model ? ` (${aiResult.model})` : ""}, checked by safety rules.`}{" "}
          Not a diagnosis. CuraPulse never prescribes medicine.
        </p>
      </div>
    );
  };

  const renderSos = () => (
    <div className="space-y-4">
      <ScreenHeader title="Emergency help" sub="Use this if you or someone near you needs urgent help." onBack={back} />
      <Card tone="emergency" className="p-5 text-center">
        <button
          type="button"
          onPointerDown={beginHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              startSOS();
            }
          }}
          aria-label="Hold to start SOS, or press Enter"
          className="relative mx-auto flex h-44 w-44 select-none items-center justify-center overflow-hidden rounded-full bg-coral text-white shadow-frame focus:outline-none focus-visible:ring-8 focus-visible:ring-coral/30"
        >
          <span className="absolute inset-x-0 bottom-0 bg-coral-dark transition-[height] duration-75" style={{ height: `${holdPct}%` }} aria-hidden />
          <span className="relative flex flex-col items-center">
            <Siren className="h-9 w-9" />
            <span className="mt-1 text-[22px] font-extrabold tracking-wide">SOS</span>
            <span className="text-[13px] font-semibold opacity-95">{holdPct > 0 ? "Keep holding…" : "Hold to start"}</span>
          </span>
        </button>
        <p className="mt-4 text-[14px] text-ink-muted">Hold for 1.5 seconds. You'll have 5 seconds to cancel before anything is sent.</p>
      </Card>
      <LinkButton full variant="emergencyOutline" href="tel:108" icon={<Phone className="h-5 w-5" />}>
        Call 108 ambulance
      </LinkButton>
      <Card className="p-4">
        <CardHeader title="What happens next" />
        <Timeline
          items={[
            { title: "We share your location", sub: "GPS, or your last known area if GPS is off", state: "pending" },
            { title: "The 24/7 Support Desk gets your snapshot", sub: `Blood ${profile.bloodGroup || "not set"}${profile.allergies.length ? ` · Allergic to ${profile.allergies.join(", ")}` : ""}`, state: "pending" },
            { title: "Your emergency contacts get an SMS", sub: `${profile.emergencyContacts.filter((c) => c.phone.trim()).length} contact(s) saved`, state: "pending" },
          ]}
        />
      </Card>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold text-ink">Bystander alarm</p>
            <p className="text-[13px] text-ink-muted">Loud sound to get attention nearby.</p>
          </div>
          <Button size="sm" variant={alarmOn ? "emergency" : "quiet"} icon={alarmOn ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} onClick={toggleAlarm}>
            {alarmOn ? "Stop alarm" : "Sound alarm"}
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderSosCountdown = () => (
    <div className="flex min-h-full flex-col items-center justify-center px-2 py-10 text-center">
      {sosSending ? (
        <>
          <span className="flex h-40 w-40 items-center justify-center rounded-full border-4 border-dashed border-coral text-coral-dark">
            <Bell className="h-12 w-12 animate-pulse" />
          </span>
          <h1 className="mt-6 text-[24px] font-bold text-ink">Sending your alert…</h1>
          <p className="mt-1 text-[15px] text-ink-muted">Getting your location and contacting the Support Desk.</p>
        </>
      ) : (
        <>
          <p className="text-[15px] font-semibold text-coral-dark">Starting SOS in</p>
          <span className="mt-3 flex h-44 w-44 items-center justify-center rounded-full bg-coral text-white shadow-frame" aria-live="assertive">
            <span className="tabular text-[76px] font-extrabold leading-none">{sosSeconds}</span>
          </span>
          <p className="mt-5 max-w-xs text-[15px] text-ink-muted">Your location and snapshot will go to the Support Desk and your emergency contacts.</p>
          <Button className="mt-6 w-full max-w-xs" size="lg" variant="quiet" icon={<X className="h-5 w-5" />} onClick={cancelSOS}>
            Cancel, I'm OK
          </Button>
        </>
      )}
    </div>
  );

  const renderSosStatus = () => {
    if (!sosReceipt) return renderSos();
    const r = sosReceipt;
    const smsText = encodeURIComponent(`SOS from ${profile.name || "CuraPulse user"}. My location: https://maps.google.com/?q=${r.lat},${r.lng}`);
    const firstContact = profile.emergencyContacts.find((c) => c.phone.trim());
    return (
      <div className="space-y-4">
        <ScreenHeader title={r.synced ? "Help is on the way" : "Alert not sent yet"} sub={`Ref ${r.ref} · ${r.time}`} />
        {r.synced ? (
          <Alert tone="ok" title="Sent to the Support Desk">
            {r.syncNote}
          </Alert>
        ) : (
          <Alert
            tone="offline"
            title="We couldn't reach the Support Desk"
            action={
              <>
                <Button size="sm" variant="secondary" loading={sosSending} onClick={retrySOS}>
                  Retry now
                </Button>
                <LinkButton size="sm" variant="quiet" href={`sms:${firstContact?.phone.replace(/\s/g, "") ?? ""}?body=${smsText}`}>
                  Send SMS instead
                </LinkButton>
              </>
            }
          >
            {r.syncNote}
          </Alert>
        )}
        <LinkButton full variant="emergency" href="tel:108" icon={<Phone className="h-5 w-5" />}>
          Call 108 ambulance
        </LinkButton>
        <Card className="p-4">
          <CardHeader title="Status" />
          <Timeline
            items={[
              { title: "Alert created on this phone", sub: r.time, state: "done" },
              {
                title: r.usedFallback ? "Location: last known area used" : "Location shared (GPS)",
                sub: `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}${r.usedFallback ? " · GPS unavailable, DTU campus used" : ""}`,
                state: r.usedFallback ? "active" : "done",
              },
              { title: r.synced ? "Support Desk received it" : "Support Desk: pending", sub: r.synced ? "Confirmed by the server" : "Will send when network returns", state: r.synced ? "done" : "failed" },
              { title: deskAck ? "Agent update" : "Waiting for an agent", sub: deskAck ?? (r.synced ? "Usually under a minute" : "Not reached yet"), state: deskAck ? "done" : r.synced ? "active" : "pending" },
            ]}
          />
        </Card>
        <Card className="p-4">
          <CardHeader title="Family SMS" right={<Badge tone="lav">Simulated</Badge>} sub="Demo gateway. No real SMS is sent." />
          <ul className="space-y-2">
            {smsLog.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[14px]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{s.name}</span>
                  <span className="tabular text-[13px] text-ink-muted">{s.phone}</span>
                </span>
                <Badge tone={s.status === "delivered" ? "ok" : s.status === "sent" ? "info" : "neutral"}>
                  {s.status === "delivered" ? "Delivered" : s.status === "sent" ? "Sent" : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <CardHeader title="Nearest emergency rooms" />
          <ul className="space-y-2 text-[14px]">
            {HOSPITALS.map((h) => (
              <li key={h.name} className="flex items-center justify-between gap-2">
                <span className="text-ink">{h.name}</span>
                <span className="tabular text-ink-muted">{h.km} km</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={alarmOn ? "emergency" : "quiet"} icon={alarmOn ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} onClick={toggleAlarm}>
            {alarmOn ? "Stop alarm" : "Alarm"}
          </Button>
          <Button variant="secondary" onClick={() => goTab("home")}>
            Back home
          </Button>
        </div>
      </div>
    );
  };

  const renderCare = () => (
    <div className="space-y-4">
      <ScreenHeader title="Find care" sub="Verified doctors near DTU, rated by women patients." />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" />
        <input aria-label="Search doctors, conditions or hospitals" placeholder="Search a symptom, doctor or hospital" value={query} onChange={(e) => setQuery(e.target.value)} className={cx(inputCls, "pl-11")} />
      </div>
      <div className="flex flex-wrap gap-2">
        <ChoiceChip on={todayOnly} onClick={() => setTodayOnly((v) => !v)}>
          Available today
        </ChoiceChip>
        {isWoman && (
          <ChoiceChip on={femaleOnly} onClick={() => setFemaleOnly((v) => !v)}>
            Female doctors only
          </ChoiceChip>
        )}
        <ChoiceChip on={videoOnly} onClick={() => setVideoOnly((v) => !v)}>
          Video visit
        </ChoiceChip>
        {isWoman && femaleOnly && (
          <ChoiceChip on={simulateNoFemale} onClick={() => setSimulateNoFemale((v) => !v)}>
            Demo: none nearby
          </ChoiceChip>
        )}
      </div>
      {searchResult.mapped && query && (
        <p className="text-[13px] text-ink-muted">
          Showing doctors for <span className="font-semibold text-ink">{searchResult.mapped}</span>
        </p>
      )}
      {searchResult.fallback ? (
        <>
          <Alert tone="warn" title="No female doctor is free nearby right now">
            Here are the safest alternatives. Every one can have a female chaperone nurse in the room.
          </Alert>
          {searchResult.tier1.length > 0 && (
            <>
              <Eyebrow>Best match · rated 4.8+ by women, chaperone guaranteed</Eyebrow>
              <div className={cx("grid gap-3", grid2)}>
                {searchResult.tier1.map((d) => (
                  <DoctorCard key={d.id} d={d} />
                ))}
              </div>
            </>
          )}
          {searchResult.tier2.length > 0 && (
            <>
              <Eyebrow>Also available</Eyebrow>
              <div className={cx("grid gap-3", grid2)}>
                {searchResult.tier2.map((d) => (
                  <DoctorCard key={d.id} d={d} />
                ))}
              </div>
            </>
          )}
        </>
      ) : searchResult.list.length ? (
        <div className={cx("grid gap-3", grid2)}>
          {searchResult.list.map((d) => (
            <DoctorCard key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-[15px] font-bold text-ink">No doctors match</p>
          <p className="mt-1 text-[14px] text-ink-muted">Try fewer filters or a different word.</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              setQuery("");
              setTodayOnly(false);
              setVideoOnly(false);
            }}
          >
            Clear filters
          </Button>
        </Card>
      )}
    </div>
  );

  const renderBook = () => {
    const d = bookDoc;
    if (!d) return renderCare();
    return (
      <div className="space-y-4">
        <ScreenHeader title="Book a visit" onBack={back} />
        <Card className="flex items-center gap-3 p-4">
          <Avatar initials={d.initials} size={48} tone={d.gender === "female" ? "lav" : "mist"} />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-ink">{d.name}</p>
            <p className="text-[13px] text-ink-muted">
              {d.specialty} · NMC {d.nmcId}
            </p>
          </div>
          <Badge tone="ok" icon={<BadgeCheck className="h-3 w-3" />}>
            Verified
          </Badge>
        </Card>
        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">Day</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((day, i) => (
              <ChoiceChip key={day.key} on={apptDayIdx === i} onClick={() => setApptDayIdx(i)} className="shrink-0">
                {day.short}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">Time</p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_SLOTS.map((s) => (
              <ChoiceChip key={s} on={apptSlot === s} onClick={() => setApptSlot(s)} className="justify-center !px-2">
                {s}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[14px] font-semibold text-ink">Visit type</p>
          <Segmented
            value={apptMode}
            onChange={(v) => setApptMode(v as "inperson" | "video")}
            options={[
              { value: "inperson", label: "In person" },
              { value: "video", label: d.video ? "Video" : "Video (not offered)" },
            ]}
          />
          {apptMode === "video" && !d.video && <p className="mt-1.5 text-[13px] text-caution-ink">This doctor sees patients in person only. We'll book in person.</p>}
        </div>
        <Card tone="lav" className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[15px] font-bold text-ink">Female chaperone nurse</p>
            <p className="text-[13px] text-lav-ink">Stays in the room for any physical exam. Free.</p>
          </div>
          <Toggle on={apptChaperone} onChange={() => setApptChaperone((v) => !v)} label="Request chaperone nurse" />
        </Card>
        <Card className="p-4 text-[14px]">
          <div className="flex justify-between">
            <span className="text-ink-muted">Consultation fee</span>
            <span className="font-bold text-ink">₹{d.fee}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-ink-muted">Pay at</span>
            <span className="text-ink">{d.hospital}</span>
          </div>
        </Card>
        <Button
          full
          onClick={() => {
            if (apptMode === "video" && !d.video) setApptMode("inperson");
            confirmBooking(d);
          }}
        >
          Confirm {days[apptDayIdx].short}, {apptSlot}
        </Button>
      </div>
    );
  };

  const renderConfirmed = () => {
    if (!booking || !bookedDoc) return renderCare();
    return (
      <div className="space-y-4">
        <ScreenHeader title="You're booked" sub="We've sent the details to your chats." onBack={() => goTab("home")} />
        <Card className="p-5 text-center">
          <Badge tone="ok">Confirmed</Badge>
          <div className="mt-4 flex justify-center">
            <QRMock seed={`${booking.token}-${profile.name}`} size={148} />
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">Token</p>
          <p className="tabular text-[28px] font-bold text-ink">{booking.token}</p>
          <p className="mt-2 text-[15px] font-semibold text-ink">
            {booking.date}, {booking.slot}
          </p>
          <p className="text-[14px] text-ink-muted">
            {bookedDoc.name} · {booking.mode === "video" ? "Video visit" : bookedDoc.hospital}
          </p>
          {booking.chaperone && (
            <Badge tone="lav" className="mt-2" icon={<Shield className="h-3 w-3" />}>
              Chaperone requested
            </Badge>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<CalendarPlus className="h-4 w-4" />} onClick={downloadIcs}>
            Add to calendar
          </Button>
          <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" />} onClick={() => openChat(bookedDoc)}>
            Message
          </Button>
        </div>
        {booking.mode === "inperson" &&
          (etaShared ? (
            <Alert tone="ok" title="Arrival time shared">
              {etaShared}
            </Alert>
          ) : (
            <Button full variant="quiet" icon={<Navigation className="h-4 w-4" />} onClick={() => shareEta(bookedDoc)}>
              Share arrival time with the front desk
            </Button>
          ))}
      </div>
    );
  };

  const unreadOf = (id: string) => {
    const list = threads[id] ?? [];
    let lastMine = -1;
    list.forEach((m, i) => {
      if (m.sender === "patient") lastMine = i;
    });
    const from = Math.max(readUpTo[id] ?? 0, lastMine + 1);
    return list.slice(from).filter((m) => m.sender !== "patient").length;
  };

  const renderChats = () => {
    const q = chatSearch.trim().toLowerCase();
    const rows = [SUPPORT_CONTACT, ...DOCTORS]
      .filter((d) => d.id === "support" || (threads[d.id] ?? []).length)
      .filter((d) => {
        if (chatFilter === "unread" && !unreadOf(d.id)) return false;
        if (chatFilter === "doctors" && d.id === "support") return false;
        if (chatFilter === "support" && d.id !== "support") return false;
        if (!q) return true;
        const last = (threads[d.id] ?? []).map((m) => m.text ?? "").join(" ");
        return `${d.name} ${d.specialty} ${last}`.toLowerCase().includes(q);
      });
    const totalUnread = threadIds.reduce((n, id) => n + unreadOf(id), 0);
    return (
      <div className="relative min-h-full pb-20">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-[26px] font-extrabold tracking-tight text-brand">Chats</h1>
          <button type="button" aria-label="New chat" onClick={() => goTab("care")} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink hover:bg-sage">
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input aria-label="Search doctors or messages" placeholder="Search doctors or messages" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-[14.5px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
        </div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Filter chats">
          {(
            [
              ["all", "All"],
              ["unread", totalUnread ? `Unread ${totalUnread}` : "Unread"],
              ["doctors", "Doctors"],
              ["support", "Support"],
            ] as [typeof chatFilter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={chatFilter === k}
              onClick={() => setChatFilter(k)}
              className={cx("shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", chatFilter === k ? "border-brand bg-sage text-sage-ink" : "border-line-strong bg-white text-ink-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => go("assistant")} className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-lav-line bg-lav/40 px-3.5 py-3 text-left hover:bg-lav/60">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6B5BA8] to-brand text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[15.5px] font-bold text-ink">
              CuraPulse Assistant <Badge tone="lav">AI</Badge>
            </span>
            <span className="block truncate text-[13.5px] text-ink-muted">{aiMsgs.length ? aiMsgs[aiMsgs.length - 1].text : "Health tips, which doctor to see, what to ask"}</span>
          </span>
          <Pin className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-label="Pinned" />
        </button>
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {rows.length === 0 && <p className="p-6 text-center text-[14px] text-ink-muted">No chats match.</p>}
          {rows.map((d) => {
            const list = threads[d.id] ?? [];
            const last = list[list.length - 1];
            const unread = unreadOf(d.id);
            const isSupport = d.id === "support";
            const pending = typing && chatDoctor?.id === d.id;
            const preview = last ? last.text ?? (last.card ? `${last.card === "prescription" ? "E-prescription" : last.card === "appointment" ? "Booking card" : last.card[0].toUpperCase() + last.card.slice(1) + " card"}` : "") : "24/7 help with anything in the app";
            return (
              <button key={d.id} type="button" onClick={() => openChat(d)} className="flex w-full items-center gap-3 border-b border-line px-3.5 py-3 text-left last:border-b-0 hover:bg-canvas">
                <Avatar initials={d.initials} size={48} tone={isSupport ? "brand" : d.gender === "female" ? "lav" : "mist"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15.5px] font-bold text-ink">{d.name}</p>
                  <p className="flex items-center gap-1 truncate text-[13.5px] text-ink-muted">
                    {last?.sender === "patient" && (
                      <span className={cx("shrink-0 font-bold", pending ? "text-ink-soft" : "text-brand")} aria-label={pending ? "Sent" : "Delivered"}>
                        {pending ? "✓" : "✓✓"}
                      </span>
                    )}
                    <span className="truncate">{preview}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cx("text-[12px]", unread ? "font-bold text-brand" : "text-ink-soft")}>{last?.time ?? ""}</span>
                  {unread ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  ) : isSupport ? (
                    <Pin className="h-3.5 w-3.5 text-ink-soft" aria-label="Pinned" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        {suggestions.length > 0 && chatFilter === "all" && !q && (
          <div className="mt-4">
            <p className="mb-2 text-center text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-brand">Quick add · suggested doctors</p>
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              {suggestions.map((d) => (
                <div key={d.id} className="flex items-center gap-3 border-b border-line p-3 last:border-b-0">
                  <Avatar initials={d.initials} size={42} tone={d.gender === "female" ? "lav" : "mist"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-ink">{d.name}</p>
                    <p className="truncate text-[12.5px] text-ink-muted">
                      {d.specialty}{isWoman ? ` · ${d.safetyIndex.toFixed(1)} from ${d.womenRatings} women` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => openChat(d)} className="shrink-0 rounded-full border-[1.5px] border-brand px-3 py-1 text-[12.5px] font-bold text-brand hover:bg-sage">
                    + Add
                  </button>
                  <button type="button" aria-label={`Dismiss ${d.name}`} onClick={() => setDismissedSuggest((x) => [...x, d.id])} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-canvas">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          aria-label="Start a new chat"
          onClick={() => goTab("care")}
          className={cx("flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-frame hover:bg-brand-dark", P ? "sticky bottom-3 ml-auto mt-4" : "fixed bottom-8 right-8")}
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      </div>
    );
  };

  const renderChat = () => {
    const d = chatDoctor;
    if (!d) return renderChats();
    const isSupport = d.id === "support";
    const tiles: { key: string; label: string; icon: React.ReactNode; color: string; run: () => void; show: boolean }[] = [
      { key: "book", label: "Book", icon: <CalendarDays className="h-5 w-5" />, color: "bg-brand", run: () => pushCard("appointment"), show: !isSupport },
      { key: "arrival", label: "Arrival", icon: <MapPin className="h-5 w-5" />, color: "bg-[#2A8379]", run: () => pushCard("arrival", "system"), show: !isSupport },
      { key: "rx", label: "Medicine", icon: <Pill className="h-5 w-5" />, color: "bg-[#23476A]", run: () => pushCard("prescription"), show: !isSupport },
      { key: "chap", label: "Chaperone", icon: <Shield className="h-5 w-5" />, color: "bg-[#5B3E8A]", run: () => pushCard("chaperone", "system"), show: !isSupport },
      { key: "vitals", label: "Vitals", icon: <Activity className="h-5 w-5" />, color: "bg-[#B7791F]", run: () => pushCard("vitals"), show: !isSupport },
      { key: "records", label: "Records", icon: <FileText className="h-5 w-5" />, color: "bg-[#4F5F6A]", run: () => pushCard("records"), show: !isSupport },
      { key: "pharm", label: "Pharmacies", icon: <Navigation className="h-5 w-5" />, color: "bg-[#145C55]", run: () => go("rx"), show: true },
      { key: "sos", label: "SOS", icon: <Siren className="h-5 w-5" />, color: "bg-coral", run: () => go("sos"), show: true },
    ];
    return (
      <div className={cx("flex flex-col", P ? "-mx-4 -my-4 flex-1" : "mx-auto min-h-[calc(100vh-110px)] max-w-3xl overflow-hidden rounded-2xl border border-line")}>
        <div className={cx("sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white px-2 py-2")}>
          <button type="button" onClick={back} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-canvas">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar initials={d.initials} size={40} tone={isSupport ? "brand" : d.gender === "female" ? "lav" : "mist"} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[15.5px] font-bold text-ink">
              {d.name} {!isSupport && <BadgeCheck className="h-4 w-4 shrink-0 text-brand" aria-label="NMC verified" />}
            </p>
            <p className="truncate text-[12.5px] text-ink-muted">{typing ? "typing…" : liveChat === "live" ? (isSupport ? "Support Desk · live chat" : `Live chat · ${d.specialty}`) : isSupport ? "Support Desk · replies in minutes" : `${d.specialty} · NMC ${d.nmcId}`}</p>
          </div>
        </div>
        <div className="flex-1 space-y-2 bg-[#E8F0EC] bg-[radial-gradient(#d5e3dc_1px,transparent_1px)] px-3 py-3 [background-size:16px_16px]" aria-live="polite">
          <p className="mx-auto w-fit rounded-lg bg-white px-3 py-1 text-[12px] font-bold text-ink-muted shadow-sm">Today</p>
          <p className="mx-auto w-fit max-w-[92%] rounded-lg border border-caution-line bg-caution-tint px-3 py-1.5 text-center text-[12.5px] text-caution-ink">
            Chat is not for emergencies.{" "}
            <button type="button" onClick={() => go("sos")} className="rounded-full bg-coral px-2 py-0.5 text-[11.5px] font-extrabold text-white">
              SOS
            </button>{" "}
            or call 108.
          </p>
          {messages.map((m, idx) => {
            if (m.card)
              return (
                <div key={m.id} className="max-w-[88%]">
                  {renderCard(m.card, m.id)}
                </div>
              );
            if (m.sender === "system")
              return (
                <p key={m.id} className="mx-auto w-fit max-w-[90%] rounded-lg bg-mist px-3 py-1.5 text-center text-[12.5px] text-mist-ink">
                  {m.text}
                </p>
              );
            const mine = m.sender === "patient";
            const text = m.text ?? "";
            const long = text.length > 220 && !expanded.includes(m.id);
            const isLastMine = mine && !messages.slice(idx + 1).some((x) => x.sender === "patient");
            const sending = isLastMine && typing;
            return (
              <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[80%] rounded-xl px-3 pb-1 pt-2 text-[14.5px] leading-snug text-ink shadow-[0_1px_1px_rgba(0,0,0,0.06)]", mine ? "rounded-tr-sm bg-[#CDEBE1]" : "rounded-tl-sm bg-white")}>
                  <p className="whitespace-pre-wrap">
                    {long ? `${text.slice(0, 200)}… ` : text}
                    {long && (
                      <button type="button" onClick={() => setExpanded((x) => [...x, m.id])} className="font-bold text-brand">
                        Read more
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 text-right text-[11px] text-ink-soft">
                    {m.time}
                    {mine && (
                      <span className={cx("ml-1 font-bold", sending ? "text-ink-soft" : "text-brand")} aria-label={sending ? "Sent" : "Delivered"}>
                        {sending ? "✓" : "✓✓"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={sendChat} className={cx("relative flex items-center gap-2 bg-canvas px-2.5 py-2.5", P && "sticky bottom-0")}>
          {actionsOpen && (
            <div className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl border border-line bg-white p-4 shadow-frame" role="menu" aria-label="Chat actions">
              <div className="grid grid-cols-4 gap-y-4">
                {tiles
                  .filter((t) => t.show)
                  .map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsOpen(false);
                        t.run();
                      }}
                      className="flex flex-col items-center gap-1.5 text-[12px] font-semibold text-ink"
                    >
                      <span className={cx("flex h-12 w-12 items-center justify-center rounded-full text-white", t.color)}>{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <div className="flex h-11 flex-1 items-center rounded-full border border-line bg-white pl-4 pr-1.5">
            <input aria-label="Message" placeholder="Message" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onFocus={() => setActionsOpen(false)} className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-soft focus:outline-none" />
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((v) => !v)}
              className={cx("flex h-8 w-8 items-center justify-center rounded-full", actionsOpen ? "bg-sage text-brand" : "text-ink-muted hover:bg-canvas")}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
          <button type="submit" aria-label="Send" disabled={!chatInput.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:bg-slate-300">
            <Send className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>
    );
  };

  const renderAssistant = () => {
    const starters = ["I've had a headache for 3 days", "Diet tips for high BP", "Which doctor for knee pain?", "Mujhe neend nahi aati"];
    return (
      <div className={cx("flex flex-col", P ? "-mx-4 -my-4 flex-1" : "mx-auto min-h-[calc(100vh-110px)] max-w-3xl overflow-hidden rounded-2xl border border-line")}>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-white px-2 py-2">
          <button type="button" onClick={back} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-canvas">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6B5BA8] to-brand text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-ink">CuraPulse Assistant</p>
            <p className="truncate text-[12.5px] text-ink-muted">{aiBusy ? "thinking…" : "AI guidance · not a doctor"}</p>
          </div>
        </div>
        <div className="flex-1 space-y-2 bg-[#EEEBF6] px-3 py-3" aria-live="polite">
          <div className="mx-auto max-w-[92%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
            AI suggestions only. It can't diagnose or prescribe (Telemedicine Practice Guidelines 2020). Don't share Aadhaar, phone or address. Chats stay on this device and aren't saved. Emergency? Press SOS or call 108.
          </div>
          {aiMsgs.length === 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-center text-[13.5px] text-ink-muted">Try asking</p>
              <div className="flex flex-wrap justify-center gap-2">
                {starters.map((q) => (
                  <button key={q} type="button" onClick={() => void askAssistant(undefined, q)} className="rounded-full border border-lav-line bg-white px-3 py-1.5 text-[13.5px] font-semibold text-lav-ink hover:bg-lav/40">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {aiMsgs.map((m) => (
            <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] rounded-xl px-3 py-2 text-[14.5px] leading-snug text-ink shadow-[0_1px_1px_rgba(0,0,0,0.06)]", m.role === "user" ? "rounded-tr-sm bg-[#CDEBE1]" : m.emergency ? "rounded-tl-sm border border-coral/40 bg-[#FDECEA]" : "rounded-tl-sm bg-white")}>
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.emergency && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="emergency" icon={<Siren className="h-4 w-4" />} onClick={() => go("sos")}>
                      SOS
                    </Button>
                    <a href="tel:108" className="inline-flex h-9 items-center rounded-xl border border-coral px-3 text-[13.5px] font-semibold text-coral">
                      Call 108
                    </a>
                  </div>
                )}
                {!!m.suggestions?.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((sg) => (
                      <button key={sg.label} type="button" onClick={() => runAiAction(sg)} className="rounded-full bg-sage px-2.5 py-1 text-[12.5px] font-semibold text-sage-ink hover:bg-sage/70">
                        {sg.label} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {aiBusy && (
            <div className="flex justify-start">
              <div className="rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[14px] text-ink-muted">Thinking…</div>
            </div>
          )}
          <div ref={aiEndRef} />
        </div>
        <form onSubmit={(e) => void askAssistant(e)} className={cx("flex items-center gap-2 bg-canvas px-2.5 py-2.5", P && "sticky bottom-0")}>
          <input
            aria-label="Ask the assistant"
            placeholder="Ask about symptoms, diet, which doctor…"
            value={aiInput}
            maxLength={1000}
            onChange={(e) => setAiInput(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[15px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none"
          />
          <button type="submit" aria-label="Ask" disabled={!aiInput.trim() || aiBusy} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:bg-ink-soft/40">
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    );
  };

  const renderRx = () => (
    <div className="space-y-4">
      <ScreenHeader title="Pharmacies near you" sub="Stock reported by govt-verified stores." onBack={back} />
      <Card className="p-4">
        <CardHeader title="Your prescription" sub="Signed by Dr. Sunita Sharma" right={<FileText className="h-5 w-5 text-brand" />} />
        <ul className="space-y-1.5 text-[14px]">
          {RX_ITEMS.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-2">
              <span className="text-ink">{r.name}</span>
              {r.kind === "critical" && <Badge tone="warn">Keep with you</Badge>}
            </li>
          ))}
        </ul>
      </Card>
      <div className={cx("grid gap-3", grid2)}>
        {[...PHARMACIES]
          .sort((a, b) => a.km - b.km)
          .map((ph) => {
            const allIn = ph.out.length === 0;
            const st = reserve?.id === ph.id ? reserve.status : null;
            return (
              <Card key={ph.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-bold text-ink">{ph.name}</p>
                    <p className="text-[13px] text-ink-muted">
                      {ph.km} km · {ph.night ? "Open 24 hours" : "Open till 10 PM"}
                    </p>
                  </div>
                  {ph.govtVerified ? (
                    <Badge tone="ok" icon={<ShieldCheck className="h-3 w-3" />}>
                      Govt verified
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Not verified</Badge>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-[13.5px]">
                  {RX_ITEMS.map((r) => {
                    const out = ph.out.includes(r.name);
                    return (
                      <li key={r.name} className="flex items-center justify-between gap-2">
                        <span className="truncate text-ink">{r.name}</span>
                        <Badge tone={out ? "warn" : "ok"}>{out ? "Out of stock" : "In stock"}</Badge>
                      </li>
                    );
                  })}
                </ul>
                {st && (
                  <div className="mt-3">
                    <Badge tone={st === "confirmed" ? "ok" : "info"}>{st === "confirmed" ? "Confirmed by pharmacy (demo)" : "Pending pharmacy confirmation"}</Badge>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <LinkButton size="sm" variant="quiet" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ph.name)}`} target="_blank" rel="noreferrer" icon={<Navigation className="h-4 w-4" />}>
                    Directions
                  </LinkButton>
                  <LinkButton size="sm" variant="quiet" href={`tel:${ph.phone}`} icon={<Phone className="h-4 w-4" />}>
                    Call
                  </LinkButton>
                  <Button size="sm" variant={allIn ? "primary" : "secondary"} disabled={!!st} onClick={() => reservePharmacy(ph.id, ph.name)}>
                    {st ? "Sent" : "Send here"}
                  </Button>
                </div>
              </Card>
            );
          })}
      </div>
    </div>
  );

  const renderVitals = () => {
    const labels = vitals.map((v) => v.label);
    const conf = {
      bp: { series: [{ name: "Systolic", values: vitals.map((v) => v.sys) }, { name: "Diastolic", values: vitals.map((v) => v.dia), dashed: true, marker: "square" as const }], min: 60, max: 170, target: { from: 90, to: 130, label: "Target" }, unit: "mmHg" },
      pulse: { series: [{ name: "Pulse", values: vitals.map((v) => v.pulse) }], min: 40, max: 130, target: { from: 60, to: 100, label: "Normal" }, unit: "bpm" },
      sugar: { series: [{ name: "Glucose", values: vitals.map((v) => v.glucose) }], min: 60, max: 200, target: { from: 70, to: 140, label: "Target" }, unit: "mg/dL" },
    }[vMetric];
    const highBp = latest.sys >= 140 || latest.dia >= 90;
    const prev = vitals.length > 1 ? vitals[vitals.length - 2] : null;
    const delta = (now: number, before: number | undefined, unit: string) => {
      if (before == null) return "First test on record";
      const d = now - before;
      if (d === 0) return `No change since ${prev?.label}`;
      return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} ${unit} since ${prev?.label}`;
    };
    const sugarHigh = latest.sugarType === "Fasting" || !latest.sugarType ? latest.glucose >= 100 : latest.glucose >= 140;
    return (
      <div className="space-y-4">
        <ScreenHeader
          title="Last test results"
          sub={`Most recent check: ${latest.label}${latest.source ? ` · ${latest.source}` : ""}. Your doctor sees these when you share records.`}
          right={
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setLogOpen(true)}>
              Add test
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-2.5">
          {(
            [
              ["Blood pressure", `${latest.sys}/${latest.dia}`, "mmHg", highBp, highBp ? "Above the 130/80 target" : "Within target", delta(latest.sys, prev?.sys, "systolic")],
              ["Pulse", `${latest.pulse}`, "bpm", latest.pulse > 100 || latest.pulse < 50, latest.pulse > 100 ? "Faster than usual" : latest.pulse < 50 ? "Slower than usual" : "Normal resting range", delta(latest.pulse, prev?.pulse, "bpm")],
              [
                `${latest.sugarType ?? "Fasting"} sugar`,
                `${latest.glucose}`,
                "mg/dL",
                sugarHigh,
                sugarHigh ? (latest.glucose >= 126 && (latest.sugarType ?? "Fasting") === "Fasting" ? "High: discuss with your doctor" : "A little above normal") : "Normal",
                delta(latest.glucose, prev?.glucose, "mg/dL"),
              ],
            ] as [string, string, string, boolean, string, string][]
          ).map(([l, v, u, warn, note, change]) => (
            <Card key={l} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-ink-muted">{l}</p>
                <p className="tabular text-[22px] font-bold leading-tight text-ink">
                  {v} <span className="text-[13px] font-semibold text-ink-soft">{u}</span>
                </p>
                <p className="text-[12.5px] text-ink-muted">{change}</p>
              </div>
              <Badge tone={warn ? "warn" : "ok"}>{note}</Badge>
            </Card>
          ))}
        </div>
        <Card className="p-4">
          <CardHeader title="Trend across your tests" sub={`${vitals.length} tests from ${vitals[0].label} to ${latest.label}`} />
          <Segmented
            value={vMetric}
            onChange={(v) => setVMetric(v as "bp" | "pulse" | "sugar")}
            options={[
              { value: "bp", label: "BP" },
              { value: "pulse", label: "Pulse" },
              { value: "sugar", label: "Sugar" },
            ]}
          />
          <div className="mt-4">
            <LineChart labels={labels} series={conf.series} min={conf.min} max={conf.max} target={conf.target} unit={conf.unit} height={P ? 170 : 220} showValues />
          </div>
          <p className="mt-2 text-[12.5px] text-ink-muted">Each point is one test. The shaded band is the healthy range.</p>
        </Card>
        <Card className="p-4">
          <CardHeader title="Test history" />
          <ul className="divide-y divide-line text-[14px]">
            {[...vitals].reverse().map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{v.label}</span>
                  <span className="text-[12.5px] text-ink-muted">{v.source ?? "Home"} test</span>
                </span>
                <span className="tabular text-right text-[13.5px] text-ink">
                  BP {v.sys}/{v.dia} · {v.pulse} bpm
                  <br />
                  <span className="text-ink-muted">
                    {v.sugarType ?? "Fasting"} sugar {v.glucose}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  };

  const renderRecords = () => (
    <div className="space-y-4">
      <ScreenHeader title="Records" sub="You decide who sees your history, and for how long." />
      {recordConsent === "granted" ? (
        <Card tone="sage" className="p-4">
          <div className="flex items-start gap-3">
            <Unlock className="mt-0.5 h-5 w-5 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-ink">Shared with {sharedWith || "your doctor"}</p>
              <p className="tabular text-[13.5px] text-sage-ink">Access ends in {expiryText()}</p>
            </div>
          </div>
          <Button className="mt-3" full variant="quiet" onClick={revokeRecords}>
            Stop sharing now
          </Button>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-ink-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-ink">Not shared with anyone</p>
              <p className="text-[13.5px] text-ink-muted">{recordConsent === "revoked" ? "You stopped sharing." : recordConsent === "denied" ? "You declined the last request." : "Doctors only see your snapshot."}</p>
            </div>
          </div>
          <Button className="mt-3" full icon={<Unlock className="h-4 w-4" />} onClick={() => go("share")}>
            Share records with a doctor
          </Button>
        </Card>
      )}
      <RowButton icon={<ClipboardList className="h-5 w-5" />} title="Emergency Health Snapshot" sub={savedAt ? `Saved on this device · ${savedAt}` : "Saved on this device"} onClick={() => go("snapshot")} />
      <Card className="p-4">
        <CardHeader title="Past visits" right={recordConsent === "granted" ? <Badge tone="ok">Shared</Badge> : <Badge tone="neutral" icon={<Lock className="h-3 w-3" />}>Private</Badge>} />
        <ul className="divide-y divide-line">
          {PAST_VISITS.map((v) => (
            <li key={v.date} className="flex items-start justify-between gap-3 py-2.5 text-[14px]">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{v.reason}</p>
                <p className="text-ink-muted">
                  {v.doctor} · {v.date}
                </p>
              </div>
              <span className="shrink-0 text-[13px] text-ink-muted">{v.outcome}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card tone="lav" className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[15px] font-bold text-ink">Help medical research</p>
          <p className="text-[13px] text-lav-ink">Share anonymised readings. Your name is never included.</p>
        </div>
        <Toggle on={profile.researchOptIn} onChange={() => setProfile((p) => ({ ...p, researchOptIn: !p.researchOptIn }))} label="Research opt-in" />
      </Card>
    </div>
  );

  const renderShare = () => (
    <div className="space-y-4">
      <ScreenHeader title="Share records" sub="Pick what to share, with whom, and for how long." onBack={back} />
      <Card className="space-y-2.5 p-4">
        <Eyebrow>What to share</Eyebrow>
        {SHARE_ITEMS.map((it) => (
          <Checkbox key={it} checked={shareItems.includes(it)} onChange={() => setShareItems((x) => toggleIn(x, it))}>
            {it}
          </Checkbox>
        ))}
      </Card>
      <Field label="Doctor" htmlFor="share-doc">
        <select id="share-doc" value={shareDocId} onChange={(e) => setShareDocId(e.target.value)} className={inputCls}>
          {DOCTORS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.specialty}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <p className="mb-2 text-[14px] font-semibold text-ink">For how long</p>
        <Segmented
          value={shareDur}
          onChange={(v) => setShareDur(v as ShareDuration)}
          options={[
            { value: "1h", label: "1 hour" },
            { value: "24h", label: "24 hours" },
            { value: "7d", label: "7 days" },
          ]}
        />
      </div>
      <Button
        full
        disabled={!shareItems.length}
        onClick={() => {
          const d = DOCTORS.find((x) => x.id === shareDocId);
          chatIdRef.current = shareDocId;
          grantRecords(d?.name, SHARE_DURATIONS[shareDur]);
          showToast(`Shared with ${d?.name ?? "doctor"} for ${shareDur === "7d" ? "7 days" : shareDur === "1h" ? "1 hour" : "24 hours"}`, "ok");
          back();
        }}
      >
        Share {shareItems.length} item{shareItems.length === 1 ? "" : "s"}
      </Button>
      <p className="text-center text-[12.5px] text-ink-soft">Access ends automatically. You can stop it earlier any time.</p>
    </div>
  );

  const renderSnapshot = () => (
    <div className="space-y-4">
      <ScreenHeader title="Emergency Health Snapshot" sub={savedAt ? `Saved on this device · ${savedAt}` : "Saved on this device"} onBack={back} />
      {renderSnapshotCard()}
      <Alert tone="info" title="Works offline">
        Emergency staff see this when you start SOS, even without network on your phone.
      </Alert>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<UserRound className="h-4 w-4" />} onClick={editSnapshot}>
          Edit
        </Button>
        <Button variant="quiet" onClick={resetPassport}>
          Clear from device
        </Button>
      </div>
    </div>
  );

  const renderScreen = () => {
    switch (screen) {
      case "home":
        return renderHome();
      case "symptom":
        return renderSymptom();
      case "symptomResult":
        return renderSymptomResult();
      case "sos":
        return renderSos();
      case "sosCountdown":
        return renderSosCountdown();
      case "sosStatus":
        return renderSosStatus();
      case "care":
        return renderCare();
      case "book":
        return renderBook();
      case "confirmed":
        return renderConfirmed();
      case "chats":
        return renderChats();
      case "chat":
        return renderChat();
      case "assistant":
        return renderAssistant();
      case "rx":
        return renderRx();
      case "vitals":
        return renderVitals();
      case "records":
        return renderRecords();
      case "share":
        return renderShare();
      case "snapshot":
        return renderSnapshot();
      default:
        return renderHome();
    }
  };

  // ==========================================================================
  // OVERLAY: log vitals sheet + toast
  // ==========================================================================
  const overlay = (
    <>
      {mounted && onboarded && !["assistant", "chat", "sos", "sosCountdown", "sosStatus"].includes(screen) && (
        <button
          type="button"
          aria-label="Ask CuraPulse Assistant"
          title="Ask CuraPulse Assistant"
          onClick={() => go("assistant")}
          className={cx("cp-ai-fab group z-40 flex h-14 w-14 items-center justify-center", P ? "absolute bottom-[84px] right-4" : "fixed bottom-6 right-6")}
        >
          <span aria-hidden className="cp-ai-ring absolute inset-0 rounded-full bg-brand/40" />
          <span aria-hidden className="cp-ai-ring r2 absolute inset-0 rounded-full bg-brand/30" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[#4B4E9E] text-white shadow-lg ring-2 ring-white transition-transform group-hover:scale-105">
            <Sparkles className="cp-ai-star h-6 w-6" />
          </span>
        </button>
      )}
      {logOpen && (
        <div className={cx("flex bg-ink/40", P ? "absolute inset-0 items-end" : "fixed inset-0 items-center justify-center")} onClick={() => setLogOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Log a reading"
            onClick={(e) => e.stopPropagation()}
            className={cx("w-full bg-white p-5 shadow-frame", P ? "rounded-t-3xl" : "max-w-md rounded-2xl")}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[19px] font-bold text-ink">Add a test result</h2>
              <button type="button" aria-label="Close" onClick={() => setLogOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-canvas">
                <X className="h-5 w-5" />
              </button>
            </div>
            {vitalsError && (
              <Alert tone="crit" className="mb-3">
                {vitalsError}
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Systolic (mmHg)", vSys, setVSys],
                  ["Diastolic (mmHg)", vDia, setVDia],
                  ["Pulse (bpm)", vPulse, setVPulse],
                  ["Sugar (mg/dL)", vGlu, setVGlu],
                ] as [string, string, (v: string) => void][]
              ).map(([l, v, set]) => (
                <Field key={l} label={l} htmlFor={`v-${l}`}>
                  <input id={`v-${l}`} inputMode="numeric" value={v} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))} className={cx(inputCls, "tabular")} />
                </Field>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Test date" htmlFor="v-date">
                <input id="v-date" type="date" value={vDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setVDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Sugar test" htmlFor="v-sugar-type">
                <select id="v-sugar-type" value={vSugarType} onChange={(e) => setVSugarType(e.target.value as typeof vSugarType)} className={inputCls}>
                  <option>Fasting</option>
                  <option>After meal</option>
                  <option>Random</option>
                </select>
              </Field>
            </div>
            <p className="mb-1.5 mt-3 text-[14px] font-semibold text-ink">Measured at</p>
            <div className="flex gap-2">
              {(["Home", "Clinic", "Lab"] as const).map((src) => (
                <ChoiceChip key={src} on={vSource === src} onClick={() => setVSource(src)}>
                  {src}
                </ChoiceChip>
              ))}
            </div>
            <Button className="mt-4" full onClick={logVitals}>
              Save test result
            </Button>
          </div>
        </div>
      )}
      {toast && (
        <div className={cx("left-3 right-3 flex justify-center", P ? "absolute bottom-20" : "fixed bottom-6 left-auto right-6 max-w-sm")}>
          <div className="w-full">
            <Toast msg={toast.msg} tone={toast.tone === "danger" ? "crit" : toast.tone} onClose={() => setToast(null)} />
          </div>
        </div>
      )}
      {sideMenuOpen && (
        <div
          className={cx(
            "flex bg-ink/50 backdrop-blur-sm transition-opacity duration-200",
            P ? "absolute inset-0 z-50 justify-start" : "fixed inset-0 z-[80] justify-start"
          )}
          onClick={() => setSideMenuOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
            onClick={(e) => e.stopPropagation()}
            className={cx(
              "flex h-full w-[310px] max-w-[85vw] flex-col bg-white shadow-2xl animate-in slide-in-from-left duration-200 border-r border-line",
              P ? "rounded-r-3xl overflow-hidden" : ""
            )}
          >
            {/* Drawer Header */}
            <div
              className="border-b border-line p-5 text-white"
              style={{ background: "linear-gradient(135deg, #132E27, #176B63)", color: "#ffffff" }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-[16px] font-bold text-white backdrop-blur ring-2 ring-white/20">
                    {initialsOf(profile.name || "Aarohi Deshmukh")}
                  </span>
                  <div>
                    <p className="text-[12px] font-medium text-sage">Patient Portal</p>
                    <h3 className="text-[17px] font-bold text-white leading-tight">
                      Hi, {profile.name || "Aarohi Deshmukh"}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSideMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Logout button directly below the name */}
              <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-sage">
                  <span className="rounded bg-white/15 px-1.5 py-0.5 font-bold text-white">Blood {profile.bloodGroup || "B+"}</span>
                  <span>{profile.age ? `${profile.age} yrs` : "24 yrs"}</span>
                </div>
                <Link
                  href="/login"
                  onClick={() => {
                    setSideMenuOpen(false);
                    setOnboarded(false);
                    setObStep(1);
                    try {
                      window.localStorage.removeItem(PASSPORT_KEY);
                    } catch {}
                    signOut();
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25 transition active:scale-95"
                >
                  <LogOut className="h-3 w-3" />
                  Log out
                </Link>
              </div>
            </div>

            {/* Drawer Navigation Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Navigation</p>
              
              <button
                type="button"
                onClick={() => { goTab("home"); setSideMenuOpen(false); }}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition", TAB_OF[screen] === "home" ? "bg-sage text-sage-ink font-bold" : "text-ink hover:bg-canvas")}
              >
                <HeartPulse className="h-5 w-5 text-brand" />
                <span className="flex-1">Home</span>
              </button>

              <button
                type="button"
                onClick={() => { goTab("chats"); setSideMenuOpen(false); }}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition", TAB_OF[screen] === "chats" ? "bg-sage text-sage-ink font-bold" : "text-ink hover:bg-canvas")}
              >
                <MessageCircle className="h-5 w-5 text-brand" />
                <span className="flex-1">Chats</span>
                <span className="rounded-full bg-coral px-1.5 py-0.2 text-[10px] font-bold text-white">1</span>
              </button>

              <button
                type="button"
                onClick={() => { goTab("care"); setSideMenuOpen(false); }}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition", TAB_OF[screen] === "care" ? "bg-sage text-sage-ink font-bold" : "text-ink hover:bg-canvas")}
              >
                <Search className="h-5 w-5 text-brand" />
                <span className="flex-1">Find care</span>
              </button>

              <button
                type="button"
                onClick={() => { goTab("vitals"); setSideMenuOpen(false); }}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition", TAB_OF[screen] === "vitals" ? "bg-sage text-sage-ink font-bold" : "text-ink hover:bg-canvas")}
              >
                <Activity className="h-5 w-5 text-brand" />
                <span className="flex-1">Vitals</span>
              </button>

              <button
                type="button"
                onClick={() => { goTab("records"); setSideMenuOpen(false); }}
                className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition", TAB_OF[screen] === "records" ? "bg-sage text-sage-ink font-bold" : "text-ink hover:bg-canvas")}
              >
                <ClipboardList className="h-5 w-5 text-brand" />
                <span className="flex-1">Records</span>
              </button>

              <p className="px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">Quick Access</p>

              <button
                type="button"
                onClick={() => { go("snapshot"); setSideMenuOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:bg-canvas transition"
              >
                <ShieldCheck className="h-4.5 w-4.5 text-brand" />
                <span className="flex-1">Emergency Health Passport</span>
              </button>

              <button
                type="button"
                onClick={() => { go("rx"); setSideMenuOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:bg-canvas transition"
              >
                <Pill className="h-4.5 w-4.5 text-brand" />
                <span className="flex-1">Pharmacy & Critical Meds</span>
              </button>

              <button
                type="button"
                onClick={() => { go("symptom"); setSideMenuOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:bg-canvas transition"
              >
                <Stethoscope className="h-4.5 w-4.5 text-brand" />
                <span className="flex-1">Symptom Checker (AI)</span>
              </button>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => { go("sos"); setSideMenuOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-xl bg-coral/10 border border-coral/30 px-3 py-2.5 text-left text-[13.5px] font-bold text-coral-dark hover:bg-coral/20 transition"
                >
                  <Siren className="h-4.5 w-4.5 text-coral" />
                  <span className="flex-1">Emergency SOS</span>
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-line bg-canvas p-3 text-[11px] text-ink-muted">
              <p className="font-semibold text-ink">CuraPulse v2.4 · Team HAVOC</p>
              <p>DTU Campus Safe Zone · 24/7 Dispatch</p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const topHeader = (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/95 px-3.5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setSideMenuOpen(true)}
          aria-label="Open side menu"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-sm hover:border-brand/40 hover:bg-sage/40 transition active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        {online ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            Offline
          </span>
        )}
        <button
          type="button"
          onClick={() => go("sos")}
          aria-label="Emergency SOS"
          className="flex h-8 items-center gap-1 rounded-full bg-coral px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-coral-dark active:scale-95 transition"
        >
          <Siren className="h-3.5 w-3.5" />
          SOS
        </button>
      </div>
    </header>
  );

  const nav = [
    { key: "home", label: "Home", icon: HeartPulse },
    { key: "chats", label: "Chats", icon: MessageCircle, badge: threadIds.reduce((n, id) => n + unreadOf(id), 0) || undefined },
    { key: "care", label: "Find care", icon: Search },
    { key: "vitals", label: "Vitals", icon: Activity },
    { key: "records", label: "Records", icon: ClipboardList },
  ];

  return (
    <Shell
      requireRole="patient"
      view={view}
      product="Patient app"
      nav={nav}
      active={TAB_OF[screen]}
      onNav={goTab}
      user={onboarded ? { name: profile.name || "Patient", sub: `Blood ${profile.bloodGroup || "—"}`, initials: initialsOf(profile.name) } : undefined}
      hideTabs={!mounted || !onboarded || screen === "sosCountdown"}
      overlay={overlay}
      topHeader={mounted && onboarded && screen !== "sosCountdown" ? topHeader : undefined}
    >
      {!mounted ? (
        <div className={cx("space-y-3", P ? "p-4" : "")}>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !onboarded ? (
        renderOnboarding()
      ) : (
        <div className={cx(P ? "min-h-full px-4 py-4" : "mx-auto max-w-5xl", P && (screen === "chat" || screen === "assistant") && "flex flex-col")}>{renderScreen()}</div>
      )}
    </Shell>
  );
}
