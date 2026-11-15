"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ambulance,
  ArrowLeft,
  BadgeCheck,
  ClipboardList,
  MessageCircle,
  Hospital,
  MapPin,
  PhoneCall,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Siren,
  Volume2,
  VolumeX,
} from "lucide-react";
import { supabase as sharedSupabase } from "@/lib/supabase";
import { Shell, useViewState } from "@/components/Shell";
import { LiveChatInbox } from "@/components/LiveChatInbox";
import { Alert, Avatar, Badge, Button, Card, CardHeader, ChoiceChip, Eyebrow, LinkButton, PageTitle, Timeline, cx } from "@/components/ui";

const supabase = sharedSupabase;

type SupView = "incidents" | "chats" | "dispatch" | "verify" | "log";


// ============================================================================
// DISPATCH GEOGRAPHY (North-West Delhi around DTU)
// ============================================================================
const TRAUMA_CENTERS = [
  { name: "Dr. Baba Saheb Ambedkar Hospital (Rohini)", lat: 28.7125, lng: 77.1146, level: "Level-II Trauma" },
  { name: "Max Super Speciality, Shalimar Bagh", lat: 28.7187, lng: 77.1648, level: "24/7 Cardiac ER" },
  { name: "Sanjay Gandhi Memorial Hospital", lat: 28.6915, lng: 77.0662, level: "Level-II Trauma" },
  { name: "Sri Guru Tegh Bahadur Hospital", lat: 28.6834, lng: 77.3103, level: "Level-I Trauma" },
  { name: "AIIMS JPN Apex Trauma Centre", lat: 28.5672, lng: 77.2059, level: "Level-I Trauma" },
];

const AMBULANCE_FLEET = [
  { id: "DL-EMS-108-14", base: "DTU Bawana Road post", lat: 28.7512, lng: 77.1102, type: "ALS (Advanced Life Support)" },
  { id: "DL-EMS-108-22", base: "Rohini Sector 16", lat: 28.7363, lng: 77.1259, type: "ALS (Advanced Life Support)" },
  { id: "DL-CATS-31", base: "Shalimar Bagh CATS", lat: 28.7166, lng: 77.1601, type: "BLS (Basic Life Support)" },
  { id: "DL-CATS-47", base: "Pitampura CATS", lat: 28.6989, lng: 77.1385, type: "BLS (Basic Life Support)" },
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Road distance is ~1.35x straight-line in Delhi; ambulance average 28 km/h with siren, +2 min turnout.
function etaMinutes(km: number): number {
  return Math.max(3, Math.round(((km * 1.35) / 28) * 60 + 2));
}

function nearestTrauma(lat: number, lng: number) {
  return TRAUMA_CENTERS.map((t) => ({ ...t, km: haversineKm(lat, lng, t.lat, t.lng) })).sort((a, b) => a.km - b.km)[0];
}

function rankFleet(lat: number, lng: number) {
  return AMBULANCE_FLEET.map((u) => ({ ...u, km: haversineKm(lat, lng, u.lat, u.lng) })).sort((a, b) => a.km - b.km);
}

const AGENT_ID = "#CP-OPS-904";

// ============================================================================
// TYPES
// ============================================================================
type UrgencyTag = "LOW" | "MEDIUM" | "CRITICAL";
type PreIntakeState = "IDLE" | "TRANSMITTING" | "CONFIRMED";
type DoctorStatus = "PENDING" | "VERIFIED_ACTIVE" | "MORE_INFO" | "REJECTED";
type ActiveTab = "INCIDENTS" | "DOCTORS";

interface SosIncident {
  id: string;
  patient_name: string;
  patient_phone: string;
  created_at: string;
  status: "ACTIVE" | "RESOLVED";
  blood_group: string;
  allergies: string[];
  chronic_conditions: string[];
  latitude: number;
  longitude: number;
  urgency_tag: UrgencyTag;
  safety_advisory: string;
  symptoms: string;
  notes: string[];
  ambulance_dispatched: boolean;
  ambulance_unit?: string;
  ambulance_dispatched_at?: string;
  pre_intake_state: PreIntakeState;
  pre_intake_transmitted_at?: string;
  first_action_at?: string;
}

interface DoctorApplicant {
  id: string;
  full_name: string;
  nmc_registration_id: string;
  specialty: string;
  hospital_affiliation: string;
  state_medical_council: string;
  submitted_at: string;
  verification_status: DoctorStatus;
  decided_at?: string;
  degree?: string;
  experience_years?: number;
  contact?: string;
  documents?: string[];
  notes?: string;
  ai_review?: {
    verdict: string;
    document_type: string;
    extracted: Record<string, string>;
    issues: string[];
    source: string;
  } | null;
}

const mapApplicant = (a: Record<string, unknown>): DoctorApplicant => ({
  id: String(a.id ?? `APP-${Math.random().toString(36).slice(2, 8)}`),
  full_name: String(a.full_name ?? "New applicant"),
  nmc_registration_id: String(a.nmc_registration_id ?? "Not provided"),
  specialty: String(a.specialty ?? "General Medicine"),
  hospital_affiliation: String(a.hospital_affiliation ?? "Not provided"),
  state_medical_council: String(a.state_medical_council ?? "State Medical Council"),
  submitted_at: String(a.submitted_at ?? new Date().toISOString()),
  verification_status:
    a.verification_status === "VERIFIED_ACTIVE" || a.verification_status === "REJECTED" || a.verification_status === "MORE_INFO" ? (a.verification_status as DoctorStatus) : "PENDING",
  decided_at: a.decided_at ? String(a.decided_at) : undefined,
  degree: a.degree ? String(a.degree) : undefined,
  experience_years: typeof a.experience_years === "number" ? a.experience_years : undefined,
  contact: String(a.email || a.phone || "") || undefined,
  documents: Array.isArray(a.documents) ? (a.documents as unknown[]).map(String) : undefined,
  notes: a.notes ? String(a.notes) : undefined,
  ai_review: (a.ai_review as DoctorApplicant["ai_review"]) ?? null,
});

// ============================================================================
// STATIC LOOKUPS (full class strings so Tailwind can detect them)
// ============================================================================
function buildSeedIncidents(): SosIncident[] {
  const now = Date.now();
  return [
    {
      id: "SOS-8841-DEL",
      patient_name: "Aarav Sharma",
      patient_phone: "+919811223344",
      created_at: new Date(now - 1000 * 14).toISOString(),
      status: "ACTIVE",
      blood_group: "O-",
      allergies: ["Penicillin", "Ibuprofen (NSAIDs)", "Sulfa Drugs"],
      chronic_conditions: ["Bronchial Asthma", "Peptic Ulcer"],
      latitude: 28.7499,
      longitude: 77.1175,
      urgency_tag: "CRITICAL",
      symptoms:
        "Sudden tightness across the chest, shortness of breath and cold sweat after climbing stairs.",
      safety_advisory:
        "Keep the patient seated upright and calm. Do NOT give Aspirin or Ibuprofen: documented Bronchial Asthma, Peptic Ulcer and NSAID allergy.",
      notes: [
        "SOS packet received via CuraPulse Mobile Telemetry.",
        "GPS locked within 4 m accuracy (Rohini Sector 17, New Delhi).",
      ],
      ambulance_dispatched: false,
      pre_intake_state: "IDLE",
    },
    {
      id: "SOS-8842-DEL",
      patient_name: "Meera Nair",
      patient_phone: "+919876501234",
      created_at: new Date(now - 1000 * 31).toISOString(),
      status: "ACTIVE",
      blood_group: "B+",
      allergies: ["Latex", "Codeine"],
      chronic_conditions: ["Type 1 Diabetes", "Hypertension"],
      latitude: 28.6139,
      longitude: 77.209,
      urgency_tag: "MEDIUM",
      symptoms:
        "Dizziness, tremor and blurred vision. Possible low blood sugar episode.",
      safety_advisory:
        "Keep the patient seated and talking. If fully awake and able to swallow, a sugary drink or glucose tablet is reasonable. Call SOS if drowsiness increases.",
      notes: ["Emergency contact notified automatically via SMS gateway."],
      ambulance_dispatched: false,
      pre_intake_state: "IDLE",
    },
  ];
}

const SIMULATED_PATIENTS: Array<
  Omit<SosIncident, "id" | "created_at" | "notes">
> = [
  {
    patient_name: "Rohan Verma",
    patient_phone: "+919717008899",
    status: "ACTIVE",
    blood_group: "AB-",
    allergies: ["Aspirin (NSAIDs)", "Shellfish"],
    chronic_conditions: ["Severe Asthma", "Arrhythmia"],
    latitude: 28.6304,
    longitude: 77.2177,
    urgency_tag: "CRITICAL",
    symptoms:
      "Sudden chest pressure with numbness spreading down the left arm near Connaught Place.",
    safety_advisory:
      "Immediate ambulance dispatch needed. Do NOT give Aspirin or any NSAID: Severe Asthma and documented Aspirin allergy.",
    ambulance_dispatched: false,
    pre_intake_state: "IDLE",
  },
  {
    patient_name: "Kavya Iyer",
    patient_phone: "+919810554433",
    status: "ACTIVE",
    blood_group: "A+",
    allergies: ["Peanuts", "Bee Venom"],
    chronic_conditions: ["Anaphylaxis History"],
    latitude: 28.5355,
    longitude: 77.391,
    urgency_tag: "CRITICAL",
    symptoms:
      "Throat swelling and difficulty breathing after a suspected insect sting in Noida Sector 62.",
    safety_advisory:
      "Keep the patient upright, use their prescribed auto-injector if they carry one, and stay on the line. Ambulance needed immediately.",
    ambulance_dispatched: false,
    pre_intake_state: "IDLE",
  },
  {
    patient_name: "Sandeep Kulkarni",
    patient_phone: "+919899112200",
    status: "ACTIVE",
    blood_group: "O+",
    allergies: ["None Reported"],
    chronic_conditions: ["Gastritis"],
    latitude: 28.4595,
    longitude: 77.0266,
    urgency_tag: "LOW",
    symptoms: "Persistent stomach ache and nausea since the morning in Gurugram.",
    safety_advisory:
      "Rest and sip water. Avoid NSAIDs such as Ibuprofen because of gastritis history. Escalate if the pain turns severe.",
    ambulance_dispatched: false,
    pre_intake_state: "IDLE",
  },
];

const INITIAL_DOCTORS: DoctorApplicant[] = [
  {
    id: "DOC-APP-101",
    full_name: "Dr. Vikramaditya Menon, MD (Emergency Medicine)",
    nmc_registration_id: "NMC-DL-2018-0094821",
    specialty: "Emergency & Critical Care",
    hospital_affiliation: "Max Super Speciality Hospital, Saket",
    state_medical_council: "Delhi Medical Council (DMC)",
    submitted_at: "14 mins ago",
    verification_status: "PENDING",
  },
  {
    id: "DOC-APP-102",
    full_name: "Dr. Ananya Sen, MBBS, DNB (Cardiology)",
    nmc_registration_id: "NMC-MH-2020-0117309",
    specialty: "Interventional Cardiology",
    hospital_affiliation: "Fortis Escorts Heart Institute",
    state_medical_council: "Maharashtra Medical Council (MMC)",
    submitted_at: "38 mins ago",
    verification_status: "PENDING",
  },
];

// ============================================================================
// HELPERS
// ============================================================================
function parseStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const cleaned = value.map((v) => String(v).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : fallback;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const cleaned = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : fallback;
  }
  return fallback;
}

function normalizeIncidentRow(
  raw: Record<string, unknown>,
  existing?: SosIncident
): SosIncident {
  const lat = Number(raw.latitude);
  const lng = Number(raw.longitude);
  const rawUrgency = String(raw.urgency_tag ?? "CRITICAL").toUpperCase();
  const urgency_tag: UrgencyTag =
    rawUrgency === "LOW" || rawUrgency === "MEDIUM" || rawUrgency === "CRITICAL"
      ? rawUrgency
      : "CRITICAL";

  const rawPreIntake = String(raw.pre_intake_state ?? "").toUpperCase();
  const pre_intake_state: PreIntakeState =
    rawPreIntake === "CONFIRMED" || rawPreIntake === "TRANSMITTING"
      ? rawPreIntake
      : existing?.pre_intake_state ?? "IDLE";

  return {
    id: String(raw.id ?? existing?.id ?? `SOS-${Date.now()}`),
    patient_name: String(
      raw.patient_name ?? raw.name ?? existing?.patient_name ?? "Emergency Patient"
    ),
    patient_phone: String(
      raw.patient_phone ?? raw.phone ?? existing?.patient_phone ?? "Not provided"
    ),
    created_at: String(
      raw.created_at ?? existing?.created_at ?? new Date().toISOString()
    ),
    status:
      String(raw.status ?? "ACTIVE").toUpperCase() === "RESOLVED"
        ? "RESOLVED"
        : "ACTIVE",
    blood_group: String(raw.blood_group ?? existing?.blood_group ?? "Unknown"),
    allergies: parseStringArray(
      raw.allergies,
      existing?.allergies ?? ["None Reported"]
    ),
    chronic_conditions: parseStringArray(
      raw.chronic_conditions,
      existing?.chronic_conditions ?? ["None Reported"]
    ),
    latitude:
      Number.isFinite(lat) && lat !== 0 ? lat : existing?.latitude ?? 28.6139,
    longitude:
      Number.isFinite(lng) && lng !== 0 ? lng : existing?.longitude ?? 77.209,
    urgency_tag,
    symptoms: String(
      raw.symptoms ??
        existing?.symptoms ??
        "SOS button triggered from the CuraPulse patient app."
    ),
    safety_advisory: String(
      raw.safety_advisory ??
        existing?.safety_advisory ??
        "High-priority SOS. Check the allergy and chronic condition badges before giving any first aid."
    ),
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((n) => String(n))
      : existing?.notes ?? [
          "Live telemetry stream established via Supabase Realtime.",
        ],
    ambulance_dispatched: Boolean(
      raw.ambulance_dispatched ?? existing?.ambulance_dispatched ?? false
    ),
    ambulance_unit: existing?.ambulance_unit,
    ambulance_dispatched_at: existing?.ambulance_dispatched_at,
    pre_intake_state,
    pre_intake_transmitted_at: existing?.pre_intake_transmitted_at,
    first_action_at: existing?.first_action_at,
  };
}

function buildMapUrls(lat: number, lng: number) {
  const latDelta = 0.006;
  const lngDelta = 0.009;
  const minLng = (lng - lngDelta).toFixed(5);
  const minLat = (lat - latDelta).toFixed(5);
  const maxLng = (lng + lngDelta).toFixed(5);
  const maxLat = (lat + latDelta).toFixed(5);
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${lat.toFixed(
      5
    )}%2C${lng.toFixed(5)}`,
    full: `https://www.openstreetmap.org/?mlat=${lat.toFixed(
      5
    )}&mlon=${lng.toFixed(5)}#map=16/${lat.toFixed(5)}/${lng.toFixed(5)}`,
  };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatElapsed(createdIso: string, nowMs: number): string {
  if (nowMs === 0) return "--:--";
  const diff = Math.max(
    0,
    Math.floor((nowMs - new Date(createdIso).getTime()) / 1000)
  );
  const mm = String(Math.floor(diff / 60)).padStart(2, "0");
  const ss = String(diff % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ============================================================================
// MAIN COMPONENT

export default function SupportCommandCenterPage() {
  const [section, setSection] = useState<SupView>("incidents");
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [dispatchReq, setDispatchReq] = useState<Record<string, "pending" | "sent">>({});
  const [shiftLog, setShiftLog] = useState<{ at: string; text: string }[]>([]);
  const [incidentFilter, setIncidentFilter] = useState<"ALL" | UrgencyTag>("ALL");
  const [incidents, setIncidents] = useState<SosIncident[]>([]);
  const [doctors, setDoctors] = useState<DoctorApplicant[]>(INITIAL_DOCTORS);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [usingSeedData, setUsingSeedData] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [sirenPlaying, setSirenPlaying] = useState<boolean>(false);
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("--:--:--");
  const [nowMs, setNowMs] = useState<number>(0);
  const [unitChoice, setUnitChoice] = useState<Record<string, string>>({});
  const [responseSamples, setResponseSamples] = useState<number[]>([
    34, 41, 36, 39,
  ]);
  const [alertBanner, setAlertBanner] = useState<{
    visible: boolean;
    patientName: string;
    incidentId: string;
  }>({ visible: false, patientName: "", incidentId: "" });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenOscillatorsRef = useRef<OscillatorNode[]>([]);
  const sirenMasterRef = useRef<GainNode | null>(null);
  const sirenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioMutedRef = useRef<boolean>(false);
  const incidentsRef = useRef<SosIncident[]>([]);
  const pendingTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const simulationCounterRef = useRef<number>(0);

  useEffect(() => {
    audioMutedRef.current = audioMuted;
  }, [audioMuted]);

  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);

  // --------------------------------------------------------------------------
  // LIVE CLOCK (client only, avoids hydration mismatch)
  // --------------------------------------------------------------------------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("curapulse_doctor_applications");
      const list = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
      if (Array.isArray(list) && list.length) {
        const mapped: DoctorApplicant[] = list.map(mapApplicant);
        setDoctors((prev) => [...mapped.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      }
    } catch {
      // No local applications.
    }
    // Applications from doctors who signed up on other devices.
    void (async () => {
      try {
        const { data, error } = await supabase.from("doctor_applications").select("*").order("submitted_at", { ascending: false }).limit(100);
        if (error || !data) return;
        const mapped = (data as Record<string, unknown>[]).map(mapApplicant);
        setDoctors((prev) => [...mapped, ...prev.filter((p) => !mapped.some((m) => m.id === p.id))]);
      } catch {
        // offline: local list only
      }
    })();
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // --------------------------------------------------------------------------
  // WEB AUDIO API: PURE BROWSER DUAL-TONE EMERGENCY SIREN (NO MP3 ASSETS)
  // --------------------------------------------------------------------------
  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtxRef.current = new Ctor();
    return audioCtxRef.current;
  }, []);

  const stopSiren = useCallback(() => {
    if (sirenTimerRef.current) {
      clearTimeout(sirenTimerRef.current);
      sirenTimerRef.current = null;
    }
    sirenOscillatorsRef.current.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        // oscillator already stopped
      }
      try {
        osc.disconnect();
      } catch {
        // already disconnected
      }
    });
    sirenOscillatorsRef.current = [];
    if (sirenMasterRef.current) {
      try {
        sirenMasterRef.current.disconnect();
      } catch {
        // already disconnected
      }
      sirenMasterRef.current = null;
    }
    setSirenPlaying(false);
  }, []);

  const startSiren = useCallback(() => {
    if (audioMutedRef.current) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      stopSiren();

      const master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      sirenMasterRef.current = master;

      const beepSeconds = 0.3;
      const totalBeeps = 14;
      const startAt = ctx.currentTime + 0.03;

      for (let i = 0; i < totalBeeps; i += 1) {
        const isHigh = i % 2 === 1;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        const t0 = startAt + i * beepSeconds;

        osc.type = isHigh ? "square" : "sawtooth";
        osc.frequency.setValueAtTime(isHigh ? 1120 : 880, t0);

        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(1, t0 + 0.02);
        env.gain.setValueAtTime(1, t0 + beepSeconds - 0.05);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + beepSeconds);

        osc.connect(env);
        env.connect(master);
        osc.start(t0);
        osc.stop(t0 + beepSeconds + 0.01);
        sirenOscillatorsRef.current.push(osc);
      }

      setSirenPlaying(true);
      sirenTimerRef.current = setTimeout(() => {
        sirenOscillatorsRef.current = [];
        if (sirenMasterRef.current) {
          try {
            sirenMasterRef.current.disconnect();
          } catch {
            // already disconnected
          }
          sirenMasterRef.current = null;
        }
        sirenTimerRef.current = null;
        setSirenPlaying(false);
      }, (totalBeeps * beepSeconds + 0.2) * 1000);
    } catch {
      // Autoplay policy can block audio until the first user gesture
    }
  }, [getAudioContext, stopSiren]);

  // Unlock audio on the first user gesture so Realtime-triggered sirens can play
  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
      } catch {
        // Protected against browser audio state transitions
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getAudioContext]);

  useEffect(() => {
    return () => {
      stopSiren();
      pendingTimersRef.current.forEach((t) => clearTimeout(t));
      pendingTimersRef.current = [];
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state === "running") {
        try {
          ctx.suspend().catch(() => {});
        } catch {
          // ignore
        }
      }
    };
  }, [stopSiren]);

  const raiseAlert = useCallback(
    (incident: SosIncident) => {
      setAlertBanner({
        visible: true,
        patientName: incident.patient_name,
        incidentId: incident.id,
      });
      startSiren();
    },
    [startSiren]
  );

  const acknowledgeAlert = useCallback(() => {
    stopSiren();
    setAlertBanner({ visible: false, patientName: "", incidentId: "" });
  }, [stopSiren]);

  // --------------------------------------------------------------------------
  // INITIAL FETCH (status = 'ACTIVE', newest first) WITH DEMO FALLBACK SEEDS
  // --------------------------------------------------------------------------
  const syncIncidents = useCallback(async (isInitialLoad: boolean) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from("sos_incidents")
        .select("*")
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        setIncidents((prev) =>
          data.map((row) => {
            const rawRow = row as Record<string, unknown>;
            const existing = prev.find((p) => p.id === String(rawRow.id));
            return normalizeIncidentRow(rawRow, existing);
          })
        );
        setUsingSeedData(false);
      } else if (isInitialLoad) {
        setIncidents(buildSeedIncidents());
        setUsingSeedData(true);
      }
    } catch {
      if (isInitialLoad) {
        setIncidents(buildSeedIncidents());
        setUsingSeedData(true);
      }
    } finally {
      setLoaded(true);
      setSyncing(false);
      setLastSyncedAt(new Date().toLocaleTimeString());
    }
  }, []);

  // --------------------------------------------------------------------------
  // SUPABASE REALTIME: curapulse-sos-command
  // --------------------------------------------------------------------------
  useEffect(() => {
    void syncIncidents(true);

    const channel = supabase
      .channel("curapulse-sos-command")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_incidents" },
        (payload) => {
          setLastSyncedAt(new Date().toLocaleTimeString());

          if (payload.eventType === "DELETE") {
            const deletedId = String(
              (payload.old as Record<string, unknown> | null)?.id ?? ""
            );
            if (deletedId) {
              setIncidents((prev) => prev.filter((i) => i.id !== deletedId));
            }
            return;
          }

          const rawNew = payload.new as Record<string, unknown>;
          const incomingId = String(rawNew?.id ?? "");
          const existing = incidentsRef.current.find((i) => i.id === incomingId);
          const incoming = normalizeIncidentRow(rawNew, existing);

          if (incoming.status !== "ACTIVE") {
            setIncidents((prev) => prev.filter((i) => i.id !== incoming.id));
            setAlertBanner((prev) =>
              prev.incidentId === incoming.id
                ? { visible: false, patientName: "", incidentId: "" }
                : prev
            );
            return;
          }

          setUsingSeedData(false);
          setIncidents((prev) => {
            const found = prev.some((i) => i.id === incoming.id);
            if (found) {
              return prev.map((i) => (i.id === incoming.id ? incoming : i));
            }
            // Drop demo seeds the moment real data arrives
            const realOnly = prev.filter(
              (i) => !i.id.endsWith("-DEL") && !i.id.endsWith("-SIM")
            );
            return [incoming, ...realOnly];
          });
          raiseAlert(incoming);
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [syncIncidents, raiseAlert]);

  // --------------------------------------------------------------------------
  // INCIDENT ACTION HELPERS
  // --------------------------------------------------------------------------
  const logAction = useCallback(
    (id: string, message: string, extra: Partial<SosIncident> = {}) => {
      const stamp = new Date().toLocaleTimeString();
      setShiftLog((prev) => [{ at: stamp, text: `${id} · ${message}` }, ...prev].slice(0, 100));
      const current = incidentsRef.current.find((i) => i.id === id);
      let firstActionAt: string | undefined;

      if (current && !current.first_action_at) {
        const seconds = Math.max(
          1,
          Math.round((Date.now() - new Date(current.created_at).getTime()) / 1000)
        );
        setResponseSamples((prev) => [...prev.slice(-19), Math.min(seconds, 600)]);
        firstActionAt = new Date().toISOString();
      }

      setIncidents((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...extra,
                ...(firstActionAt ? { first_action_at: firstActionAt } : {}),
                notes: [...item.notes, `[${stamp}] ${message}`],
              }
            : item
        )
      );
      // Share dispatch / pre-intake progress with the patient's phone and the admin console.
      const cloudPatch: Record<string, unknown> = { ...extra };
      if (firstActionAt) cloudPatch.first_action_at = firstActionAt;
      delete (cloudPatch as { notes?: unknown }).notes;
      if (Object.keys(cloudPatch).length && /^[0-9a-f-]{36}$/i.test(id)) {
        void (async () => {
          try {
            await supabase.from("sos_incidents").update(cloudPatch).eq("id", id);
          } catch {
            /* offline: local state only */
          }
        })();
      }
    },
    []
  );

  const handleCallPatient = (incident: SosIncident) => {
    logAction(
      incident.id,
      `Outbound voice call started to ${incident.patient_phone} by Agent ${AGENT_ID}.`
    );
    window.location.href = `tel:${incident.patient_phone}`;
  };

  const handleDispatchAmbulance = (incident: SosIncident) => {
    if (incident.ambulance_dispatched) return;
    const fleet = rankFleet(incident.latitude, incident.longitude);
    const chosen = fleet.find((u) => u.id === unitChoice[incident.id]) ?? fleet[0];
    const unit = chosen.id;
    const eta = etaMinutes(chosen.km);
    const er = nearestTrauma(incident.latitude, incident.longitude);
    const dispatchedAt = new Date().toISOString();
    logAction(
      incident.id,
      `Ambulance ${unit} (${chosen.type}) dispatched from ${chosen.base} to ${incident.latitude.toFixed(
        5
      )}, ${incident.longitude.toFixed(5)}. ${chosen.km.toFixed(1)} km away, ETA ${eta} min. Destination: ${er.name}.`,
      {
        ambulance_dispatched: true,
        ambulance_unit: unit,
        ambulance_dispatched_at: dispatchedAt,
      }
    );
  };

  const handleTransmitPreIntake = (incident: SosIncident) => {
    if (incident.pre_intake_state !== "IDLE") return;
    logAction(
      incident.id,
      "Pre-intake sheet packaging started for the receiving emergency room.",
      { pre_intake_state: "TRANSMITTING" }
    );

    const timer = setTimeout(() => {
      const sentAt = new Date().toISOString();
      logAction(
        incident.id,
        `Pre-intake sheet delivered (Blood Group ${
          incident.blood_group
        }; Allergies: ${incident.allergies.join(", ")}; Conditions: ${incident.chronic_conditions.join(
          ", "
        )}) to ${nearestTrauma(incident.latitude, incident.longitude).name}. Receiving ER confirmed bed and team on standby.`,
        { pre_intake_state: "CONFIRMED", pre_intake_transmitted_at: sentAt }
      );
    }, 1400);
    pendingTimersRef.current.push(timer);
  };

  const handleMarkResolved = async (incidentId: string) => {
    setResolvingIds((prev) => ({ ...prev, [incidentId]: true }));
    try {
      await supabase
        .from("sos_incidents")
        .update({ status: "RESOLVED" })
        .eq("id", incidentId);
    } catch {
      // Demo seeds are not rows in the table; resolve them locally anyway
    } finally {
      setIncidents((prev) => prev.filter((item) => item.id !== incidentId));
      setResolvingIds((prev) => {
        const next = { ...prev };
        delete next[incidentId];
        return next;
      });
      if (alertBanner.incidentId === incidentId) {
        acknowledgeAlert();
      }
    }
  };

  const handleSimulateIncomingSos = () => {
    const template =
      SIMULATED_PATIENTS[
        simulationCounterRef.current % SIMULATED_PATIENTS.length
      ];
    simulationCounterRef.current += 1;

    const simulated: SosIncident = {
      ...template,
      id: `SOS-${Math.floor(9000 + Math.random() * 999)}-SIM`,
      created_at: new Date().toISOString(),
      notes: [
        `[${new Date().toLocaleTimeString()}] SOS beacon received via CuraPulse app (simulated for demo).`,
      ],
    };

    setIncidents((prev) => [simulated, ...prev]);
    setSection("incidents");
    setSelectedId(simulated.id);
    raiseAlert(simulated);
  };

  const handleDoctorDecision = (
    docId: string,
    decision: "VERIFIED_ACTIVE" | "MORE_INFO" | "REJECTED"
  ) => {
    const decidedAt = new Date().toISOString();
    try {
      const raw = window.localStorage.getItem("curapulse_doctor_applications");
      const list = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
      if (Array.isArray(list)) {
        window.localStorage.setItem(
          "curapulse_doctor_applications",
          JSON.stringify(list.map((a) => (a.id === docId ? { ...a, verification_status: decision, decided_at: decidedAt } : a)))
        );
      }
    } catch {
      // ignore
    }
    void (async () => {
      try {
        await supabase.from("doctor_applications").update({ verification_status: decision, decided_at: decidedAt }).eq("id", docId);
      } catch {
        // offline: local decision only
      }
    })();
    setDoctors((prev) =>
      prev.map((doc) =>
        doc.id === docId
          ? { ...doc, verification_status: decision, decided_at: decidedAt }
          : doc
      )
    );
  };


  const pendingDoctorsCount = doctors.filter((d) => d.verification_status === "PENDING").length;
  const averageResponseSeconds = responseSamples.length > 0 ? Math.round(responseSamples.reduce((sum, s) => sum + s, 0) / responseSamples.length) : 0;

  // --------------------------------------------------------------------------
  // REDESIGN: view state + wrappers
  // --------------------------------------------------------------------------
  const view = useViewState("desktop");
  const P = view.isPhone;
  const [phoneDetail, setPhoneDetail] = useState(false);

  // If the live table never answers (blocked network), fall back to demo incidents after 5 s.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loaded) {
        setIncidents((prev) => (prev.length ? prev : buildSeedIncidents()));
        setUsingSeedData(true);
        setLoaded(true);
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [loaded]);

  const urgencyTone = (u: UrgencyTag) => (u === "CRITICAL" ? "crit" : u === "MEDIUM" ? "warn" : "info");
  const urgencyLabel = (u: UrgencyTag) => (u === "CRITICAL" ? "Critical" : u === "MEDIUM" ? "Urgent" : "Low");

  const sortedIncidents = useMemo(() => {
    const rank = { CRITICAL: 0, MEDIUM: 1, LOW: 2 } as const;
    return [...incidents]
      .filter((i) => incidentFilter === "ALL" || i.urgency_tag === incidentFilter)
      .sort((a, b) => rank[a.urgency_tag] - rank[b.urgency_tag] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [incidents, incidentFilter]);

  const selected = incidents.find((i) => i.id === selectedId) ?? sortedIncidents[0] ?? null;
  const selectedDoc = doctors.find((d) => d.id === selectedDocId) ?? doctors.find((d) => d.verification_status === "PENDING") ?? doctors[0] ?? null;

  const openIncident = (id: string) => {
    setSelectedId(id);
    setPhoneDetail(true);
    if (section !== "incidents" && section !== "dispatch") setSection("incidents");
  };

  const sendDispatch = (incident: SosIncident) => {
    if (incident.ambulance_dispatched) return;
    handleDispatchAmbulance(incident);
    setDispatchReq((prev) => ({ ...prev, [incident.id]: "pending" }));
    const t = setTimeout(() => setDispatchReq((prev) => ({ ...prev, [incident.id]: "sent" })), 1200);
    pendingTimersRef.current.push(t);
  };

  const resolve = async (incident: SosIncident) => {
    setShiftLog((prev) => [{ at: new Date().toLocaleTimeString(), text: `${incident.id} · Marked resolved by Agent ${AGENT_ID}.` }, ...prev]);
    await handleMarkResolved(incident.id);
    setPhoneDetail(false);
  };

  const decide = (doc: DoctorApplicant, decision: "VERIFIED_ACTIVE" | "MORE_INFO" | "REJECTED") => {
    handleDoctorDecision(doc.id, decision);
    setShiftLog((prev) => [
      { at: new Date().toLocaleTimeString(), text: `${doc.id} · ${doc.full_name}: ${decision === "VERIFIED_ACTIVE" ? "approved" : decision === "MORE_INFO" ? "more information requested" : "rejected"}.` },
      ...prev,
    ]);
  };

  // --------------------------------------------------------------------------
  // RENDER PIECES
  // --------------------------------------------------------------------------
  const liveBadge = realtimeConnected ? (
    <Badge tone="ok">Realtime live</Badge>
  ) : usingSeedData ? (
    <Badge tone="warn">Offline · demo incidents</Badge>
  ) : (
    <Badge tone="info">Connecting</Badge>
  );

  const toolbar = (
    <>
      {liveBadge}
      <Button size="sm" variant="quiet" icon={<RefreshCw className={cx("h-4 w-4", syncing && "animate-spin")} />} onClick={() => void syncIncidents(false)}>
        Sync
      </Button>
      <Button size="sm" variant="quiet" icon={audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} onClick={() => setAudioMuted((m) => !m)} aria-pressed={audioMuted}>
        {audioMuted ? "Siren muted" : "Siren on"}
      </Button>
      <Button size="sm" variant="quiet" onClick={() => (sirenPlaying ? stopSiren() : startSiren())} disabled={audioMuted}>
        {sirenPlaying ? "Stop siren" : "Test siren"}
      </Button>
      <Button size="sm" variant="emergencyOutline" icon={<Siren className="h-4 w-4" />} onClick={handleSimulateIncomingSos}>
        Simulate SOS
      </Button>
    </>
  );

  const header = (title: string, sub: string, withTools = true) =>
    P ? (
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-ink">{title}</h1>
        <p className="text-[13.5px] text-ink-muted">{sub}</p>
        {withTools && <div className="mt-3 flex flex-wrap gap-2">{toolbar}</div>}
      </div>
    ) : (
      <PageTitle title={title} sub={sub} right={withTools ? toolbar : liveBadge} />
    );

  const banner = alertBanner.visible ? (
    <Alert
      tone="crit"
      className="mb-4"
      icon={<Siren className="h-5 w-5 animate-pulse" />}
      title={`New SOS: ${alertBanner.patientName}`}
      action={
        <>
          <Button size="sm" variant="emergency" onClick={() => openIncident(alertBanner.incidentId)}>
            Open incident
          </Button>
          <Button size="sm" variant="quiet" onClick={acknowledgeAlert}>
            Acknowledge
          </Button>
        </>
      }
    >
      Incident {alertBanner.incidentId} arrived {sirenPlaying ? "· siren sounding" : ""}
    </Alert>
  ) : null;

  const kpis = (
    <div className={cx("mb-4 grid gap-3", P ? "grid-cols-2" : "grid-cols-4")}>
      {[
        ["Active SOS", String(incidents.length), incidents.some((i) => i.urgency_tag === "CRITICAL") ? `${incidents.filter((i) => i.urgency_tag === "CRITICAL").length} critical` : "None critical"],
        ["Avg time to first action", `${averageResponseSeconds}s`, averageResponseSeconds < 42 ? "Within 42s goal" : averageResponseSeconds < 60 ? "Inside 60s limit" : "Over 60s limit"],
        ["Ambulances sent", String(incidents.filter((i) => i.ambulance_dispatched).length), "This shift"],
        ["Doctors to vet", String(pendingDoctorsCount), "Pending review"],
      ].map(([l, v, s]) => (
        <Card key={l} className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">{l}</p>
          <p className="tabular text-[26px] font-bold text-ink">{v}</p>
          <p className="text-[12.5px] text-ink-muted">{s}</p>
        </Card>
      ))}
    </div>
  );

  const incidentList = (
    <Card className="overflow-hidden">
      <div className="flex gap-1.5 overflow-x-auto border-b border-line p-3">
        {(["ALL", "CRITICAL", "MEDIUM", "LOW"] as const).map((f) => (
          <ChoiceChip key={f} on={incidentFilter === f} onClick={() => setIncidentFilter(f)} className="!h-8 shrink-0 !px-3 !text-[12.5px]">
            {f === "ALL" ? `All (${incidents.length})` : urgencyLabel(f)}
          </ChoiceChip>
        ))}
      </div>
      {!loaded && incidents.length === 0 ? (
        <div className="space-y-2 p-4">
          <div className="h-14 animate-pulse rounded-xl bg-canvas" />
          <div className="h-14 animate-pulse rounded-xl bg-canvas" />
        </div>
      ) : sortedIncidents.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-[15px] font-bold text-ink">No active incidents</p>
          <p className="mt-1 text-[13.5px] text-ink-muted">New SOS alerts appear here with a siren.</p>
        </div>
      ) : (
        <ul>
          {sortedIncidents.map((i) => {
            const on = selected?.id === i.id;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => openIncident(i.id)}
                  aria-current={on ? "true" : undefined}
                  className={cx("w-full border-b border-line p-3.5 text-left last:border-b-0", on && !P ? "bg-sage" : "hover:bg-canvas", i.urgency_tag === "CRITICAL" && "border-l-4 border-l-coral")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-ink">{i.patient_name}</p>
                      <p className="tabular text-[12.5px] text-ink-muted">
                        {i.id} · {formatElapsed(i.created_at, nowMs)} ago
                      </p>
                    </div>
                    <Badge tone={urgencyTone(i.urgency_tag)}>{urgencyLabel(i.urgency_tag)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{i.symptoms}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {i.ambulance_dispatched ? <Badge tone="ok">Ambulance {i.ambulance_unit}</Badge> : <Badge tone="neutral">No ambulance yet</Badge>}
                    {i.allergies.filter((a) => !/none/i.test(a)).length > 0 && <Badge tone="crit">Allergies</Badge>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  const renderDetail = (i: SosIncident) => {
    const er = nearestTrauma(i.latitude, i.longitude);
    const map = buildMapUrls(i.latitude, i.longitude);
    const realAllergies = i.allergies.filter((a) => !/none/i.test(a));
    return (
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar initials={i.patient_name.split(" ").map((w) => w[0]).slice(0, 2).join("")} size={50} tone="mist" />
              <div className="min-w-0">
                <p className="text-[19px] font-bold text-ink">{i.patient_name}</p>
                <p className="tabular text-[13px] text-ink-muted">
                  {i.id} · {formatTimestamp(i.created_at)} · open {formatElapsed(i.created_at, nowMs)}
                </p>
              </div>
            </div>
            <Badge tone={urgencyTone(i.urgency_tag)}>{urgencyLabel(i.urgency_tag)}</Badge>
          </div>
          <p className="mt-3 text-[14.5px] text-ink">{i.symptoms}</p>
          <div className={cx("mt-4 grid gap-2", P ? "grid-cols-1" : "grid-cols-3")}>
            <Button variant="secondary" icon={<PhoneCall className="h-4 w-4" />} onClick={() => handleCallPatient(i)}>
              Call patient
            </Button>
            <Button variant={i.ambulance_dispatched ? "quiet" : "emergency"} icon={<Ambulance className="h-4 w-4" />} onClick={() => setSection("dispatch")}>
              {i.ambulance_dispatched ? "Dispatch details" : "Dispatch ambulance"}
            </Button>
            <Button variant="quiet" loading={!!resolvingIds[i.id]} onClick={() => void resolve(i)}>
              Mark resolved
            </Button>
          </div>
        </Card>

        {realAllergies.length > 0 ? (
          <Alert tone="crit" title={`Allergies: ${realAllergies.join(", ")}`}>
            Tell the ambulance crew before any medicine is given.
          </Alert>
        ) : (
          <Alert tone="ok" title="No allergies reported" />
        )}

        <div className={cx("grid gap-4", P ? "grid-cols-1" : "grid-cols-2")}>
          <Card className="p-4">
            <CardHeader title="Health snapshot" />
            <dl className="space-y-1.5 text-[14px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Blood group</dt>
                <dd className="font-bold text-ink">{i.blood_group}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Conditions</dt>
                <dd className="text-right text-ink">{i.chronic_conditions.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Phone</dt>
                <dd className="tabular text-ink">{i.patient_phone}</dd>
              </div>
            </dl>
            <Alert tone="warn" className="mt-3" title="Safety advice to read out">
              {i.safety_advisory}
            </Alert>
          </Card>
          <Card className="overflow-hidden">
            <iframe title={`Map for ${i.patient_name}`} src={map.embed} className="h-52 w-full border-0" loading="lazy" />
            <div className="flex items-center justify-between gap-2 p-3 text-[13px]">
              <span className="tabular text-ink-muted">
                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                {i.latitude.toFixed(5)}, {i.longitude.toFixed(5)}
              </span>
              <LinkButton size="sm" variant="tertiary" href={map.full} target="_blank" rel="noreferrer">
                Open map
              </LinkButton>
            </div>
          </Card>
        </div>

        <Card className="p-4">
          <CardHeader title="Nearest trauma center" right={<Hospital className="h-5 w-5 text-brand" />} />
          <p className="text-[15px] font-bold text-ink">{er.name}</p>
          <p className="text-[13.5px] text-ink-muted">
            {er.level} · {er.km.toFixed(1)} km · about {etaMinutes(er.km)} min by road
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant={i.pre_intake_state === "IDLE" ? "secondary" : "quiet"} disabled={i.pre_intake_state !== "IDLE"} loading={i.pre_intake_state === "TRANSMITTING"} icon={<Send className="h-4 w-4" />} onClick={() => handleTransmitPreIntake(i)}>
              Send pre-intake sheet
            </Button>
            <Badge tone={i.pre_intake_state === "CONFIRMED" ? "ok" : i.pre_intake_state === "TRANSMITTING" ? "info" : "neutral"}>
              {i.pre_intake_state === "CONFIRMED" ? "Confirmed by ER (simulated)" : i.pre_intake_state === "TRANSMITTING" ? "Sending" : "Not sent"}
            </Badge>
          </div>
        </Card>

        <Card className="p-4">
          <CardHeader title="Timeline" />
          <Timeline
            items={i.notes
              .slice()
              .reverse()
              .slice(0, 8)
              .map((n, idx) => ({ title: n.replace(/^\[[^\]]+\]\s*/, ""), sub: n.match(/^\[([^\]]+)\]/)?.[1], state: idx === 0 ? ("active" as const) : ("done" as const) }))}
          />
        </Card>
      </div>
    );
  };

  const renderIncidents = () => {
    if (P && phoneDetail && selected) {
      return (
        <div>
          <button type="button" onClick={() => setPhoneDetail(false)} className="mb-3 flex items-center gap-1 text-[14px] font-semibold text-brand">
            <ArrowLeft className="h-4 w-4" /> Incidents
          </button>
          {banner}
          {renderDetail(selected)}
        </div>
      );
    }
    return (
      <div>
        {header("Live incidents", `Agent ${AGENT_ID} · last sync ${lastSyncedAt}`)}
        {banner}
        {usingSeedData && (
          <Alert tone="offline" className="mb-4" title="Showing demo incidents">
            The live incident table isn't reachable from here. New SOS alerts from the patient app will replace these as soon as it connects.
          </Alert>
        )}
        {kpis}
        {P ? (
          incidentList
        ) : (
          <div className="grid grid-cols-[minmax(340px,4fr)_7fr] gap-5">
            <div className="min-w-0">{incidentList}</div>
            <div className="min-w-0">{selected ? renderDetail(selected) : <Card className="p-6 text-center text-ink-muted">Select an incident.</Card>}</div>
          </div>
        )}
      </div>
    );
  };

  const renderDispatch = () => {
    const i = selected;
    return (
      <div>
        {header("Dispatch", "Pick the closest suitable ambulance and send the request")}
        {banner}
        {!i ? (
          <Card className="p-6 text-center text-ink-muted">No active incident to dispatch.</Card>
        ) : (
          <div className={cx("grid gap-5", P ? "grid-cols-1" : "grid-cols-[7fr_4fr]")}>
            <div className="space-y-4">
              <Card className="p-4">
                <Eyebrow>Incident</Eyebrow>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <select aria-label="Choose incident" value={i.id} onChange={(e) => setSelectedId(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border-[1.5px] border-line-strong bg-white px-3 text-[14px] font-semibold text-ink">
                    {sortedIncidents.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.patient_name} · {x.id} · {urgencyLabel(x.urgency_tag)}
                      </option>
                    ))}
                  </select>
                  <Badge tone={urgencyTone(i.urgency_tag)}>{urgencyLabel(i.urgency_tag)}</Badge>
                </div>
              </Card>
              <Card className="p-4">
                <CardHeader title="Available ambulances" sub="Sorted by distance. ETA assumes road travel with siren." />
                <fieldset className="space-y-2" disabled={i.ambulance_dispatched}>
                  <legend className="sr-only">Ambulance unit</legend>
                  {rankFleet(i.latitude, i.longitude).map((u, idx) => {
                    const chosen = (unitChoice[i.id] ?? rankFleet(i.latitude, i.longitude)[0].id) === u.id;
                    return (
                      <label key={u.id} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] p-3", chosen ? "border-brand bg-sage" : "border-line bg-white hover:border-brand/50")}>
                        <input type="radio" name={`unit-${i.id}`} checked={chosen} onChange={() => setUnitChoice((prev) => ({ ...prev, [i.id]: u.id }))} className="h-4 w-4 accent-[#176B63]" />
                        <div className="min-w-0 flex-1">
                          <p className="tabular text-[14.5px] font-bold text-ink">
                            {u.id} {idx === 0 && <Badge tone="ok" noIcon>Closest</Badge>}
                          </p>
                          <p className="text-[13px] text-ink-muted">
                            {u.type} · {u.base}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tabular text-[16px] font-bold text-ink">{etaMinutes(u.km)} min</p>
                          <p className="tabular text-[12px] text-ink-muted">{u.km.toFixed(1)} km</p>
                        </div>
                      </label>
                    );
                  })}
                </fieldset>
                <Button className="mt-3" full variant="emergency" icon={<Ambulance className="h-5 w-5" />} disabled={i.ambulance_dispatched} onClick={() => sendDispatch(i)}>
                  {i.ambulance_dispatched ? `Requested ${i.ambulance_unit}` : "Send dispatch request"}
                </Button>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="p-4">
                <CardHeader title="Request status" right={<Badge tone="lav">Simulated</Badge>} sub="Demo dispatch. No live 108 link is connected." />
                <Timeline
                  items={[
                    { title: "Unit selected", sub: unitChoice[i.id] ?? rankFleet(i.latitude, i.longitude)[0].id, state: "done" },
                    { title: dispatchReq[i.id] === "sent" || i.ambulance_dispatched ? "Request sent" : dispatchReq[i.id] === "pending" ? "Sending request" : "Not sent", sub: i.ambulance_dispatched_at ? formatTimestamp(i.ambulance_dispatched_at) : undefined, state: i.ambulance_dispatched ? (dispatchReq[i.id] === "pending" ? "active" : "done") : "pending" },
                    { title: "Crew confirmation", sub: "Confirm by radio or phone before closing", state: i.ambulance_dispatched ? "active" : "pending" },
                    { title: `Destination: ${nearestTrauma(i.latitude, i.longitude).name}`, sub: i.pre_intake_state === "CONFIRMED" ? "Pre-intake confirmed (simulated)" : "Pre-intake not sent", state: i.pre_intake_state === "CONFIRMED" ? "done" : "pending" },
                  ]}
                />
              </Card>
              <Button full variant="secondary" icon={<Radio className="h-4 w-4" />} onClick={() => openIncident(i.id)}>
                Back to incident
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const docTone = (s: DoctorStatus) => (s === "VERIFIED_ACTIVE" ? "ok" : s === "REJECTED" ? "crit" : s === "MORE_INFO" ? "warn" : "info");
  const docLabel = (s: DoctorStatus) => (s === "VERIFIED_ACTIVE" ? "Approved" : s === "REJECTED" ? "Rejected" : s === "MORE_INFO" ? "More info requested" : "Pending");

  const renderVerify = () => (
    <div>
      {header("Doctor verification", `${pendingDoctorsCount} waiting for a person to check`, false)}
      <div className={cx("grid gap-5", P ? "grid-cols-1" : "grid-cols-[5fr_6fr]")}>
        <Card className="divide-y divide-line overflow-hidden">
          {doctors.map((d) => (
            <button key={d.id} type="button" onClick={() => setSelectedDocId(d.id)} className={cx("flex w-full items-center gap-3 p-3.5 text-left", selectedDoc?.id === d.id && !P ? "bg-sage" : "hover:bg-canvas")}>
              <Avatar initials={d.full_name.replace(/^Dr\.?\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("")} size={40} tone="mist" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold text-ink">{d.full_name}</p>
                <p className="truncate text-[12.5px] text-ink-muted">
                  {d.specialty} · {d.nmc_registration_id}
                </p>
              </div>
              <Badge tone={docTone(d.verification_status)}>{docLabel(d.verification_status)}</Badge>
            </button>
          ))}
        </Card>
        {selectedDoc && (
          <Card className="p-5">
            <CardHeader title={selectedDoc.full_name} sub={selectedDoc.id} right={<Badge tone={docTone(selectedDoc.verification_status)}>{docLabel(selectedDoc.verification_status)}</Badge>} />
            <dl className="space-y-2 text-[14px]">
              {[
                ["Registration", selectedDoc.nmc_registration_id],
                ["Council", selectedDoc.state_medical_council],
                ["Qualification", selectedDoc.degree ?? "Not provided"],
                ["Specialty", selectedDoc.specialty],
                ["Experience", selectedDoc.experience_years != null ? `${selectedDoc.experience_years} years` : "Not provided"],
                ["Hospital", selectedDoc.hospital_affiliation],
                ["Contact", selectedDoc.contact ?? "Not provided"],
                ["Documents", selectedDoc.documents?.join(", ") || "None uploaded"],
                ["Submitted", /\d{4}-\d{2}/.test(selectedDoc.submitted_at) ? formatTimestamp(selectedDoc.submitted_at) : selectedDoc.submitted_at],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-right font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {selectedDoc.notes && <p className="mt-3 rounded-xl bg-canvas p-3 text-[13.5px] text-ink">“{selectedDoc.notes}”</p>}
            {selectedDoc.ai_review && (
              <div className="mt-4 rounded-2xl border border-line p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[14px] font-bold text-ink">AI document check</p>
                  <Badge tone={selectedDoc.ai_review.verdict === "LOOKS_VALID" ? "ok" : "warn"}>
                    {selectedDoc.ai_review.source !== "gemini" ? "Not run" : selectedDoc.ai_review.verdict === "LOOKS_VALID" ? "No visible problems" : selectedDoc.ai_review.verdict === "UNREADABLE" ? "Unreadable" : `${selectedDoc.ai_review.issues.length} flagged`}
                  </Badge>
                </div>
                {selectedDoc.ai_review.source === "gemini" && (
                  <p className="mb-2 text-[13px] text-ink-muted">
                    Read as: {selectedDoc.ai_review.document_type} · name “{selectedDoc.ai_review.extracted?.name || "—"}” · reg. “{selectedDoc.ai_review.extracted?.registration_number || "—"}”
                  </p>
                )}
                {selectedDoc.ai_review.issues.length > 0 ? (
                  <ul className="space-y-1">
                    {selectedDoc.ai_review.issues.map((i) => (
                      <li key={i} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] text-amber-900">
                        {i}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-ink-muted">Nothing flagged. A person still decides.</p>
                )}
              </div>
            )}
            <Alert tone="info" className="mt-4" title="Check before approving">
              Search the registration number on the NMC Indian Medical Register and match the name and council on the uploaded certificate.
            </Alert>
            {selectedDoc.decided_at && <p className="mt-3 text-[13px] text-ink-muted">Decided {formatTimestamp(selectedDoc.decided_at)}</p>}
            <div className={cx("mt-4 grid gap-2", P ? "grid-cols-1" : "grid-cols-3")}>
              <Button icon={<BadgeCheck className="h-4 w-4" />} disabled={selectedDoc.verification_status === "VERIFIED_ACTIVE"} onClick={() => decide(selectedDoc, "VERIFIED_ACTIVE")}>
                Approve
              </Button>
              <Button variant="secondary" disabled={selectedDoc.verification_status === "MORE_INFO"} onClick={() => decide(selectedDoc, "MORE_INFO")}>
                Request info
              </Button>
              <Button variant="emergencyOutline" disabled={selectedDoc.verification_status === "REJECTED"} onClick={() => decide(selectedDoc, "REJECTED")}>
                Reject
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  const renderLog = () => (
    <div>
      {header("Shift log", `Agent ${AGENT_ID} · every action is recorded`, false)}
      <Card className="p-4">
        {shiftLog.length === 0 ? (
          <p className="text-[14px] text-ink-muted">No actions yet this shift. Calls, dispatches, pre-intake sheets and decisions appear here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shiftLog.map((l, idx) => (
              <li key={idx} className="flex gap-3 py-2.5 text-[14px]">
                <span className="tabular w-20 shrink-0 text-ink-muted">{l.at}</span>
                <span className="text-ink">{l.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  const nav = [
    { key: "incidents", label: P ? "Incidents" : "Live incidents", icon: Siren, badge: incidents.length || undefined },
    { key: "chats", label: "Chats", icon: MessageCircle },
    { key: "dispatch", label: "Dispatch", icon: Ambulance },
    { key: "verify", label: P ? "Verify" : "Doctor verification", icon: ShieldCheck, badge: pendingDoctorsCount || undefined },
    { key: "log", label: "Shift log", icon: ClipboardList },
  ];

  return (
    <Shell
      requireRole="support"
      view={view}
      product="Support Desk"
      nav={nav}
      active={section}
      onNav={(k) => {
        setSection(k as SupView);
        setPhoneDetail(false);
        document.getElementById("cp-scroll")?.scrollTo({ top: 0 });
      }}
      user={{ name: "Ops agent", sub: `Agent ${AGENT_ID}`, initials: "OP" }}
    >
      <div className={cx(P && "px-4 py-4")}>{section === "incidents" ? renderIncidents() : section === "chats" ? <LiveChatInbox identities={[{ id: "support", name: "CuraPulse Support" }]} storageKey="curapulse_support_inbox_as" phone={P} title="Patient chats" /> : section === "dispatch" ? renderDispatch() : section === "verify" ? renderVerify() : renderLog()}</div>
    </Shell>
  );
}
