"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Copy, Download, FileBarChart, LayoutDashboard, MapPin, RefreshCw, ScrollText, ShieldCheck, Siren, Users, X } from "lucide-react";
import { supabase as sharedSupabase } from "@/lib/supabase";
import { Shell, useViewState } from "@/components/Shell";
import {
  Alert,
  Avatar,
  Badge,
  BarChart,
  Button,
  Card,
  CardHeader,
  Checkbox,
  ChoiceChip,
  Eyebrow,
  Field,
  LineChart,
  PageTitle,
  ProgressBar,
  Segmented,
  Toast,
  Toggle,
  cx,
  inputCls,
} from "@/components/ui";

type AdminView = "overview" | "incidents" | "directory" | "governance" | "reports";

/** Deterministic pseudo-random series so charts are stable between renders. */
function seriesFor(seed: number, n: number, lo: number, hi: number): number[] {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    return Math.round(lo + (s / 233280) * (hi - lo));
  });
}

const supabase = sharedSupabase;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type Role = "Patient" | "Doctor" | "Support Desk";
type UserStatus = "Active" | "Suspended" | "Pending Review";
type LicenseState = "Verified" | "Pending" | "Revoked" | "Not Applicable";
type IncidentStatus = "ACTIVE" | "DISPATCHED" | "RESOLVED";
type Urgency = "CRITICAL" | "HIGH" | "MODERATE";
type ChannelStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
type ToastTone = "success" | "warning" | "danger" | "info";

interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

interface AuditEntry {
  at: string;
  action: string;
}

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  passportId: string;
  role: Role;
  status: UserStatus;
  specialty?: string;
  licenseNo?: string;
  licenseState: LicenseState;
  joined: string;
  twoFA: boolean;
  bloodGroup: string;
  allergies: string[];
  contacts: EmergencyContact[];
  audit: AuditEntry[];
}

interface Incident {
  id: string;
  createdAt: string;
  patientName: string;
  passportId: string;
  urgency: Urgency;
  status: IncidentStatus;
  lat: number;
  lng: number;
  bloodGroup: string;
  agent: string;
  city: string;
}

interface CertRecord {
  id: string;
  doctor: string;
  credential: string;
  university: string;
  score: number;
  flag: string;
  scannedAt: string;
  flagged: boolean;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface HashEntry {
  id: number;
  batch: string;
  hash: string;
  records: number;
  at: string;
}

/* -------------------------------------------------------------------------- */
/*  Fallback seed data                                                         */
/* -------------------------------------------------------------------------- */

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60000).toISOString();
const daysAgo = (d: number): string => new Date(Date.now() - d * 86400000).toISOString();

const SEED_USERS: DirectoryUser[] = [
  {
    id: "U-1001",
    name: "Ananya Sharma",
    email: "ananya.sharma@example.in",
    passportId: "HP-IN-204811",
    role: "Patient",
    status: "Active",
    licenseState: "Not Applicable",
    joined: daysAgo(210),
    twoFA: true,
    bloodGroup: "O-",
    allergies: ["Penicillin", "Peanuts"],
    contacts: [
      { name: "Rakesh Sharma", relation: "Father", phone: "+91 98100 22451" },
      { name: "Meera Sharma", relation: "Mother", phone: "+91 98110 77320" },
    ],
    audit: [
      { at: daysAgo(12), action: "Health Passport viewed by Dr. Aarav Mehta" },
      { at: daysAgo(40), action: "Emergency contact updated" },
    ],
  },
  {
    id: "U-1002",
    name: "Rohan Iyer",
    email: "rohan.iyer@example.in",
    passportId: "HP-IN-318240",
    role: "Patient",
    status: "Active",
    licenseState: "Not Applicable",
    joined: daysAgo(95),
    twoFA: false,
    bloodGroup: "B+",
    allergies: ["Latex"],
    contacts: [{ name: "Lakshmi Iyer", relation: "Spouse", phone: "+91 99620 18834" }],
    audit: [{ at: daysAgo(5), action: "SOS-9038 raised from Chennai" }],
  },
  {
    id: "U-1003",
    name: "Fatima Khan",
    email: "fatima.khan@example.in",
    passportId: "HP-IN-442907",
    role: "Patient",
    status: "Suspended",
    licenseState: "Not Applicable",
    joined: daysAgo(140),
    twoFA: true,
    bloodGroup: "AB+",
    allergies: ["Sulfa drugs", "Shellfish", "Dust mites"],
    contacts: [{ name: "Imran Khan", relation: "Brother", phone: "+91 90040 55671" }],
    audit: [{ at: daysAgo(3), action: "Account suspended after repeated false SOS reports" }],
  },
  {
    id: "U-2001",
    name: "Dr. Aarav Mehta",
    email: "aarav.mehta@curapulse.in",
    passportId: "HP-IN-110022",
    role: "Doctor",
    status: "Pending Review",
    specialty: "Cardiology",
    licenseNo: "MCI-2019-48213",
    licenseState: "Pending",
    joined: daysAgo(6),
    twoFA: true,
    bloodGroup: "A+",
    allergies: [],
    contacts: [{ name: "Neha Mehta", relation: "Spouse", phone: "+91 98730 11902" }],
    audit: [{ at: daysAgo(6), action: "Registration submitted with medical degree upload" }],
  },
  {
    id: "U-2002",
    name: "Dr. Priya Nair",
    email: "priya.nair@curapulse.in",
    passportId: "HP-IN-110348",
    role: "Doctor",
    status: "Active",
    specialty: "Emergency Medicine",
    licenseNo: "KMC-2016-30977",
    licenseState: "Verified",
    joined: daysAgo(320),
    twoFA: true,
    bloodGroup: "O+",
    allergies: ["Iodine"],
    contacts: [{ name: "Suresh Nair", relation: "Father", phone: "+91 94470 66012" }],
    audit: [
      { at: daysAgo(150), action: "Medical license verified by Governance Console" },
      { at: daysAgo(30), action: "Responded to SOS-9011" },
    ],
  },
  {
    id: "U-2003",
    name: "Dr. Vikram Singh",
    email: "vikram.singh@curapulse.in",
    passportId: "HP-IN-110571",
    role: "Doctor",
    status: "Pending Review",
    specialty: "Neurology",
    licenseNo: "DMC-2021-77120",
    licenseState: "Pending",
    joined: daysAgo(2),
    twoFA: false,
    bloodGroup: "B-",
    allergies: [],
    contacts: [{ name: "Anjali Singh", relation: "Sister", phone: "+91 98910 33480" }],
    audit: [{ at: daysAgo(2), action: "Registration submitted; certificate flagged for AI review" }],
  },
  {
    id: "U-3001",
    name: "Kavya Reddy",
    email: "kavya.reddy@curapulse.in",
    passportId: "HP-IN-990114",
    role: "Support Desk",
    status: "Active",
    licenseNo: "SD-OPS-0412",
    licenseState: "Verified",
    joined: daysAgo(260),
    twoFA: true,
    bloodGroup: "A-",
    allergies: ["Aspirin"],
    contacts: [{ name: "Madhav Reddy", relation: "Spouse", phone: "+91 98480 20931" }],
    audit: [{ at: daysAgo(1), action: "Reassigned dispatch agent on SOS-9040" }],
  },
  {
    id: "U-3002",
    name: "Imran Qureshi",
    email: "imran.qureshi@curapulse.in",
    passportId: "HP-IN-990387",
    role: "Support Desk",
    status: "Pending Review",
    licenseNo: "SD-OPS-0587",
    licenseState: "Pending",
    joined: daysAgo(4),
    twoFA: false,
    bloodGroup: "O+",
    allergies: [],
    contacts: [{ name: "Sana Qureshi", relation: "Mother", phone: "+91 98200 71452" }],
    audit: [{ at: daysAgo(4), action: "Support Desk onboarding requested" }],
  },
  {
    id: "U-1004",
    name: "Harpreet Kaur",
    email: "harpreet.kaur@example.in",
    passportId: "HP-IN-551672",
    role: "Patient",
    status: "Active",
    licenseState: "Not Applicable",
    joined: daysAgo(28),
    twoFA: true,
    bloodGroup: "A+",
    allergies: ["Ibuprofen"],
    contacts: [{ name: "Gurpreet Singh", relation: "Spouse", phone: "+91 98760 44218" }],
    audit: [{ at: daysAgo(8), action: "Health Passport created" }],
  },
];

const SEED_INCIDENTS: Incident[] = [
  {
    id: "SOS-9042",
    createdAt: minutesAgo(2),
    patientName: "Ananya Sharma",
    passportId: "HP-IN-204811",
    urgency: "CRITICAL",
    status: "ACTIVE",
    lat: 28.6139,
    lng: 77.209,
    bloodGroup: "O-",
    agent: "Unit Alpha - Ravi Kumar",
    city: "New Delhi",
  },
  {
    id: "SOS-9041",
    createdAt: minutesAgo(11),
    patientName: "Rohan Iyer",
    passportId: "HP-IN-318240",
    urgency: "HIGH",
    status: "DISPATCHED",
    lat: 13.0827,
    lng: 80.2707,
    bloodGroup: "B+",
    agent: "Unit Bravo - Meenakshi S.",
    city: "Chennai",
  },
  {
    id: "SOS-9040",
    createdAt: minutesAgo(36),
    patientName: "Harpreet Kaur",
    passportId: "HP-IN-551672",
    urgency: "MODERATE",
    status: "RESOLVED",
    lat: 30.7333,
    lng: 76.7794,
    bloodGroup: "A+",
    agent: "Unit Charlie - Tarun Bhatia",
    city: "Chandigarh",
  },
  {
    id: "SOS-9039",
    createdAt: minutesAgo(64),
    patientName: "Fatima Khan",
    passportId: "HP-IN-442907",
    urgency: "CRITICAL",
    status: "DISPATCHED",
    lat: 19.076,
    lng: 72.8777,
    bloodGroup: "AB+",
    agent: "Unit Delta - Sanjay Patil",
    city: "Mumbai",
  },
  {
    id: "SOS-9038",
    createdAt: minutesAgo(130),
    patientName: "Suresh Menon",
    passportId: "HP-IN-660291",
    urgency: "HIGH",
    status: "RESOLVED",
    lat: 12.9716,
    lng: 77.5946,
    bloodGroup: "B-",
    agent: "Unit Bravo - Meenakshi S.",
    city: "Bengaluru",
  },
  {
    id: "SOS-9037",
    createdAt: minutesAgo(240),
    patientName: "Debashree Das",
    passportId: "HP-IN-772018",
    urgency: "MODERATE",
    status: "RESOLVED",
    lat: 22.5726,
    lng: 88.3639,
    bloodGroup: "O+",
    agent: "Unit Echo - Arindam Roy",
    city: "Kolkata",
  },
  {
    id: "SOS-9036",
    createdAt: minutesAgo(18),
    patientName: "Manoj Tiwari",
    passportId: "HP-IN-884553",
    urgency: "HIGH",
    status: "ACTIVE",
    lat: 26.9124,
    lng: 75.7873,
    bloodGroup: "A-",
    agent: "Unassigned",
    city: "Jaipur",
  },
];

const SEED_CERTS: CertRecord[] = [
  {
    id: "CERT-501",
    doctor: "Dr. Aarav Mehta",
    credential: "MBBS + MD (Cardiology)",
    university: "AIIMS New Delhi",
    score: 99.4,
    flag: "Cryptographic Hash Valid",
    scannedAt: minutesAgo(25),
    flagged: false,
  },
  {
    id: "CERT-502",
    doctor: "Dr. Vikram Singh",
    credential: "DM Neurology Board Certificate",
    university: "Unaccredited Institute of Medical Sciences",
    score: 41.2,
    flag: "Seal Pixel Mismatch",
    scannedAt: minutesAgo(48),
    flagged: false,
  },
  {
    id: "CERT-503",
    doctor: "Dr. Priya Nair",
    credential: "MBBS",
    university: "Government Medical College, Thiruvananthapuram",
    score: 97.8,
    flag: "Registry Match Confirmed",
    scannedAt: minutesAgo(190),
    flagged: false,
  },
  {
    id: "CERT-504",
    doctor: "Dr. Neel Banerjee",
    credential: "MS General Surgery",
    university: "Calcutta Medical College",
    score: 72.6,
    flag: "Font Kerning Inconsistency",
    scannedAt: minutesAgo(320),
    flagged: false,
  },
  {
    id: "CERT-505",
    doctor: "Dr. Shalini Rao",
    credential: "MD Pediatrics",
    university: "JIPMER Puducherry",
    score: 98.9,
    flag: "Cryptographic Hash Valid",
    scannedAt: minutesAgo(410),
    flagged: false,
  },
];

const AGENTS = [
  "Unassigned",
  "Unit Alpha - Ravi Kumar",
  "Unit Bravo - Meenakshi S.",
  "Unit Charlie - Tarun Bhatia",
  "Unit Delta - Sanjay Patil",
  "Unit Echo - Arindam Roy",
];

const SIM_LOCATIONS = [
  { city: "Hyderabad", lat: 17.385, lng: 78.4867 },
  { city: "Pune", lat: 18.5204, lng: 73.8567 },
  { city: "Lucknow", lat: 26.8467, lng: 80.9462 },
  { city: "Ahmedabad", lat: 23.0225, lng: 72.5714 },
  { city: "Bhopal", lat: 23.2599, lng: 77.4126 },
  { city: "Kochi", lat: 9.9312, lng: 76.2673 },
];

const SIM_PATIENTS = ["Kabir Malhotra", "Ishita Banerjee", "Tanvir Ahmed", "Sneha Joshi", "Gaurav Chauhan", "Lavanya Pillai"];
const BLOOD_GROUPS = ["O-", "O+", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const URGENCIES: Urgency[] = ["CRITICAL", "HIGH", "MODERATE"];
const INCIDENT_STATUSES: IncidentStatus[] = ["ACTIVE", "DISPATCHED", "RESOLVED"];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */


const relativeTime = (iso: string, now: number): string => {
  const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const initials = (name: string): string =>
  name
    .replace(/^Dr\.\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const normalizeUrgency = (value: unknown): Urgency => {
  const v = String(value ?? "").toUpperCase();
  if (v === "CRITICAL" || v === "HIGH" || v === "MODERATE") return v;
  if (v === "LOW") return "MODERATE";
  return "HIGH";
};

const normalizeStatus = (value: unknown): IncidentStatus => {
  const v = String(value ?? "").toUpperCase();
  if (v === "ACTIVE" || v === "DISPATCHED" || v === "RESOLVED") return v;
  return "ACTIVE";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapIncidentRow = (row: any): Incident => ({
  id: String(row.id ?? row.incident_id ?? `SOS-${randInt(9100, 9999)}`),
  createdAt: row.created_at ?? row.timestamp ?? new Date().toISOString(),
  patientName: row.patient_name ?? row.user_name ?? row.name ?? "Unknown Patient",
  passportId: row.health_passport_id ?? row.passport_id ?? row.user_id ?? "HP-IN-UNKNOWN",
  urgency: normalizeUrgency(row.urgency_status ?? row.urgency ?? row.severity),
  status: normalizeStatus(row.status),
  lat: Number(row.latitude ?? row.lat ?? 20.5937),
  lng: Number(row.longitude ?? row.lng ?? row.lon ?? 78.9629),
  bloodGroup: row.blood_group ?? row.blood_type ?? "O+",
  agent: row.assigned_agent ?? row.dispatch_agent ?? row.agent ?? "Unassigned",
  city: row.city ?? row.location ?? "India",
});

const sha256Hex = async (input: string): Promise<string> => {
  try {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    return (h.toString(16).padStart(8, "0") + Date.now().toString(16)).padEnd(64, "0").slice(0, 64);
  }
};


export default function AdminGovernanceConsole() {
  /* ---------------------------- core state ---------------------------- */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [users, setUsers] = useState<DirectoryUser[]>(SEED_USERS);
  const [incidents, setIncidents] = useState<Incident[]>(SEED_INCIDENTS);
  const [certs, setCerts] = useState<CertRecord[]>(SEED_CERTS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [loading, setLoading] = useState<boolean>(false);

  /* ---------------------------- realtime state ---------------------------- */
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>("RECONNECTING");
  const [wsLatency, setWsLatency] = useState<number>(86);
  const [lastHeartbeat, setLastHeartbeat] = useState<string>(new Date().toISOString());
  const [reconnectKey, setReconnectKey] = useState<number>(0);

  /* ---------------------------- telemetry ---------------------------- */
  const [dispatchLatency, setDispatchLatency] = useState<number>(42);
  const [pinging, setPinging] = useState<boolean>(false);

  /* ---------------------------- user filters ---------------------------- */
  const [search, setSearch] = useState<string>("");
  const [roleTab, setRoleTab] = useState<"All" | Role>("All");
  const [statusFilter, setStatusFilter] = useState<"All Statuses" | UserStatus>("All Statuses");
  const [passportUser, setPassportUser] = useState<DirectoryUser | null>(null);
  const [section, setSection] = useState<AdminView>("overview");
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [auditPick, setAuditPick] = useState<number>(0);

  /* ---------------------------- incident filters ---------------------------- */
  const [incStatusFilter, setIncStatusFilter] = useState<"ALL" | IncidentStatus>("ALL");
  const [incUrgencyFilter, setIncUrgencyFilter] = useState<"ALL" | Urgency>("ALL");
  const [mapIncident, setMapIncident] = useState<Incident | null>(null);

  /* ---------------------------- future perspective ---------------------------- */
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const [pipelineCount, setPipelineCount] = useState<number>(184320);
  const [pipelineActive, setPipelineActive] = useState<boolean>(true);
  const [piiStripped, setPiiStripped] = useState<number>(184320 * 11);
  const [kAnon, setKAnon] = useState<number>(7.4);
  const [hashLog, setHashLog] = useState<HashEntry[]>([]);
  const [batchBusy, setBatchBusy] = useState<boolean>(false);

  const toastId = useRef<number>(1);
  const hashId = useRef<number>(1);
  const incidentSeq = useRef<number>(9043);

  /* ---------------------------- toasts ---------------------------- */
  const pushToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = toastId.current++;
    setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  /* ---------------------------- clock tick ---------------------------- */
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);

  /* ---------------------------- merge helper ---------------------------- */
  const upsertIncident = useCallback((incoming: Incident) => {
    setIncidents((prev) => {
      const exists = prev.some((i) => i.id === incoming.id);
      const next = exists ? prev.map((i) => (i.id === incoming.id ? incoming : i)) : [incoming, ...prev];
      return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
  }, []);

  /* ---------------------------- initial fetch ---------------------------- */
  const fetchIncidents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.from("sos_incidents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        const live = data.map(mapIncidentRow);
        setIncidents((prev) => {
          const map = new Map<string, Incident>();
          prev.forEach((i) => map.set(i.id, i));
          live.forEach((i) => map.set(i.id, i));
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        if (!silent) pushToast(`Synced ${live.length} live incident record(s) from Supabase`, "info");
      } else if (!silent) {
        pushToast("Live incident table empty or restricted - using resilient fallback dataset", "warning");
      }
    } catch {
      if (!silent) pushToast("Supabase unreachable - showing fallback Incident Queue", "warning");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    fetchIncidents(true);
  }, [fetchIncidents]);

  /* ---------------------------- realtime channel ---------------------------- */
  useEffect(() => {
    setChannelStatus("RECONNECTING");
    const channel = supabase
      .channel("admin-sos-monitor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_incidents" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          setLastHeartbeat(new Date().toISOString());
          if (payload.eventType === "DELETE") {
            const oldId = String(payload.old?.id ?? "");
            if (oldId) {
              setIncidents((prev) => prev.filter((i) => i.id !== oldId));
              pushToast(`Incident ${oldId} removed from the live Incident Queue`, "info");
            }
            return;
          }
          if (payload.new) {
            const inc = mapIncidentRow(payload.new);
            upsertIncident(inc);
            if (payload.eventType === "INSERT") {
              pushToast(`New live SOS ${inc.id} (${inc.urgency}) received`, "danger");
            } else {
              pushToast(`Incident ${inc.id} updated - ${inc.status}`, "info");
            }
          }
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setChannelStatus("CONNECTED");
          setLastHeartbeat(new Date().toISOString());
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setChannelStatus("RECONNECTING");
        } else if (status === "CLOSED") {
          setChannelStatus("DISCONNECTED");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reconnectKey, pushToast, upsertIncident]);

  /* ---------------------------- heartbeat simulation ---------------------------- */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (channelStatus === "CONNECTED") {
        setWsLatency(randInt(48, 118));
        setLastHeartbeat(new Date().toISOString());
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [channelStatus]);

  /* ---------------------------- anonymization pipeline auto-run ---------------------------- */
  useEffect(() => {
    if (!pipelineActive) return;
    const t = window.setInterval(() => {
      const add = randInt(1, 4);
      setPipelineCount((c) => c + add);
      setPiiStripped((p) => p + add * 11);
      setKAnon((k) => Math.min(9.8, Math.max(6.9, Number((k + (Math.random() - 0.5) * 0.06).toFixed(2)))));
    }, 2000);
    return () => window.clearInterval(t);
  }, [pipelineActive]);

  /* ---------------------------- derived data ---------------------------- */
  const activeSosCount = useMemo(() => incidents.filter((i) => i.status === "ACTIVE").length, [incidents]);

  const roleCounts = useMemo(
    () => ({
      Patient: users.filter((u) => u.role === "Patient").length,
      Doctor: users.filter((u) => u.role === "Doctor").length,
      "Support Desk": users.filter((u) => u.role === "Support Desk").length,
    }),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleTab !== "All" && u.role !== roleTab) return false;
      if (statusFilter !== "All Statuses" && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.passportId.toLowerCase().includes(q) ||
        (u.licenseNo ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleTab, statusFilter]);

  const filteredIncidents = useMemo(
    () =>
      incidents.filter((i) => {
        if (incStatusFilter !== "ALL" && i.status !== incStatusFilter) return false;
        if (incUrgencyFilter !== "ALL" && i.urgency !== incUrgencyFilter) return false;
        return true;
      }),
    [incidents, incStatusFilter, incUrgencyFilter]
  );

  /* ---------------------------- user governance actions ---------------------------- */
  const mutateUser = useCallback(
    (id: string, patch: (u: DirectoryUser) => DirectoryUser) => {
      setUsers((prev) => prev.map((u) => (u.id === id ? patch(u) : u)));
      setPassportUser((cur) => (cur && cur.id === id ? patch(cur) : cur));
    },
    []
  );

  const addAudit = (u: DirectoryUser, action: string): DirectoryUser => ({
    ...u,
    audit: [{ at: new Date().toISOString(), action }, ...u.audit],
  });

  const toggleSuspend = (u: DirectoryUser) => {
    if (u.status === "Suspended") {
      mutateUser(u.id, (x) => addAudit({ ...x, status: "Active" }, "Account reactivated by Governance Console"));
      pushToast(`${u.name}'s account reactivated`, "success");
    } else {
      mutateUser(u.id, (x) => addAudit({ ...x, status: "Suspended" }, "Account suspended by Governance Console"));
      pushToast(`${u.name}'s account suspended`, "danger");
    }
  };

  const verifyLicense = (u: DirectoryUser) => {
    mutateUser(u.id, (x) =>
      addAudit({ ...x, status: "Active", licenseState: "Verified" }, "Credentials verified by Governance Console")
    );
    pushToast(`${u.name}'s medical license verified`, "success");
  };

  const revokeLicense = (u: DirectoryUser) => {
    mutateUser(u.id, (x) =>
      addAudit({ ...x, status: "Suspended", licenseState: "Revoked" }, "Credentials revoked by Governance Console")
    );
    pushToast(`${u.name}'s credentials revoked and account suspended`, "danger");
  };

  /* ---------------------------- incident actions ---------------------------- */
  const simulateSos = async () => {
    const loc = pick(SIM_LOCATIONS);
    const patient = pick(SIM_PATIENTS);
    const seq = incidentSeq.current++;
    const draft: Incident = {
      id: `SOS-${seq}`,
      createdAt: new Date().toISOString(),
      patientName: patient,
      passportId: `HP-IN-${randInt(100000, 999999)}`,
      urgency: pick(URGENCIES),
      status: "ACTIVE",
      lat: Number((loc.lat + (Math.random() - 0.5) * 0.04).toFixed(5)),
      lng: Number((loc.lng + (Math.random() - 0.5) * 0.04).toFixed(5)),
      bloodGroup: pick(BLOOD_GROUPS),
      agent: "Unassigned",
      city: loc.city,
    };
    upsertIncident(draft);
    pushToast(`Simulated SOS ${draft.id} (${draft.urgency}) added to the Incident Queue`, "danger");
    try {
      const { data, error } = await supabase
        .from("sos_incidents")
        .insert({
          patient_name: draft.patientName,
          health_passport_id: draft.passportId,
          urgency_status: draft.urgency,
          status: draft.status,
          latitude: draft.lat,
          longitude: draft.lng,
          blood_group: draft.bloodGroup,
          assigned_agent: draft.agent,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        const persisted = mapIncidentRow(data);
        setIncidents((prev) => prev.filter((i) => i.id !== draft.id));
        upsertIncident({ ...draft, ...persisted });
        pushToast(`SOS ${persisted.id} persisted to Supabase`, "success");
      }
    } catch {
      pushToast("Supabase insert unavailable - incident kept in local state", "warning");
    }
  };

  const persistIncidentPatch = async (id: string, patch: Record<string, string>) => {
    try {
      await supabase.from("sos_incidents").update(patch).eq("id", id);
    } catch {
      /* local state remains the source of truth when the table is unreachable */
    }
  };

  const advanceIncident = (inc: Incident) => {
    if (inc.status === "RESOLVED") return;
    const next: IncidentStatus = inc.status === "ACTIVE" ? "DISPATCHED" : "RESOLVED";
    upsertIncident({ ...inc, status: next });
    persistIncidentPatch(inc.id, { status: next });
    pushToast(`${inc.id} transitioned to ${next}`, next === "RESOLVED" ? "success" : "warning");
  };

  const reassignAgent = (inc: Incident, agent: string) => {
    upsertIncident({ ...inc, agent });
    persistIncidentPatch(inc.id, { assigned_agent: agent });
    pushToast(`${inc.id} reassigned to ${agent}`, "info");
  };

  const copyCoords = async (inc: Incident) => {
    const text = `${inc.lat}, ${inc.lng}`;
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`Coordinates ${text} copied`, "success");
    } catch {
      pushToast(`Copy unavailable - coordinates: ${text}`, "warning");
    }
  };

  /* ---------------------------- header actions ---------------------------- */
  const refreshAll = async () => {
    await fetchIncidents(false);
    setLastHeartbeat(new Date().toISOString());
    pushToast("System refresh complete", "success");
  };

  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      telemetry: {
        totalUsers: users.length,
        roleCounts,
        activeSos: activeSosCount,
        dispatchLatencySeconds: dispatchLatency,
        channelStatus,
      },
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        passportId: u.passportId,
        role: u.role,
        status: u.status,
        licenseState: u.licenseState,
      })),
      incidentQueue: incidents,
      certificateScans: certs,
      researchPipeline: { records: pipelineCount, piiFieldsStripped: piiStripped, kAnonymity: kAnon },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curapulse-governance-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast("Governance report exported", "success");
  };

  const runLatencyPing = () => {
    if (pinging) return;
    setPinging(true);
    window.setTimeout(() => {
      const v = randInt(38, 45);
      setDispatchLatency(v);
      setPinging(false);
      pushToast(`Latency diagnostic complete: ${v}s average dispatch time`, "info");
    }, 900);
  };

  const manualReconnect = () => {
    setChannelStatus("RECONNECTING");
    setReconnectKey((k) => k + 1);
    fetchIncidents(true);
    pushToast("Realtime channel resync requested", "info");
  };

  /* ---------------------------- certificate actions ---------------------------- */
  const rescanCert = (c: CertRecord) => {
    if (scanning[c.id]) return;
    setScanning((s) => ({ ...s, [c.id]: true }));
    window.setTimeout(() => {
      setCerts((prev) =>
        prev.map((x) => {
          if (x.id !== c.id) return x;
          const anomalous = x.score < 80;
          const score = anomalous
            ? Number((Math.max(18, Math.min(79, x.score + (Math.random() * 6 - 3)))).toFixed(1))
            : Number((Math.min(99.9, Math.max(90, x.score + (Math.random() * 1.6 - 0.8)))).toFixed(1));
          return { ...x, score, scannedAt: new Date().toISOString() };
        })
      );
      setScanning((s) => ({ ...s, [c.id]: false }));
      pushToast(`Deep rescan finished for ${c.doctor} (${c.id})`, "info");
    }, 1000);
  };

  const flagCert = (c: CertRecord) => {
    setCerts((prev) => prev.map((x) => (x.id === c.id ? { ...x, flagged: !x.flagged } : x)));
    pushToast(
      c.flagged ? `Flag removed from ${c.doctor}'s credential` : `${c.doctor}'s credential flagged for manual review`,
      c.flagged ? "info" : "warning"
    );
  };

  /* ---------------------------- pipeline actions ---------------------------- */
  const batchAnonymize = async () => {
    if (batchBusy) return;
    setBatchBusy(true);
    const id = hashId.current++;
    const batchName = `BATCH-${String(id).padStart(4, "0")}`;
    const hash = await sha256Hex(`${batchName}-${Date.now()}-${Math.random()}`);
    setPipelineCount((c) => c + 25);
    setPiiStripped((p) => p + 25 * 11);
    setHashLog((prev) => [{ id, batch: batchName, hash, records: 25, at: new Date().toISOString() }, ...prev].slice(0, 6));
    setBatchBusy(false);
    pushToast(`${batchName}: 25 records anonymized and hashed`, "success");
  };

  const togglePipeline = () => {
    setPipelineActive((a) => {
      pushToast(a ? "Auto-Anonymization Pipeline paused" : "Auto-Anonymization Pipeline resumed", a ? "warning" : "success");
      return !a;
    });
  };

  /* ---------------------------- keyboard: close dialogs ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPassportUser(null);
        setMapIncident(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const latencyPct = Math.min(100, Math.round((dispatchLatency / 60) * 100));

  /* ---------------------------- redesign render ---------------------------- */
  const view = useViewState("desktop");
  const P = view.isPhone;
  const [manageAction, setManageAction] = useState<"suspend" | "verify" | "revoke" | null>(null);
  const [manageReason, setManageReason] = useState("");
  const [manageConfirm, setManageConfirm] = useState(false);

  const allAudit = useMemo(
    () =>
      users
        .flatMap((u) => u.audit.map((a) => ({ ...a, user: u })))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [users]
  );

  const n = range === "7d" ? 7 : 30;
  const dayLabels = useMemo(() => {
    if (!mounted) return [] as string[];
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.now() - (n - 1 - i) * 86400000);
      return n === 7 ? d.toLocaleDateString("en-IN", { weekday: "short" }) : i % 5 === 0 || i === n - 1 ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";
    });
  }, [n, mounted]);
  const sosSeries = useMemo(() => {
    const s = seriesFor(n === 7 ? 17 : 41, n, 3, 14);
    s[s.length - 1] = Math.max(s[s.length - 1], activeSosCount);
    return s;
  }, [n, activeSosCount]);
  const resolvedSeries = useMemo(() => sosSeries.map((v, i) => Math.max(0, v - (seriesFor(n + 3, n, 0, 3)[i] ?? 0))), [sosSeries, n]);

  const doctors = users.filter((u) => u.role === "Doctor");
  const verifiedActive = doctors.filter((d) => d.licenseState === "Verified" && d.status === "Active").length;
  const pendingDocs = doctors.filter((d) => d.licenseState === "Pending").length;

  const channelTone = channelStatus === "CONNECTED" ? "ok" : channelStatus === "RECONNECTING" ? "warn" : "crit";
  const channelLabel = channelStatus === "CONNECTED" ? "Realtime connected" : channelStatus === "RECONNECTING" ? "Reconnecting" : "Disconnected";

  const urgencyTone = (u: Urgency) => (u === "CRITICAL" ? "crit" : u === "HIGH" ? "warn" : "info");
  const statusTone = (s: IncidentStatus) => (s === "RESOLVED" ? "ok" : s === "DISPATCHED" ? "brand" : "warn");
  const statusLabel = (s: IncidentStatus) => (s === "RESOLVED" ? "Resolved" : s === "DISPATCHED" ? "Dispatched" : "Active");

  const openManage = (u: DirectoryUser) => {
    setPassportUser(u);
    setManageAction(null);
    setManageReason("");
    setManageConfirm(false);
  };

  const applyManage = () => {
    const u = passportUser;
    if (!u || !manageAction) return;
    if (manageReason.trim().length < 6 || !manageConfirm) return;
    if (manageAction === "suspend") toggleSuspend(u);
    else if (manageAction === "verify") verifyLicense(u);
    else revokeLicense(u);
    mutateUser(u.id, (x) => addAudit(x, `Reason recorded: ${manageReason.trim()}`));
    setManageAction(null);
    setManageReason("");
    setManageConfirm(false);
  };

  const header = (title: string, sub: string, right?: React.ReactNode) =>
    P ? (
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-ink">{title}</h1>
        <p className="text-[13.5px] text-ink-muted">{sub}</p>
        {right && <div className="mt-3 flex flex-wrap gap-2">{right}</div>}
      </div>
    ) : (
      <PageTitle title={title} sub={sub} right={right} />
    );

  const incidentRow = (i: Incident) => (
    <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-bold text-ink">
          {i.patientName} <span className="tabular text-[12.5px] font-semibold text-ink-muted">{i.id}</span>
        </p>
        <p className="text-[12.5px] text-ink-muted">
          {i.city} · {relativeTime(i.createdAt, now)} · {i.agent}
        </p>
      </div>
      <Badge tone={urgencyTone(i.urgency)}>{i.urgency === "CRITICAL" ? "Critical" : i.urgency === "HIGH" ? "High" : "Moderate"}</Badge>
      <Badge tone={statusTone(i.status)} noIcon={i.status === "DISPATCHED"}>
        {statusLabel(i.status)}
      </Badge>
    </li>
  );

  /* ---------------------------- sections ---------------------------- */
  const renderOverview = () => (
    <div>
      {header(
        "Overview",
        "Platform health across patients, doctors and the Support Desk",
        <>
          <Segmented
            value={range}
            onChange={(v) => setRange(v as "7d" | "30d")}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
            ]}
          />
          <Button size="sm" variant="quiet" loading={loading} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void refreshAll()}>
            Refresh
          </Button>
        </>
      )}
      <div className={cx("mb-5 grid gap-3", P ? "grid-cols-2" : "grid-cols-4")}>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Registered patients</p>
          <p className="tabular text-[28px] font-bold text-ink">{roleCounts.Patient}</p>
          <p className="text-[12.5px] text-ink-muted">In the demo directory</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Verified, active doctors</p>
          <p className="tabular text-[28px] font-bold text-ink">
            {verifiedActive}
            <span className="text-[16px] text-ink-muted">/{doctors.length}</span>
          </p>
          <p className="text-[12.5px] text-ink-muted">{pendingDocs} pending review</p>
        </Card>
        <Card tone={activeSosCount > 0 ? "emergency" : "plain"} className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Active SOS</p>
          <p className={cx("tabular text-[28px] font-bold", activeSosCount > 0 ? "text-coral-dark" : "text-ink")}>{activeSosCount}</p>
          <Badge tone={channelTone}>{channelStatus === "CONNECTED" ? "Live" : "Not live"}</Badge>
        </Card>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Median time to agent</p>
          <p className="tabular text-[28px] font-bold text-ink">{dispatchLatency}s</p>
          <p className="text-[12.5px] text-ink-muted">Goal under 42s</p>
        </Card>
      </div>

      <div className={cx("grid gap-4", P ? "grid-cols-1" : "grid-cols-[2fr_1fr]")}>
        <Card className="p-5">
          <CardHeader title="SOS alerts" sub={`Raised and resolved per day, last ${range === "7d" ? "7" : "30"} days`} />
          {mounted && (
            <LineChart
              labels={dayLabels}
              series={[
                { name: "Raised", values: sosSeries },
                { name: "Resolved", values: resolvedSeries, dashed: true, marker: "square" },
              ]}
              min={0}
              max={16}
              height={P ? 170 : 220}
              showValues={range === "7d"}
            />
          )}
        </Card>
        <Card className="p-5">
          <CardHeader title="Realtime health" right={<Badge tone={channelTone}>{channelLabel}</Badge>} />
          <dl className="space-y-2 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Socket latency</dt>
              <dd className="tabular font-semibold text-ink">{channelStatus === "CONNECTED" ? `${wsLatency} ms` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Last heartbeat</dt>
              <dd className="tabular text-ink">{relativeTime(lastHeartbeat, now)}</dd>
            </div>
            <div>
              <div className="mb-1 flex justify-between">
                <dt className="text-ink-muted">Dispatch time vs 60s limit</dt>
                <dd className="tabular text-ink">{dispatchLatency}s</dd>
              </div>
              <ProgressBar value={latencyPct} tone={dispatchLatency > 42 ? "warn" : "brand"} />
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button size="sm" variant="quiet" onClick={manualReconnect}>
              Reconnect
            </Button>
            <Button size="sm" variant="quiet" loading={pinging} onClick={runLatencyPing}>
              Ping
            </Button>
          </div>
        </Card>
      </div>

      <div className={cx("mt-4 grid gap-4", P ? "grid-cols-1" : "grid-cols-2")}>
        <Card className="p-5">
          <CardHeader title="Dispatch performance" sub="Average minutes from SOS to ambulance on the way, by unit" />
          <BarChart labels={["Alpha", "Bravo", "Charlie", "Delta", "Echo"]} values={[4.2, 5.1, 3.8, 6.4, 4.9]} height={160} />
        </Card>
        <Card className="p-5">
          <CardHeader
            title="Incident queue"
            right={
              <Button size="sm" variant="tertiary" onClick={() => setSection("incidents")}>
                See all
              </Button>
            }
          />
          <ul>{incidents.slice(0, 5).map(incidentRow)}</ul>
        </Card>
      </div>
    </div>
  );

  const renderIncidents = () => (
    <div>
      {header(
        "Incidents",
        `${incidents.length} in the queue · ${activeSosCount} active`,
        <>
          <Badge tone={channelTone}>{channelLabel}</Badge>
          <Button size="sm" variant="emergencyOutline" icon={<Siren className="h-4 w-4" />} onClick={() => void simulateSos()}>
            Simulate SOS
          </Button>
        </>
      )}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["ALL", ...INCIDENT_STATUSES] as const).map((s) => (
          <ChoiceChip key={s} on={incStatusFilter === s} onClick={() => setIncStatusFilter(s)} className="!h-8 !px-3 !text-[12.5px]">
            {s === "ALL" ? "All statuses" : statusLabel(s)}
          </ChoiceChip>
        ))}
        <span className="mx-1 w-px bg-line" aria-hidden />
        {(["ALL", ...URGENCIES] as const).map((u) => (
          <ChoiceChip key={u} on={incUrgencyFilter === u} onClick={() => setIncUrgencyFilter(u)} className="!h-8 !px-3 !text-[12.5px]">
            {u === "ALL" ? "Any urgency" : u === "CRITICAL" ? "Critical" : u === "HIGH" ? "High" : "Moderate"}
          </ChoiceChip>
        ))}
      </div>
      <div className={cx("grid gap-3", P ? "grid-cols-1" : "grid-cols-2")}>
        {filteredIncidents.map((i) => (
          <Card key={i.id} className={cx("p-4", i.status === "ACTIVE" && i.urgency === "CRITICAL" && "border-l-4 border-l-coral")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15.5px] font-bold text-ink">{i.patientName}</p>
                <p className="tabular text-[12.5px] text-ink-muted">
                  {i.id} · {i.passportId} · Blood {i.bloodGroup}
                </p>
                <p className="text-[12.5px] text-ink-muted">
                  {i.city} · {formatDateTime(i.createdAt)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={urgencyTone(i.urgency)}>{i.urgency === "CRITICAL" ? "Critical" : i.urgency === "HIGH" ? "High" : "Moderate"}</Badge>
                <Badge tone={statusTone(i.status)} noIcon={i.status === "DISPATCHED"}>
                  {statusLabel(i.status)}
                </Badge>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <select aria-label={`Assign agent for ${i.id}`} value={i.agent} onChange={(e) => reassignAgent(i, e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-2 text-[13px] text-ink">
                {AGENTS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <Button size="sm" variant="quiet" icon={<Copy className="h-4 w-4" />} onClick={() => void copyCoords(i)} aria-label="Copy coordinates">
                {P ? "" : "Coords"}
              </Button>
              <Button size="sm" variant="quiet" icon={<MapPin className="h-4 w-4" />} onClick={() => setMapIncident(i)}>
                Map
              </Button>
              {i.status !== "RESOLVED" && (
                <Button size="sm" onClick={() => advanceIncident(i)}>
                  {i.status === "ACTIVE" ? "Mark dispatched" : "Mark resolved"}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {filteredIncidents.length === 0 && <Card className="p-6 text-center text-ink-muted">No incidents match these filters.</Card>}
    </div>
  );

  const managePanel = (u: DirectoryUser) => {
    const isDoc = u.role === "Doctor";
    const actions: { key: "suspend" | "verify" | "revoke"; label: string; show: boolean; tone: "secondary" | "emergencyOutline" | "primary" }[] = [
      { key: "suspend", label: u.status === "Suspended" ? "Reactivate profile" : "Suspend profile", show: true, tone: "secondary" },
      { key: "verify", label: "Verify doctor", show: isDoc && u.licenseState !== "Verified", tone: "primary" },
      { key: "revoke", label: "Revoke licence", show: isDoc && u.licenseState !== "Revoked", tone: "emergencyOutline" },
    ];
    return (
      <Card className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar initials={initials(u.name)} size={48} tone={isDoc ? "sage" : "mist"} />
            <div className="min-w-0">
              <p className="text-[17px] font-bold text-ink">{u.name}</p>
              <p className="truncate text-[13px] text-ink-muted">{u.email}</p>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={() => setPassportUser(null)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-canvas">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="neutral" noIcon>
            {u.role}
          </Badge>
          <Badge tone={u.status === "Active" ? "ok" : u.status === "Suspended" ? "crit" : "warn"}>{u.status}</Badge>
          {isDoc && <Badge tone={u.licenseState === "Verified" ? "ok" : u.licenseState === "Revoked" ? "crit" : "warn"}>Licence {u.licenseState.toLowerCase()}</Badge>}
          <Badge tone={u.twoFA ? "ok" : "warn"}>{u.twoFA ? "2FA on" : "2FA off"}</Badge>
        </div>
        <dl className="mt-4 space-y-1.5 text-[14px]">
          {[
            ["Passport ID", u.passportId],
            ...(isDoc ? [["Specialty", u.specialty ?? "—"], ["Licence no.", u.licenseNo ?? "—"]] : [["Blood group", u.bloodGroup], ["Allergies", u.allergies.join(", ") || "None"]]),
            ["Joined", formatDate(u.joined)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="tabular text-right font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <Eyebrow className="mt-4">Actions</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {actions
            .filter((a) => a.show)
            .map((a) => (
              <ChoiceChip key={a.key} on={manageAction === a.key} onClick={() => setManageAction(manageAction === a.key ? null : a.key)}>
                {a.label}
              </ChoiceChip>
            ))}
        </div>
        {manageAction && (
          <div className="mt-3 space-y-2.5 rounded-xl border border-line bg-canvas p-3">
            <Field label="Reason (saved to the audit history)" htmlFor="mg-reason">
              <textarea id="mg-reason" rows={2} value={manageReason} onChange={(e) => setManageReason(e.target.value)} className={cx(inputCls, "h-auto py-2 text-[14px]")} />
            </Field>
            <Checkbox checked={manageConfirm} onChange={setManageConfirm}>
              I confirm this change for {u.name}
            </Checkbox>
            <Button full variant={manageAction === "revoke" || (manageAction === "suspend" && u.status !== "Suspended") ? "emergency" : "primary"} disabled={manageReason.trim().length < 6 || !manageConfirm} onClick={applyManage}>
              Confirm {actions.find((a) => a.key === manageAction)?.label.toLowerCase()}
            </Button>
          </div>
        )}
        <Eyebrow className="mt-4">Audit history</Eyebrow>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {u.audit.slice(0, 6).map((a, idx) => (
            <li key={idx} className="flex justify-between gap-3">
              <span className="text-ink">{a.action}</span>
              <span className="shrink-0 text-ink-muted">{relativeTime(a.at, now)}</span>
            </li>
          ))}
        </ul>
      </Card>
    );
  };

  const renderDirectory = () => {
    if (P && passportUser) {
      return (
        <div>
          <button type="button" onClick={() => setPassportUser(null)} className="mb-3 flex items-center gap-1 text-[14px] font-semibold text-brand">
            <ArrowLeft className="h-4 w-4" /> Directory
          </button>
          {managePanel(passportUser)}
        </div>
      );
    }
    return (
      <div>
        {header("Directory", `${users.length} accounts across patients, doctors and Support Desk`)}
        <div className="mb-3 space-y-2">
          <input aria-label="Search directory" placeholder="Search name, email, passport or licence" value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} />
          <div className="flex flex-wrap gap-1.5">
            {(["All", "Patient", "Doctor", "Support Desk"] as const).map((r) => (
              <ChoiceChip key={r} on={roleTab === r} onClick={() => setRoleTab(r)} className="!h-8 !px-3 !text-[12.5px]">
                {r === "All" ? `All (${users.length})` : `${r} (${roleCounts[r]})`}
              </ChoiceChip>
            ))}
            <select aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-8 rounded-full border border-line-strong bg-white px-3 text-[12.5px] font-semibold text-ink">
              {["All Statuses", "Active", "Suspended", "Pending Review"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={cx("grid gap-4", P ? "grid-cols-1" : passportUser ? "grid-cols-[3fr_2fr]" : "grid-cols-1")}>
          <Card className="divide-y divide-line overflow-hidden">
            {filteredUsers.length === 0 && <p className="p-6 text-center text-ink-muted">No accounts match.</p>}
            {filteredUsers.map((u) => (
              <div key={u.id} className={cx("flex items-center gap-3 p-3.5", passportUser?.id === u.id && "bg-sage")}>
                <Avatar initials={initials(u.name)} size={40} tone={u.role === "Doctor" ? "sage" : u.role === "Support Desk" ? "lav" : "mist"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold text-ink">{u.name}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {u.role} · {u.role === "Doctor" ? u.licenseNo ?? u.passportId : u.passportId}
                  </p>
                </div>
                {!P && <Badge tone={u.status === "Active" ? "ok" : u.status === "Suspended" ? "crit" : "warn"}>{u.status}</Badge>}
                <Button size="sm" variant="quiet" onClick={() => openManage(u)}>
                  Manage
                </Button>
              </div>
            ))}
          </Card>
          {!P && passportUser && managePanel(passportUser)}
        </div>
      </div>
    );
  };

  const renderGovernance = () => {
    const picked = allAudit[auditPick];
    return (
      <div>
        {header(
          "Governance",
          "Audit history and credential integrity",
          <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportReport}>
            Export
          </Button>
        )}
        <div className={cx("grid gap-4", P ? "grid-cols-1" : "grid-cols-2")}>
          <Card className="p-5">
            <CardHeader title="Audit history" sub="Every admin and doctor action on patient data" />
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {allAudit.map((a, idx) => (
                <li key={`${a.user.id}-${idx}`}>
                  <button type="button" onClick={() => setAuditPick(idx)} className={cx("flex w-full items-start justify-between gap-3 px-1 py-2.5 text-left text-[13.5px]", idx === auditPick ? "bg-sage" : "hover:bg-canvas")}>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{a.action}</span>
                      <span className="block text-[12.5px] text-ink-muted">{a.user.name}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-ink-muted">{relativeTime(a.at, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <CardHeader title="Payload inspector" sub="The stored record for the selected entry" />
            {picked ? (
              <pre className="max-h-[360px] overflow-auto rounded-xl bg-ink p-3 text-[12px] leading-relaxed text-white">
                {JSON.stringify({ at: picked.at, action: picked.action, subject: { id: picked.user.id, role: picked.user.role, passportId: picked.user.passportId }, actor: "Governance Console" }, null, 2)}
              </pre>
            ) : (
              <p className="text-[14px] text-ink-muted">No entries.</p>
            )}
          </Card>
        </div>
        <Card className="mt-4 p-5">
          <CardHeader title="Certificate integrity inspector" sub="AI scan of uploaded medical credentials" right={<Badge tone="lav">Simulated</Badge>} />
          <div className={cx("grid gap-3", P ? "grid-cols-1" : "grid-cols-2")}>
            {certs.map((c) => (
              <div key={c.id} className={cx("rounded-xl border p-3.5", c.score < 80 ? "border-caution-line bg-caution-tint" : "border-line")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-bold text-ink">{c.doctor}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {c.credential} · {c.university}
                    </p>
                  </div>
                  <Badge tone={c.score >= 90 ? "ok" : c.score >= 80 ? "info" : "warn"}>{c.score.toFixed(1)}%</Badge>
                </div>
                <p className="mt-1 text-[13px] text-ink">{c.flag}</p>
                <p className="text-[12px] text-ink-muted">Scanned {relativeTime(c.scannedAt, now)}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="quiet" loading={!!scanning[c.id]} onClick={() => rescanCert(c)}>
                    Rescan
                  </Button>
                  <Button size="sm" variant={c.flagged ? "secondary" : "quiet"} onClick={() => flagCert(c)}>
                    {c.flagged ? "Flagged · remove" : "Flag for review"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  };

  const renderReports = () => (
    <div>
      {header(
        "Reports",
        "Research data pipeline and privacy safeguards",
        <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportReport}>
          Export report
        </Button>
      )}
      <Alert tone="lav" className="mb-4" title="Only opted-in patients are included">
        Records are stripped of names, phone numbers and exact locations before researchers see them. Pipeline figures here are simulated for the demo.
      </Alert>
      <div className={cx("mb-4 grid gap-3", P ? "grid-cols-1" : "grid-cols-3")}>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Anonymised records</p>
          <p className="tabular text-[26px] font-bold text-ink">{pipelineCount.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Personal fields removed</p>
          <p className="tabular text-[26px] font-bold text-ink">{piiStripped.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">k-anonymity (higher is safer)</p>
          <p className="tabular text-[26px] font-bold text-ink">{kAnon.toFixed(2)}</p>
          <Badge tone={kAnon >= 5 ? "ok" : "warn"}>{kAnon >= 5 ? "Above minimum of 5" : "Below minimum"}</Badge>
        </Card>
      </div>
      <Card className="p-5">
        <CardHeader
          title="Anonymisation pipeline"
          sub={pipelineActive ? "Running" : "Paused"}
          right={
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{pipelineActive ? "On" : "Off"}</span>
              <Toggle on={pipelineActive} onChange={togglePipeline} label="Pipeline running" />
            </div>
          }
        />
        <Button variant="secondary" loading={batchBusy} onClick={() => void batchAnonymize()}>
          Run a batch of 25 now
        </Button>
        <Eyebrow className="mt-4">Batch hashes</Eyebrow>
        {hashLog.length === 0 ? (
          <p className="mt-1 text-[14px] text-ink-muted">No manual batches this session.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {hashLog.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="font-semibold text-ink">
                  {h.batch} · {h.records} records
                </span>
                <span className="tabular truncate text-ink-muted">{h.hash.slice(0, 24)}…</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  const nav = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "incidents", label: "Incidents", icon: Siren, badge: activeSosCount || undefined },
    { key: "directory", label: "Directory", icon: Users },
    { key: "governance", label: P ? "Audit" : "Governance", icon: ScrollText },
    { key: "reports", label: "Reports", icon: FileBarChart },
  ];

  const overlay = (
    <>
      {mapIncident && (
        <div className={cx("z-[90] flex items-center justify-center bg-ink/50 p-4", P ? "absolute inset-0" : "fixed inset-0")} role="dialog" aria-modal="true" aria-label="Incident map" onClick={() => setMapIncident(null)}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-frame" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3">
              <p className="text-[15px] font-bold text-ink">
                {mapIncident.id} · {mapIncident.city}
              </p>
              <button type="button" aria-label="Close map" onClick={() => setMapIncident(null)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-canvas">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title="Incident location"
              className="h-72 w-full border-0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapIncident.lng - 0.01}%2C${mapIncident.lat - 0.007}%2C${mapIncident.lng + 0.01}%2C${mapIncident.lat + 0.007}&layer=mapnik&marker=${mapIncident.lat}%2C${mapIncident.lng}`}
            />
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className={cx("flex flex-col gap-2", P ? "absolute bottom-20 left-3 right-3" : "fixed bottom-6 right-6 w-[360px]")}>
          {toasts.slice(-3).map((t) => (
            <Toast key={t.id} msg={t.message} tone={t.tone === "danger" ? "crit" : t.tone === "warning" ? "warn" : t.tone === "info" ? "info" : "ok"} onClose={() => dismissToast(t.id)} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <Shell
      requireRole="admin"
      view={view}
      product="Admin console"
      nav={nav}
      active={section}
      onNav={(k) => {
        setSection(k as AdminView);
        setPassportUser(null);
        document.getElementById("cp-scroll")?.scrollTo({ top: 0 });
      }}
      user={{ name: "Platform admin", sub: "Governance", initials: "AD" }}
      overlay={mounted ? overlay : undefined}
    >
      <div className={cx(P && "px-4 py-4")}>
        {!mounted ? (
          <div className="flex items-center gap-2 p-10 text-[14px] text-ink-muted">
            <Activity className="h-4 w-4 animate-pulse" /> Loading admin console…
          </div>
        ) : section === "overview" ? (
          renderOverview()
        ) : section === "incidents" ? (
          renderIncidents()
        ) : section === "directory" ? (
          renderDirectory()
        ) : section === "governance" ? (
          renderGovernance()
        ) : (
          renderReports()
        )}
      </div>
    </Shell>
  );
}
