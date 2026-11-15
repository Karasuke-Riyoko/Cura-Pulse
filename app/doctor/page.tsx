"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileSignature,
  FileUp,
  HeartPulse,
  ListOrdered,
  MessageCircle,
  Pill,
  Plus,
  Printer,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  Stethoscope,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { supabase as sharedSupabase } from "@/lib/supabase";
import { Shell, useViewState } from "@/components/Shell";
import { LiveChatInbox } from "@/components/LiveChatInbox";
import { readSession, writeSession, fullName as sessionName } from "@/lib/auth";
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
  PageTitle,
  Segmented,
  Timeline,
  Toast,
  Toggle,
  cx,
  inputCls,
  inputErrCls,
} from "@/components/ui";

const supabase = sharedSupabase;

/*  TYPES                                                                     */
/* -------------------------------------------------------------------------- */

type Gender = "Male" | "Female";
type ConsultStatus = "Waiting" | "In Consultation" | "Prescription Issued";
type FilterKey = "All" | "SOS / Critical" | "Walk-in" | "Completed";
type VitalType = "Fasting" | "Post-Prandial";
type ToastKind = "success" | "cloud" | "warn" | "info";
type CloudState = "connecting" | "live" | "offline";
type ChaperoneStatus = "not-requested" | "pending" | "assigned";

interface VitalReading {
  id: string;
  label: string;
  systolic: number;
  diastolic: number;
  sugar: number;
  sugarType: VitalType;
  source: "Home Log" | "Clinic Spot";
}

interface ChaperoneInfo {
  requested: boolean;
  status: ChaperoneStatus;
  attendantName: string;
  attendantId: string;
  confirmedAt: string;
  log: string[];
}

interface RxMedicine {
  id: string;
  name: string;
  dosage: string;
  duration: string;
  instructions: string;
  allergyOverride: boolean;
}

interface RxDraft {
  diagnosis: string;
  findings: string;
  meds: RxMedicine[];
  adviceChips: string[];
  adviceNote: string;
}

interface IssuedRx {
  hash: string;
  issuedAt: string;
  diagnosis: string;
  findings: string;
  meds: RxMedicine[];
  advice: string[];
  bloodGroup: string;
  allergies: string[];
  vitalsSnapshot: string;
  chaperoneBadge: string;
}

interface Patient {
  id: string;
  token: string;
  name: string;
  age: number;
  gender: Gender;
  bay: string;
  slot: string;
  hasActiveSOS: boolean;
  severeChestPainFlag: boolean;
  chiefComplaint: string;
  bloodGroup: string;
  allergies: string[];
  chronic: string[];
  status: ConsultStatus;
  chaperone: ChaperoneInfo;
  vitals: VitalReading[];
  prescription: IssuedRx | null;
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

/* -------------------------------------------------------------------------- */
/*  CONSTANTS & PRESETS                                                       */
/* -------------------------------------------------------------------------- */

const DOCTOR = {
  name: "Dr. Sunita Sharma",
  title: "Cardiology & General Medicine",
  hospital: "Max Super Speciality Hospital, Saket",
  nmc: "#DL-2018-09412",
};

const STATUS_RANK: Record<ConsultStatus, number> = {
  Waiting: 0,
  "In Consultation": 1,
  "Prescription Issued": 2,
};

const FILTERS: FilterKey[] = ["All", "SOS / Critical", "Walk-in", "Completed"];

const MED_PRESETS: { name: string; dosage: string; duration: string }[] = [
  { name: "Tab. Ecosprin 75mg", dosage: "0-0-1 After Food", duration: "Continue Long-term" },
  { name: "Tab. Atorvastatin 40mg", dosage: "0-0-1 At Bedtime", duration: "1 Month" },
  { name: "Tab. Metoprolol Succinate 25mg", dosage: "1-0-0 Before Breakfast", duration: "1 Month" },
  { name: "Tab. Telmisartan 40mg", dosage: "1-0-0 Before Breakfast", duration: "1 Month" },
  { name: "Tab. Sorbitrate 5mg", dosage: "SOS Sublingual", duration: "14 Days" },
];

const DOSAGE_PATTERNS = [
  "1-0-1 After Food",
  "1-0-0 Before Breakfast",
  "0-0-1 At Bedtime",
  "SOS Sublingual",
  "1-1-1 After Food",
  "0-1-0 After Lunch",
];

const DURATION_PRESETS = ["14 Days", "1 Month", "3 Months", "Continue Long-term"];

const ADVICE_CHIPS = [
  "Low-sodium cardiac diet (<2g/day)",
  "12-Lead ECG & Troponin-I stat",
  "Avoid strenuous exertion",
  "Review in 7 days with BP log",
  "Echocardiography (2D Echo) advised",
  "Monitor blood sugar twice daily",
];

const NURSES = [
  { name: "Nurse Kavita Sharma", id: "NR-409" },
  { name: "Nurse Anjali Verma", id: "NR-512" },
  { name: "Nurse Sunita Rawat", id: "NR-377" },
  { name: "Nurse Priya Nair", id: "NR-286" },
];

const DRUG_GROUPS: { allergyWords: string[]; drugWords: string[] }[] = [
  {
    allergyWords: ["penicillin", "amoxicillin", "ampicillin"],
    drugWords: [
      "penicillin",
      "amoxicillin",
      "amoxyclav",
      "augmentin",
      "ampicillin",
      "cloxacillin",
      "flucloxacillin",
      "piperacillin",
      "clavulan",
    ],
  },
  {
    allergyWords: ["sulfa", "sulpha", "sulfonamide"],
    drugWords: ["sulfa", "sulpha", "sulfamethoxazole", "cotrimoxazole", "co-trimoxazole", "bactrim", "septran", "sulfasalazine"],
  },
  {
    allergyWords: ["aspirin", "nsaid", "ecosprin", "ibuprofen"],
    drugWords: [
      "aspirin",
      "ecosprin",
      "disprin",
      "ibuprofen",
      "brufen",
      "diclofenac",
      "voveran",
      "naproxen",
      "nimesulide",
      "ketorolac",
      "aceclofenac",
      "combiflam",
    ],
  },
  {
    allergyWords: ["iodine", "contrast"],
    drugWords: ["iodine", "iohexol", "iopamidol", "contrast", "betadine"],
  },
];

const WALKIN_POOL: {
  name: string;
  age: number;
  gender: Gender;
  bloodGroup: string;
  complaint: string;
  allergies: string[];
  chronic: string[];
}[] = [
  {
    name: "Ramesh Pillai",
    age: 61,
    gender: "Male",
    bloodGroup: "B+ve",
    complaint: "Exertional chest tightness for 3 days, relieved by rest",
    allergies: ["Sulfa Drugs"],
    chronic: ["Hypertension (Stage 1)"],
  },
  {
    name: "Fatima Sheikh",
    age: 49,
    gender: "Female",
    bloodGroup: "A+ve",
    complaint: "Intermittent palpitations and light-headedness since last week",
    allergies: ["Penicillin (Rash)"],
    chronic: ["Hypothyroidism"],
  },
  {
    name: "Gurmeet Kaur Sandhu",
    age: 56,
    gender: "Female",
    bloodGroup: "O-ve",
    complaint: "Breathlessness on climbing stairs, mild pedal edema",
    allergies: ["Aspirin/NSAIDs (Gastritis)"],
    chronic: ["Type 2 Diabetes Mellitus", "Hypertension (Stage 2)"],
  },
];

const WALKIN_BAYS = ["Cardiac Bay 01", "Cardiac Bay 05", "Cardiac Bay 07"];

/* -------------------------------------------------------------------------- */
/*  SEED DATA (OFFLINE / DEMO READY)                                          */
/* -------------------------------------------------------------------------- */

const DAY_LABELS = ["09 Nov", "10 Nov", "11 Nov", "12 Nov", "13 Nov", "14 Nov", "15 Nov"];

function seedVitals(prefix: string, sys: number[], dia: number[], sugar: number[]): VitalReading[] {
  return sys.map((s, i) => ({
    id: `${prefix}-v${i}`,
    label: DAY_LABELS[i],
    systolic: s,
    diastolic: dia[i],
    sugar: sugar[i],
    sugarType: i % 2 === 0 ? "Fasting" : "Post-Prandial",
    source: "Home Log",
  }));
}

const SEED_PATIENTS: Patient[] = [
  {
    id: "CP-101",
    token: "CP-101",
    name: "Suresh Chandra Verma",
    age: 58,
    gender: "Male",
    bay: "Cardiac Bay 04",
    slot: "10:15 AM - Immediate",
    hasActiveSOS: true,
    severeChestPainFlag: true,
    chiefComplaint:
      "Severe central chest pain radiating to left arm and jaw for the last 40 minutes with profuse sweating (diaphoresis), nausea and breathlessness at rest.",
    bloodGroup: "O+ve",
    allergies: ["Penicillin (Anaphylaxis)", "Sulfa Drugs"],
    chronic: ["Hypertension (Stage 2)", "Type 2 Diabetes Mellitus", "Dyslipidemia"],
    status: "In Consultation",
    chaperone: {
      requested: false,
      status: "not-requested",
      attendantName: "",
      attendantId: "",
      confirmedAt: "",
      log: [],
    },
    vitals: seedVitals(
      "w1",
      [148, 152, 155, 150, 158, 160, 162],
      [92, 94, 95, 93, 96, 97, 98],
      [162, 178, 171, 190, 184, 205, 218]
    ),
    prescription: null,
  },
  {
    id: "CP-102",
    token: "CP-102",
    name: "Meenakshi Iyer",
    age: 52,
    gender: "Female",
    bay: "Cardiac Bay 02",
    slot: "10:30 AM - Walk-in",
    hasActiveSOS: false,
    severeChestPainFlag: false,
    chiefComplaint:
      "Exertional breathlessness and episodic palpitations for 2 weeks with mild ankle swelling by evening. Requested a female attendant for examination.",
    bloodGroup: "B-ve",
    allergies: ["Sulfa Drugs", "Iodine Contrast (Rash)"],
    chronic: ["Bronchial Asthma", "Hypertension (Stage 1)"],
    status: "Waiting",
    chaperone: {
      requested: true,
      status: "pending",
      attendantName: "",
      attendantId: "",
      confirmedAt: "",
      log: ["Patient pre-requested a female nurse/attendant during Health Passport intake."],
    },
    vitals: seedVitals(
      "w2",
      [136, 142, 138, 146, 144, 148, 146],
      [84, 88, 86, 90, 88, 92, 90],
      [104, 128, 110, 132, 108, 136, 112]
    ),
    prescription: null,
  },
  {
    id: "CP-103",
    token: "CP-103",
    name: "Harpreet Singh Bedi",
    age: 64,
    gender: "Male",
    bay: "Cardiac Bay 06",
    slot: "10:45 AM - Walk-in",
    hasActiveSOS: false,
    severeChestPainFlag: false,
    chiefComplaint:
      "Recurrent giddiness with BP spikes over the past 5 days. Post-PCI (2022) follow-up, on regular dual therapy.",
    bloodGroup: "A+ve",
    allergies: ["Aspirin/NSAIDs (GI Bleed)"],
    chronic: ["Hypertension (Stage 2)", "CAD post-PCI (2022)", "Chronic Kidney Disease Stage 2"],
    status: "Waiting",
    chaperone: {
      requested: false,
      status: "not-requested",
      attendantName: "",
      attendantId: "",
      confirmedAt: "",
      log: [],
    },
    vitals: seedVitals(
      "w3",
      [152, 158, 164, 156, 160, 166, 158],
      [94, 96, 100, 94, 98, 102, 96],
      [118, 146, 124, 152, 130, 158, 126]
    ),
    prescription: null,
  },
  {
    id: "CP-104",
    token: "CP-104",
    name: "Kavya Menon",
    age: 47,
    gender: "Female",
    bay: "Cardiac Bay 03",
    slot: "11:15 AM - Booked",
    hasActiveSOS: false,
    severeChestPainFlag: false,
    chiefComplaint:
      "Scheduled follow-up for palpitations. 24-hour Holter report to be reviewed; attendant already arranged for physical examination.",
    bloodGroup: "AB+ve",
    allergies: ["Penicillin (Rash)"],
    chronic: ["Hypertension (Stage 1)", "Hypothyroidism"],
    status: "Waiting",
    chaperone: {
      requested: true,
      status: "assigned",
      attendantName: "Nurse Kavita Sharma",
      attendantId: "NR-409",
      confirmedAt: "10:02 AM, today",
      log: [
        "Patient pre-requested a female nurse/attendant during Health Passport intake.",
        "10:02 AM, today - Nurse Kavita Sharma (ID #NR-409) confirmed as female attendant by Dr. Sunita Sharma.",
      ],
    },
    vitals: seedVitals(
      "b4",
      [128, 132, 130, 134, 138, 132, 136],
      [80, 82, 80, 84, 86, 82, 84],
      [96, 122, 98, 118, 102, 124, 100]
    ),
    prescription: null,
  },
];

const EMPTY_DRAFT: RxDraft = { diagnosis: "", findings: "", meds: [], adviceChips: [], adviceNote: "" };

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                   */
/* -------------------------------------------------------------------------- */
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asNum = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function normalizeStatus(v: unknown): ConsultStatus | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().replace(/[_-]/g, " ").trim();
  if (s.includes("issued") || s === "completed" || s === "complete") return "Prescription Issued";
  if (s.includes("consult") || s === "in progress") return "In Consultation";
  if (s.includes("wait") || s === "booked" || s === "scheduled" || s === "pending") return "Waiting";
  return null;
}

function isActiveSos(p: Patient): boolean {
  return (p.hasActiveSOS || p.severeChestPainFlag) && p.status !== "Prescription Issued";
}

function sosText(p: Patient): string {
  return p.severeChestPainFlag
    ? "SOS ALERT: Severe Chest Pain / Diaphoresis"
    : "SOS ALERT: Active Emergency SOS";
}

function urgencyTag(p: Patient): string {
  if (isActiveSos(p)) return "SOS / Critical";
  if (/booked/i.test(p.slot)) return "Booked";
  return "Walk-in";
}

type UrgencyLevel = "CRITICAL" | "MODERATE" | "ROUTINE";

function urgencyLevel(p: Patient): UrgencyLevel {
  if (isActiveSos(p)) return "CRITICAL";
  const last = p.vitals[p.vitals.length - 1];
  if (last) {
    const bp = bpFlag(last.systolic, last.diastolic);
    const sg = sugarFlag(last.sugar, last.sugarType);
    if (bp === "critical" || sg === "critical") return "CRITICAL";
    if (bp === "elevated" || sg === "elevated") return "MODERATE";
  }
  if (p.chronic.length >= 2) return "MODERATE";
  return "ROUTINE";
}
function chaperoneLabel(c: ChaperoneInfo): string {
  if (c.status === "pending") return "Chaperone Requested - Pending Assignment";
  if (c.status === "assigned") {
    return `Attendant Assigned (${c.attendantName}${c.attendantId ? ` - ID #${c.attendantId}` : ""})`;
  }
  return "Not Applicable / Not Requested";
}

function formatStamp(): string {
  return new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bpFlag(sys: number, dia: number): "critical" | "elevated" | "normal" {
  if (sys >= 160 || dia >= 100) return "critical";
  if (sys >= 140 || dia >= 90) return "elevated";
  return "normal";
}

function sugarFlag(v: number, type: VitalType): "critical" | "elevated" | "normal" {
  if (v >= 200) return "critical";
  if (v >= (type === "Fasting" ? 126 : 180)) return "elevated";
  return "normal";
}


function findAllergyConflict(medName: string, allergies: string[]): string | null {
  const med = medName.toLowerCase().trim();
  if (!med) return null;
  for (const allergy of allergies) {
    const al = allergy.toLowerCase();
    for (const g of DRUG_GROUPS) {
      if (g.allergyWords.some((w) => al.includes(w)) && g.drugWords.some((w) => med.includes(w))) {
        return allergy;
      }
    }
    const first = al.split(/[\s(/,]+/)[0];
    if (first.length >= 5 && med.includes(first)) return allergy;
  }
  return null;
}

function vitalsSnapshotText(p: Patient): string {
  const last = p.vitals[p.vitals.length - 1];
  if (!last) return "No vitals logged";
  return `BP ${last.systolic}/${last.diastolic} mmHg | Blood Sugar ${last.sugar} mg/dL (${last.sugarType}) | ${last.label}`;
}

function buildRxSummary(p: Patient, rx: IssuedRx): string {
  const lines: string[] = [];
  lines.push(`CuraPulse E-Prescription ${rx.hash}`);
  lines.push(DOCTOR.hospital);
  lines.push(`${DOCTOR.name} | ${DOCTOR.title} | NMC Reg: ${DOCTOR.nmc} (Verified)`);
  lines.push("");
  lines.push(`Patient: ${p.name}, ${p.age}y, ${p.gender}`);
  lines.push(`Arrival Token: ${p.token} | ${p.bay}`);
  lines.push(`Blood Group: ${rx.bloodGroup}`);
  lines.push(`Allergies: ${rx.allergies.length ? rx.allergies.join(", ") : "None recorded"}`);
  lines.push(`Vitals: ${rx.vitalsSnapshot}`);
  lines.push(`Chaperone: ${rx.chaperoneBadge}`);
  lines.push("");
  lines.push(`Diagnosis: ${rx.diagnosis || "Not specified"}`);
  if (rx.findings) lines.push(`Examination: ${rx.findings}`);
  lines.push("");
  if (rx.meds.length) {
    lines.push("Rx:");
    rx.meds.forEach((m, i) => {
      lines.push(
        `${i + 1}. ${m.name} - ${m.dosage} - ${m.duration}${m.instructions ? ` (${m.instructions})` : ""}`
      );
    });
  } else {
    lines.push("Rx: No medicines prescribed");
  }
  if (rx.advice.length) {
    lines.push("");
    lines.push("Advice & Follow-up:");
    rx.advice.forEach((a) => lines.push(`- ${a}`));
  }
  lines.push("");
  lines.push(`Issued: ${rx.issuedAt}`);
  return lines.join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

async function safeCloud(run: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  try {
    const res = await run();
    return !res.error;
  } catch {
    return false;
  }
}

function buildRemotePatient(token: string, name: string, row: Record<string, unknown>, status: ConsultStatus): Patient {
  const gender: Gender = /^f/i.test(asStr(row.gender)) ? "Female" : "Male";
  const wantsChaperone = gender === "Female" && row.chaperone_requested === true;
  return {
    id: token,
    token,
    name,
    age: asNum(row.age, 40),
    gender,
    bay: asStr(row.bay) || "Cardiac Bay 08",
    slot: asStr(row.slot) || "Synced from CuraPulse Cloud",
    hasActiveSOS: row.has_active_sos === true,
    severeChestPainFlag: row.severe_chest_pain_flag === true,
    chiefComplaint: asStr(row.chief_complaint) || "Synced from CuraPulse Cloud - chief complaint not provided.",
    bloodGroup: asStr(row.blood_group) || "Unknown",
    allergies: asStrArray(row.allergies),
    chronic: asStrArray(row.chronic_illnesses),
    status,
    chaperone: {
      requested: wantsChaperone,
      status: wantsChaperone ? "pending" : "not-requested",
      attendantName: "",
      attendantId: "",
      confirmedAt: "",
      log: wantsChaperone ? ["Patient pre-requested a female nurse/attendant (synced from cloud)."] : [],
    },
    vitals: [],
    prescription: null,
  };
}

function mergeRemoteRow(list: Patient[], row: Record<string, unknown>): Patient[] {
  const token = (asStr(row.arrival_token) || asStr(row.token)).trim();
  if (!token) return list;
  const status = normalizeStatus(row.status);
  const idx = list.findIndex((p) => p.token === token);

  if (idx === -1) {
    const name = asStr(row.patient_name) || asStr(row.name) || asStr(row.full_name);
    if (!name) return list;
    return [...list, buildRemotePatient(token, name, row, status ?? "Waiting")];
  }

  let next = list[idx];
  let nextStatus: ConsultStatus | null = status;

  const hash = asStr(row.rx_hash);
  if (hash) nextStatus = "Prescription Issued";

  if (nextStatus && STATUS_RANK[nextStatus] > STATUS_RANK[next.status]) {
    next = { ...next, status: nextStatus };
  }

  const attName = asStr(row.attendant_name);
  if (attName && next.chaperone.status !== "assigned") {
    const attId = asStr(row.attendant_id);
    next = {
      ...next,
      chaperone: {
        ...next.chaperone,
        requested: true,
        status: "assigned",
        attendantName: attName,
        attendantId: attId,
        confirmedAt: asStr(row.chaperone_confirmed_at) || "Synced from CuraPulse Cloud",
        log: [`Attendant ${attName}${attId ? ` (ID #${attId})` : ""} confirmed - synced from CuraPulse Cloud.`, ...next.chaperone.log],
      },
    };
  }

  if (hash && !next.prescription && Array.isArray(row.medicines)) {
    const meds: RxMedicine[] = (row.medicines as unknown[])
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m, i) => ({
        id: `remote-${hash}-${i}`,
        name: asStr(m.name) || "Medicine",
        dosage: asStr(m.dosage),
        duration: asStr(m.duration),
        instructions: asStr(m.instructions),
        allergyOverride: false,
      }));
    next = {
      ...next,
      prescription: {
        hash,
        issuedAt: asStr(row.issued_at) || "Synced from CuraPulse Cloud",
        diagnosis: asStr(row.diagnosis),
        findings: asStr(row.findings),
        meds,
        advice: asStrArray(row.advice),
        bloodGroup: next.bloodGroup,
        allergies: next.allergies,
        vitalsSnapshot: vitalsSnapshotText(next),
        chaperoneBadge: chaperoneLabel(next.chaperone),
      },
    };
  }

  if (next === list[idx]) return list;
  const copy = list.slice();
  copy[idx] = next;
  return copy;
}

const REG_STORAGE_KEY = "curapulse_doctor_applications";

interface RegForm {
  fullName: string;
  email: string;
  phone: string;
  councilId: string;
  council: string;
  degree: string;
  specialty: string;
  hospital: string;
  address: string;
  fee: string;
  hours: string;
  degreeFile: string;
  councilFile: string;
}

const EMPTY_REG: RegForm = {
  fullName: "",
  email: "",
  phone: "",
  councilId: "",
  council: "Delhi Medical Council",
  degree: "MBBS",
  specialty: "",
  hospital: "",
  address: "",
  fee: "",
  hours: "Mon-Sat, 10:00 AM - 4:00 PM",
  degreeFile: "",
  councilFile: "",
};

const COUNCILS = [
  "Delhi Medical Council",
  "Maharashtra Medical Council",
  "Karnataka Medical Council",
  "Haryana Medical Council",
  "Uttar Pradesh Medical Council",
  "National Medical Commission (IMR)",
];

const DEGREES = ["MBBS", "MBBS, MD", "MBBS, MS", "MBBS, DNB", "MBBS, MD, DM", "BDS", "BAMS"];

/* -------------------------------------------------------------------------- */
/*  REDESIGN HELPERS                                                          */
/* -------------------------------------------------------------------------- */

type DocView = "queue" | "chats" | "appointments" | "patients" | "rx" | "verify";

/** Doctors patients can message from the patient app (ids match the patient portal). */
const CHAT_DOCTORS = [
  { id: "d1", name: "Dr. Sunita Sharma" },
  { id: "d2", name: "Dr. Ananya Verma" },
  { id: "d3", name: "Dr. Rohit Mathur" },
  { id: "d4", name: "Dr. Vikram Rao" },
  { id: "d5", name: "Dr. Arjun Khanna" },
  { id: "d6", name: "Dr. Karan Mehta" },
  { id: "d7", name: "Dr. Neha Kapoor" },
];

/** Safe alternatives offered when a drug clashes with an allergy. */
const SAFE_ALTERNATIVES: { allergyWords: string[]; alt: { name: string; dosage: string; duration: string } }[] = [
  { allergyWords: ["penicillin", "amoxicillin", "ampicillin"], alt: { name: "Tab. Azithromycin 500mg", dosage: "1-0-0 After Food", duration: "14 Days" } },
  { allergyWords: ["aspirin", "nsaid", "ecosprin", "ibuprofen"], alt: { name: "Tab. Clopidogrel 75mg", dosage: "0-0-1 After Food", duration: "1 Month" } },
  { allergyWords: ["sulfa", "sulpha", "sulfonamide"], alt: { name: "Tab. Nitrofurantoin 100mg", dosage: "1-0-1 After Food", duration: "14 Days" } },
];

function safeAlternative(allergy: string) {
  const al = allergy.toLowerCase();
  return SAFE_ALTERNATIVES.find((s) => s.allergyWords.some((w) => al.includes(w)))?.alt ?? null;
}

/** Non-allergy interaction notes (amber caution, not a block). */
function interactionNote(medName: string, p: Patient): string | null {
  const m = medName.toLowerCase();
  const asthma = p.chronic.some((c) => /asthma|copd/i.test(c));
  if (asthma && /metoprolol|propranolol|atenolol|carvedilol|bisoprolol/.test(m))
    return "Beta-blockers can tighten airways in asthma and blunt Salbutamol. Prefer a cardio-selective dose and keep the inhaler at hand.";
  if (/salbutamol/.test(m) && /metoprolol|propranolol|atenolol/.test(p.chronic.join(" ").toLowerCase()))
    return "Salbutamol's effect is reduced with non-selective beta-blockers. Review the combination.";
  if (/telmisartan|losartan|ramipril/.test(m) && p.chronic.some((c) => /kidney|ckd/i.test(c)))
    return "Kidney disease on record: check creatinine and potassium within 1 to 2 weeks.";
  return null;
}

const LEVEL_TONE: Record<UrgencyLevel, "crit" | "warn" | "ok"> = { CRITICAL: "crit", MODERATE: "warn", ROUTINE: "ok" };
const LEVEL_TEXT: Record<UrgencyLevel, string> = { CRITICAL: "Critical", MODERATE: "Watch", ROUTINE: "Routine" };
const STATUS_TONE: Record<ConsultStatus, "info" | "brand" | "ok"> = { Waiting: "info", "In Consultation": "brand", "Prescription Issued": "ok" };

function LevelBadge({ p }: { p: Patient }) {
  const l = urgencyLevel(p);
  return <Badge tone={LEVEL_TONE[l]}>{LEVEL_TEXT[l]}</Badge>;
}

function StatusBadge({ s }: { s: ConsultStatus }) {
  return (
    <Badge tone={STATUS_TONE[s]} noIcon={s === "In Consultation"}>
      {s === "Prescription Issued" ? "Rx issued" : s}
    </Badge>
  );
}

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #rx-print-area, #rx-print-area * { visibility: visible !important; }
  #rx-print-area { position: absolute !important; left: 0; top: 0; width: 100% !important; box-shadow: none !important; border: 0 !important; }
}
`;

interface StoredApp {
  id: string;
  full_name: string;
  specialty: string;
  nmc_registration_id: string;
  submitted_at: string;
  verification_status: string;
}

/* -------------------------------------------------------------------------- */
/*  PAGE                                                                      */
/* -------------------------------------------------------------------------- */

export default function DoctorPage() {
  const view = useViewState("desktop");
  const P = view.isPhone;

  const [mounted, setMounted] = useState(false);
  const [docProfile, setDocProfile] = useState(DOCTOR);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("curapulse_doctor_profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.name) {
          setDocProfile({
            name: parsed.name,
            title: parsed.title || DOCTOR.title,
            hospital: parsed.hospital || DOCTOR.hospital,
            nmc: parsed.nmc || DOCTOR.nmc,
          });
        }
      }
    } catch {}
    // Signed-in doctor (from /login) overrides the demo identity.
    const s = readSession("doctor");
    if (s && !s.isDemo) {
      let app: Record<string, unknown> | undefined;
      try {
        const list = JSON.parse(window.localStorage.getItem(REG_STORAGE_KEY) || "[]");
        app = Array.isArray(list) ? list.find((a: Record<string, unknown>) => a.id === s.doctorAppId) : undefined;
      } catch {
        app = undefined;
      }
      setDocProfile({
        name: sessionName(s),
        title: String(app?.specialty ?? "Doctor"),
        hospital: String(app?.hospital_affiliation ?? "Not provided"),
        nmc: String(app?.nmc_registration_id ?? "Pending"),
      });
      const local = (app?.verification_status as string) || s.doctorStatus || "PENDING";
      setAppStatus({ id: s.doctorAppId ?? "", status: local });
      // Pick up a decision the Support Desk made on another device.
      if (s.doctorAppId) {
        void (async () => {
          try {
            const { data } = await supabase.from("doctor_applications").select("verification_status").eq("id", s.doctorAppId).maybeSingle();
            const st = (data as { verification_status?: string } | null)?.verification_status;
            if (st) {
              setAppStatus({ id: s.doctorAppId ?? "", status: st });
              writeSession({ ...s, doctorStatus: st as typeof s.doctorStatus });
            }
          } catch {
            /* offline: keep local status */
          }
        })();
      }
    }
  }, []);
  const [appStatus, setAppStatus] = useState<{ id: string; status: string } | null>(null);

  const [section, setSection] = useState<DocView>("queue");
  const [phoneDetail, setPhoneDetail] = useState(false);
  const [patients, setPatients] = useState<Patient[]>(SEED_PATIENTS);
  const [selectedId, setSelectedId] = useState<string>("CP-101");
  const [inClinic, setInClinic] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("All");
  const [drafts, setDrafts] = useState<Record<string, RxDraft>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [cloudState, setCloudState] = useState<CloudState>("connecting");
  const [rxSeq, setRxSeq] = useState(8841);
  const [rxModalFor, setRxModalFor] = useState<string | null>(null);
  const [rxSync, setRxSync] = useState<Record<string, "sending" | "delivered" | "local">>({});
  const [sosAlerts, setSosAlerts] = useState<{ id: string; name: string; at: string }[]>([]);

  const toastSeq = useRef(0);

  const pushToast = useCallback((message: string, kind: ToastKind = "success") => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3800);
  }, []);

  const cloudSync = useCallback(
    async (run: () => PromiseLike<{ error: unknown }>, quiet = false) => {
      const ok = await safeCloud(run);
      if (ok) setCloudState("live");
      if (!quiet) pushToast(ok ? "Synced to CuraPulse Cloud" : "Saved on this device. Cloud sync is not reachable yet.", ok ? "cloud" : "info");
      return ok;
    },
    [pushToast]
  );

  /* ---- Live data: fetch + realtime, silent fallback to local state ---- */
  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const tables = ["patients", "appointments", "prescriptions"] as const;
      let anyOk = false;
      let mergedRows = 0;
      for (const table of tables) {
        try {
          const { data, error } = await supabase.from(table).select("*").limit(200);
          if (error || !data) continue;
          anyOk = true;
          if (cancelled) return;
          if (data.length > 0) {
            mergedRows += data.length;
            const rows = data as Record<string, unknown>[];
            setPatients((prev) => rows.reduce((acc, row) => mergeRemoteRow(acc, row), prev));
          }
        } catch {
          continue;
        }
      }
      if (cancelled) return;
      setCloudState(anyOk ? "live" : "offline");
      if (mergedRows > 0) pushToast("Live records merged from CuraPulse Cloud", "cloud");
    };

    void load();

    try {
      const handle = (payload: { new: unknown }) => {
        const row = (payload.new ?? {}) as Record<string, unknown>;
        setPatients((prev) => mergeRemoteRow(prev, row));
      };
      channel = supabase
        .channel("curapulse-doctor-portal")
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, handle)
        .on("postgres_changes", { event: "*", schema: "public", table: "prescriptions" }, handle)
        .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, handle)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "sos_incidents" }, (payload: { new: unknown }) => {
          const row = (payload.new ?? {}) as Record<string, unknown>;
          const name = asStr(row.patient_name) || "Unregistered patient";
          setSosAlerts((prev) => [{ id: String(row.id ?? Date.now()), name, at: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 3));
          pushToast(`New SOS from ${name}. The Support Desk is handling dispatch.`, "warn");
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setCloudState("live");
        });
    } catch {
      channel = null;
    }

    return () => {
      cancelled = true;
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          return;
        }
      }
    };
  }, [pushToast]);

  // Don't show "Connecting" forever when the cloud never answers.
  useEffect(() => {
    const t = window.setTimeout(() => setCloudState((c) => (c === "connecting" ? "offline" : c)), 6000);
    return () => window.clearTimeout(t);
  }, []);

  /* ---- Derived state ---- */
  const selected = useMemo(() => patients.find((p) => p.id === selectedId) ?? patients[0], [patients, selectedId]);

  const visiblePatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = patients.filter((p) => {
      if (filter === "SOS / Critical" && !isActiveSos(p)) return false;
      if (filter === "Walk-in" && !!/booked/i.test(p.slot)) return false;
      if (filter === "Completed" && p.status !== "Prescription Issued") return false;
      if (!q) return true;
      const hay = `${p.token} ${p.name} ${urgencyTag(p)} ${p.bay} ${p.allergies.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    return list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (isActiveSos(a.p) ? 0 : 1) - (isActiveSos(b.p) ? 0 : 1) || a.i - b.i)
      .map((x) => x.p);
  }, [patients, search, filter]);

  const sosCount = useMemo(() => patients.filter(isActiveSos).length, [patients]);
  const completedCount = useMemo(() => patients.filter((p) => p.status === "Prescription Issued").length, [patients]);
  const waitingCount = patients.filter((p) => p.status === "Waiting").length;
  const draft: RxDraft = selected ? drafts[selected.id] ?? EMPTY_DRAFT : EMPTY_DRAFT;

  /* ---- Actions ---- */
  const updatePatient = useCallback((id: string, fn: (p: Patient) => Patient) => {
    setPatients((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }, []);

  const updateDraft = (patch: Partial<RxDraft>) => {
    if (!selected) return;
    setDrafts((prev) => ({ ...prev, [selected.id]: { ...(prev[selected.id] ?? EMPTY_DRAFT), ...patch } }));
  };

  const setStatus = (id: string, status: ConsultStatus) => {
    const target = patients.find((p) => p.id === id);
    if (!target) return;
    updatePatient(id, (p) => ({ ...p, status }));
    void cloudSync(() => supabase.from("appointments").update({ status }).eq("arrival_token", target.token), true);
  };

  const openPatient = (id: string) => {
    setSelectedId(id);
    if (section !== "queue" && section !== "rx") setSection("queue");
    setPhoneDetail(true);
  };

  const startConsult = (id: string) => {
    const p = patients.find((x) => x.id === id);
    if (!p) return;
    setSelectedId(id);
    if (p.status === "Waiting") {
      setStatus(id, "In Consultation");
      pushToast(`${p.token} is now in consultation`, "info");
    } else if (p.status === "In Consultation") {
      setSection("rx");
      setPhoneDetail(true);
    } else if (p.prescription) {
      setRxModalFor(id);
    } else {
      pushToast("Prescription was issued from another session. Details aren't available here.", "info");
    }
  };

  const toggleClinic = () => {
    setInClinic((prev) => {
      const next = !prev;
      pushToast(next ? "Active Clinic Hours. Walk-in tokens are open." : "Off-Duty. New walk-in tokens are paused.", next ? "success" : "warn");
      return next;
    });
  };

  const addWalkIn = () => {
    if (!inClinic) {
      pushToast("Walk-in intake is paused while you're Off-Duty", "warn");
      return;
    }
    const nums = patients.map((p) => {
      const m = p.token.match(/(\d+)$/);
      return m ? Number(m[1]) : 0;
    });
    const n = Math.max(100, ...nums) + 1;
    const tpl = WALKIN_POOL[(n - 1) % WALKIN_POOL.length];
    const token = `CP-${n}`;
    const female = tpl.gender === "Female";
    const newPatient: Patient = {
      id: token,
      token,
      name: tpl.name,
      age: tpl.age,
      gender: tpl.gender,
      bay: WALKIN_BAYS[n % WALKIN_BAYS.length],
      slot: "Walk-in - Next Available",
      hasActiveSOS: false,
      severeChestPainFlag: false,
      chiefComplaint: tpl.complaint,
      bloodGroup: tpl.bloodGroup,
      allergies: tpl.allergies,
      chronic: tpl.chronic,
      status: "Waiting",
      chaperone: {
        requested: female,
        status: female ? "pending" : "not-requested",
        attendantName: "",
        attendantId: "",
        confirmedAt: "",
        log: female ? ["Patient pre-requested a female nurse/attendant during Health Passport intake."] : [],
      },
      vitals: [],
      prescription: null,
    };
    setPatients((prev) => [...prev, newPatient]);
    setSelectedId(token);
    pushToast(`Walk-in token ${token} issued for ${tpl.name}`, "success");
  };

  const addAllergy = (value: string): boolean => {
    if (!selected) return false;
    const v = value.trim();
    if (!v) {
      pushToast("Type an allergy before adding", "warn");
      return false;
    }
    if (selected.allergies.some((a) => a.toLowerCase() === v.toLowerCase())) {
      pushToast(`${v} is already on the allergy list`, "warn");
      return false;
    }
    updatePatient(selected.id, (p) => ({ ...p, allergies: [...p.allergies, v] }));
    pushToast(`Allergy added: ${v}`, "success");
    return true;
  };

  const confirmAttendant = (attName: string, attId: string) => {
    if (!selected) return;
    const stamp = formatStamp();
    const entry = `${stamp} - ${attName} (ID #${attId}) confirmed as female attendant by ${DOCTOR.name}.`;
    const token = selected.token;
    updatePatient(selected.id, (p) => ({
      ...p,
      chaperone: { ...p.chaperone, requested: true, status: "assigned", attendantName: attName, attendantId: attId, confirmedAt: stamp, log: [entry, ...p.chaperone.log] },
    }));
    pushToast(`${attName} assigned as chaperone for ${token}`, "success");
    void cloudSync(
      () =>
        supabase
          .from("appointments")
          .update({ attendant_name: attName, attendant_id: attId, chaperone_status: "assigned", chaperone_confirmed_at: new Date().toISOString() })
          .eq("arrival_token", token),
      true
    );
  };

  const requestChaperone = () => {
    if (!selected) return;
    const stamp = formatStamp();
    updatePatient(selected.id, (p) => ({
      ...p,
      chaperone: { ...p.chaperone, requested: true, status: "pending", log: [`${stamp} - Female attendant requested by ${DOCTOR.name} for physical examination.`, ...p.chaperone.log] },
    }));
    pushToast("Chaperone requested. Pending assignment.", "info");
  };

  const logSpotVital = (sys: number, dia: number, sugar: number, type: VitalType) => {
    if (!selected) return;
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const reading: VitalReading = { id: `spot-${Date.now()}`, label: time, systolic: sys, diastolic: dia, sugar, sugarType: type, source: "Clinic Spot" };
    updatePatient(selected.id, (p) => ({ ...p, vitals: [...p.vitals, reading] }));
    const f = bpFlag(sys, dia);
    pushToast(`Spot vital logged: ${sys}/${dia} mmHg, ${sugar} mg/dL${f === "critical" ? ". BP is critical." : f === "elevated" ? ". BP is elevated." : ""}`, f === "normal" ? "success" : "warn");
  };

  const issuePrescription = () => {
    if (!selected) return;
    const patient = selected;
    const d = drafts[patient.id] ?? EMPTY_DRAFT;
    const year = new Date().getFullYear();
    const hash = `CP-RX-${year}-${rxSeq}`;
    setRxSeq((s) => s + 1);

    const advice = [...d.adviceChips];
    d.adviceNote
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => advice.push(l));

    const rx: IssuedRx = {
      hash,
      issuedAt: formatStamp(),
      diagnosis: d.diagnosis.trim(),
      findings: d.findings.trim(),
      meds: d.meds,
      advice,
      bloodGroup: patient.bloodGroup,
      allergies: patient.allergies,
      vitalsSnapshot: vitalsSnapshotText(patient),
      chaperoneBadge: chaperoneLabel(patient.chaperone),
    };

    updatePatient(patient.id, (p) => ({ ...p, status: "Prescription Issued", prescription: rx }));
    setRxModalFor(patient.id);
    setRxSync((s) => ({ ...s, [hash]: "sending" }));
    pushToast(`E-prescription ${hash} signed`, "success");

    void (async () => {
      const ok = await cloudSync(async () => {
        const ins = await supabase.from("prescriptions").insert({
          rx_hash: hash,
          arrival_token: patient.token,
          patient_name: patient.name,
          doctor_name: DOCTOR.name,
          nmc_reg: DOCTOR.nmc,
          diagnosis: rx.diagnosis,
          findings: rx.findings,
          medicines: rx.meds.map((m) => ({ name: m.name, dosage: m.dosage, duration: m.duration, instructions: m.instructions })),
          advice: rx.advice,
          issued_at: new Date().toISOString(),
        });
        if (ins.error) return ins;
        return await supabase.from("appointments").update({ status: "Prescription Issued" }).eq("arrival_token", patient.token);
      }, true);
      setRxSync((s) => ({ ...s, [hash]: ok ? "delivered" : "local" }));
    })();
  };

  const modalPatient = rxModalFor ? patients.find((p) => p.id === rxModalFor) ?? null : null;

  /* ---------------------------------------------------------------------- */
  /*  Sections                                                              */
  /* ---------------------------------------------------------------------- */

  const cloudBadge =
    cloudState === "live" ? (
      <Badge tone="ok">Live sync</Badge>
    ) : cloudState === "connecting" ? (
      <Badge tone="info">Connecting</Badge>
    ) : (
      <Badge tone="warn">Offline · saved locally</Badge>
    );

  const header = (title: string, sub: string, extra?: React.ReactNode) =>
    P ? (
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-bold text-ink">{title}</h1>
            <p className="text-[13.5px] text-ink-muted">{sub}</p>
          </div>
          {cloudBadge}
        </div>
        {extra && <div className="mt-3 flex flex-wrap gap-2">{extra}</div>}
      </div>
    ) : (
      <PageTitle
        title={title}
        sub={sub}
        right={
          <>
            {cloudBadge}
            {extra}
          </>
        }
      />
    );

  const availability = (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5">
      <span className="text-[13px] font-semibold text-ink">{inClinic ? "Active Clinic Hours" : "Off-Duty"}</span>
      <Toggle on={inClinic} onChange={toggleClinic} label="Clinic availability" />
    </div>
  );

  const sosBanner =
    sosCount > 0 || sosAlerts.length > 0 ? (
      <Alert
        tone="crit"
        className="mb-4"
        icon={<Siren className="h-5 w-5" />}
        title={`${sosCount} patient${sosCount === 1 ? "" : "s"} flagged critical`}
        action={
          patients.find(isActiveSos) ? (
            <Button size="sm" variant="emergency" onClick={() => openPatient(patients.find(isActiveSos)!.id)}>
              Open {patients.find(isActiveSos)!.token}
            </Button>
          ) : undefined
        }
      >
        {patients
          .filter(isActiveSos)
          .map((p) => `${p.token} ${p.name}: ${sosText(p).replace("SOS ALERT: ", "")}`)
          .join(" · ")}
        {sosAlerts.length > 0 && <span className="block">Live SOS: {sosAlerts.map((a) => `${a.name} at ${a.at}`).join(", ")}</span>}
      </Alert>
    ) : null;

  const queueList = (
    <Card className="overflow-hidden">
      <div className="space-y-3 border-b border-line p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input aria-label="Search queue" placeholder="Search token, name, allergy" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputCls, "h-11 pl-9 text-[14px]")} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <ChoiceChip key={f} on={filter === f} onClick={() => setFilter(f)} className="!h-8 shrink-0 !px-3 !text-[12.5px]">
              {f === "SOS / Critical" ? "Critical" : f}
            </ChoiceChip>
          ))}
        </div>
      </div>
      {!P && (
        <div className="grid grid-cols-[72px_1fr_110px_110px] gap-2 border-b border-line bg-canvas px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">
          <span>Token</span>
          <span>Patient</span>
          <span>Urgency</span>
          <span>Status</span>
        </div>
      )}
      <ul>
        {visiblePatients.length === 0 && <li className="p-6 text-center text-[14px] text-ink-muted">No patients match this filter.</li>}
        {visiblePatients.map((p) => {
          const on = selected?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openPatient(p.id)}
                aria-current={on ? "true" : undefined}
                className={cx(
                  "w-full border-b border-line px-4 py-3 text-left transition last:border-b-0",
                  on && !P ? "bg-sage" : "hover:bg-canvas",
                  isActiveSos(p) && "border-l-4 border-l-coral"
                )}
              >
                {P ? (
                  <div className="flex items-start gap-3">
                    <Avatar initials={initials(p.name)} size={40} tone={p.gender === "Female" ? "lav" : "mist"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-ink">{p.name}</p>
                      <p className="text-[12.5px] text-ink-muted">
                        <span className="tabular font-semibold">{p.token}</span> · {p.age}y {p.gender} · {p.slot.split(" - ")[0]}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <LevelBadge p={p} />
                        <StatusBadge s={p.status} />
                        {p.allergies.length > 0 && <Badge tone="crit">Allergy</Badge>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[72px_1fr_110px_110px] items-center gap-2">
                    <span className="tabular text-[13px] font-bold text-ink">{p.token}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold text-ink">{p.name}</span>
                      <span className="block truncate text-[12.5px] text-ink-muted">
                        {p.age}y {p.gender} · {p.allergies.length ? `Allergy: ${p.allergies[0].split(" (")[0]}` : "No allergies"}
                      </span>
                    </span>
                    <span>
                      <LevelBadge p={p} />
                    </span>
                    <span>
                      <StatusBadge s={p.status} />
                    </span>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line p-3">
        <Button full size="md" variant="secondary" icon={<UserPlus className="h-4 w-4" />} disabled={!inClinic} onClick={addWalkIn}>
          {inClinic ? "Issue walk-in token" : "Walk-ins paused (Off-Duty)"}
        </Button>
      </div>
    </Card>
  );

  const renderQueue = () => {
    if (P && phoneDetail && selected) {
      return (
        <div>
          <button type="button" onClick={() => setPhoneDetail(false)} className="mb-3 flex items-center gap-1 text-[14px] font-semibold text-brand">
            <ArrowLeft className="h-4 w-4" /> Queue
          </button>
          <PatientSummary
            key={selected.id}
            p={selected}
            phone
            onAddAllergy={addAllergy}
            onConfirmAttendant={confirmAttendant}
            onRequestChaperone={requestChaperone}
            onLog={logSpotVital}
            onStart={() => startConsult(selected.id)}
            onRx={() => {
              setSection("rx");
              setPhoneDetail(true);
            }}
          />
        </div>
      );
    }
    return (
      <div>
        {header("Today's queue", `${docProfile.name} · ${patients.length} patients · ${waitingCount} waiting · ${completedCount} done`, availability)}
        {sosBanner}
        {P ? (
          queueList
        ) : (
          <div className="grid grid-cols-[minmax(440px,5fr)_6fr] gap-5">
            <div className="min-w-0">{queueList}</div>
            <div className="min-w-0">
              {selected && (
                <PatientSummary
                  key={selected.id}
                  p={selected}
                  onAddAllergy={addAllergy}
                  onConfirmAttendant={confirmAttendant}
                  onRequestChaperone={requestChaperone}
                  onLog={logSpotVital}
                  onStart={() => startConsult(selected.id)}
                  onRx={() => setSection("rx")}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAppointments = () => {
    const sorted = [...patients].sort((a, b) => a.slot.localeCompare(b.slot));
    return (
      <div>
        {header("Appointments", "Booked visits and walk-ins for today", availability)}
        <div className={cx("grid gap-3", P ? "grid-cols-1" : "grid-cols-2")}>
          {sorted.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tabular text-[13px] font-bold text-brand">{p.slot}</p>
                  <p className="text-[15.5px] font-bold text-ink">{p.name}</p>
                  <p className="text-[13px] text-ink-muted">
                    {p.token} · {p.bay}
                  </p>
                </div>
                <StatusBadge s={p.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={/booked/i.test(p.slot) ? "info" : "neutral"} noIcon>
                  {/booked/i.test(p.slot) ? "Booked" : "Walk-in"}
                </Badge>
                {p.chaperone.requested && (
                  <Badge tone="lav" icon={<Shield className="h-3 w-3" />}>
                    {p.chaperone.status === "assigned" ? "Chaperone assigned" : "Chaperone pending"}
                  </Badge>
                )}
                <LevelBadge p={p} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="quiet" onClick={() => openPatient(p.id)}>
                  Open summary
                </Button>
                <Button size="sm" onClick={() => startConsult(p.id)} disabled={p.status === "Prescription Issued" && !p.prescription}>
                  {p.status === "Waiting" ? "Start consult" : p.status === "In Consultation" ? "Write Rx" : "View Rx"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <div className="mt-4">
          <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} disabled={!inClinic} onClick={addWalkIn}>
            Issue walk-in token
          </Button>
        </div>
      </div>
    );
  };

  const renderPatients = () => (
    <div>
      {header("Patients", "Health Passport records shared with you")}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input aria-label="Search patients" placeholder="Search by name, token or condition" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputCls, "pl-9")} />
      </div>
      <Card className="divide-y divide-line">
        {patients
          .filter((p) => `${p.name} ${p.token} ${p.chronic.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()))
          .map((p) => (
            <button key={p.id} type="button" onClick={() => openPatient(p.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-canvas">
              <Avatar initials={initials(p.name)} size={42} tone={p.gender === "Female" ? "lav" : "mist"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{p.name}</p>
                <p className="truncate text-[13px] text-ink-muted">
                  {p.age}y {p.gender} · Blood {p.bloodGroup} · {p.chronic.join(", ") || "No chronic conditions"}
                </p>
              </div>
              {p.allergies.length > 0 && <Badge tone="crit">{p.allergies.length} allerg{p.allergies.length === 1 ? "y" : "ies"}</Badge>}
            </button>
          ))}
      </Card>
    </div>
  );

  const renderRx = () => {
    if (!selected) return null;
    const issuedList = patients.filter((p) => p.prescription);
    return (
      <div>
        {header("Prescriptions", "Write, check and sign e-prescriptions")}
        <div className={cx("grid gap-5", P ? "grid-cols-1" : "grid-cols-[7fr_4fr]")}>
          <div className="min-w-0">
            <Field label="Patient" htmlFor="rx-patient" className="mb-4">
              <select id="rx-patient" value={selected.id} onChange={(e) => setSelectedId(e.target.value)} className={inputCls}>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.token} · {p.name} ({p.status})
                  </option>
                ))}
              </select>
            </Field>
            <RxEditor key={selected.id} patient={selected} draft={draft} onDraft={updateDraft} onSign={issuePrescription} onViewRx={() => setRxModalFor(selected.id)} onToast={pushToast} phone={P} />
          </div>
          <div className="min-w-0 space-y-3">
            <Card className="p-4">
              <CardHeader title="Issued today" sub={`${issuedList.length} prescription${issuedList.length === 1 ? "" : "s"}`} />
              {issuedList.length === 0 ? (
                <p className="text-[14px] text-ink-muted">Nothing issued yet.</p>
              ) : (
                <ul className="space-y-2">
                  {issuedList.map((p) => {
                    const st = rxSync[p.prescription!.hash];
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-ink">{p.name}</p>
                          <p className="tabular text-[12px] text-ink-muted">{p.prescription!.hash}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge tone={st === "delivered" ? "ok" : st === "sending" ? "info" : "warn"}>{st === "delivered" ? "Delivered" : st === "sending" ? "Sending" : st === "local" ? "Saved locally" : "Synced"}</Badge>
                          <Button size="sm" variant="quiet" onClick={() => setRxModalFor(p.id)}>
                            View
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Alert tone="info" title="Allergy checks run as you type">
              CuraPulse checks each medicine against the patient's verified allergies and known interactions before you can sign.
            </Alert>
          </div>
        </div>
      </div>
    );
  };

  const renderVerify = () => (
    <div>
      {header("Registration & verification", "Your NMC credentials and new-doctor applications")}
      <div className={cx("grid gap-5", P ? "grid-cols-1" : "grid-cols-[4fr_7fr]")}>
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Avatar initials={docProfile.name.replace(/Dr\.\s*/i, "").slice(0, 2).toUpperCase() || "SS"} size={52} tone="lav" />
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-ink">{docProfile.name}</p>
                <p className="text-[13px] text-ink-muted">{docProfile.title}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-[14px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">NMC registration</span>
                <span className="tabular font-semibold text-ink">{docProfile.nmc}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Status</span>
                <Badge tone="ok" icon={<BadgeCheck className="h-3 w-3" />}>
                  Verified
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">Hospital</span>
                <span className="text-right text-ink">{docProfile.hospital}</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">Active Session</span>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-[11px] font-bold text-ink hover:bg-white hover:border-brand/40 transition active:scale-95"
              >
                <UserRound className="h-3 w-3 text-brand" />
                Switch Doctor / Login
              </Link>
            </div>
          </Card>
          <MyApplications refreshKey={toasts.length} />
        </div>
        <RegistrationForm onToast={pushToast} />
      </div>
    </div>
  );

  const nav = [
    { key: "queue", label: "Queue", icon: ListOrdered, badge: sosCount || undefined },
    { key: "chats", label: "Chats", icon: MessageCircle },
    { key: "appointments", label: P ? "Appts" : "Appointments", icon: CalendarDays },
    { key: "patients", label: "Patients", icon: Users },
    { key: "rx", label: P ? "Rx" : "Prescriptions", icon: FileSignature },
    { key: "verify", label: P ? "Verify" : "Verification", icon: ShieldCheck },
  ];

  const overlay = (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      {modalPatient && modalPatient.prescription && (
        <RxModal patient={modalPatient} phone={P} sync={rxSync[modalPatient.prescription.hash]} onClose={() => setRxModalFor(null)} onToast={pushToast} />
      )}
      {toasts.length > 0 && (
        <div className={cx("no-print flex flex-col gap-2", P ? "absolute bottom-20 left-3 right-3" : "fixed bottom-6 right-6 w-[360px]")}>
          {toasts.map((t) => (
            <Toast
              key={t.id}
              msg={t.message}
              tone={t.kind === "warn" ? "warn" : t.kind === "info" || t.kind === "cloud" ? "info" : "ok"}
              onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <Shell
      requireRole="doctor"
      view={view}
      product="Doctor console"
      nav={nav}
      active={section}
      onNav={(k) => {
        setSection(k as DocView);
        setPhoneDetail(false);
        if (typeof window !== "undefined") document.getElementById("cp-scroll")?.scrollTo({ top: 0 });
      }}
      user={{
        name: docProfile.name,
        sub: `NMC ${docProfile.nmc}`,
        initials: docProfile.name.replace(/Dr\.\s*/i, "").slice(0, 2).toUpperCase() || "SS",
      }}
      overlay={overlay}
    >
      <div className={cx(P && "px-4 py-4")}>
        {mounted && appStatus && appStatus.status !== "VERIFIED_ACTIVE" && appStatus.status !== "APPROVED" && (
          <Alert
            tone={appStatus.status === "REJECTED" ? "crit" : "warn"}
            className="mb-4"
            title={appStatus.status === "REJECTED" ? "Your application was not approved" : appStatus.status === "MORE_INFO" ? "Support needs more information" : `Application ${appStatus.id} is being verified`}
          >
            {appStatus.status === "PENDING"
              ? "A CuraPulse reviewer is checking your documents. Until then, the queue below is sample data and patients can't book you."
              : appStatus.status === "MORE_INFO"
                ? "Check your email for what the reviewer needs, then submit again from the login page."
                : "Contact CuraPulse Support if you think this is a mistake."}
          </Alert>
        )}
        {!mounted ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        ) : section === "queue" ? (
          renderQueue()
        ) : section === "chats" ? (
          <LiveChatInbox identities={CHAT_DOCTORS} storageKey="curapulse_doctor_inbox_as" phone={P} />
        ) : section === "appointments" ? (
          renderAppointments()
        ) : section === "patients" ? (
          renderPatients()
        ) : section === "rx" ? (
          renderRx()
        ) : (
          renderVerify()
        )}
      </div>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */
/*  PATIENT SUMMARY                                                           */
/* -------------------------------------------------------------------------- */

function PatientSummary({
  p,
  phone,
  onAddAllergy,
  onConfirmAttendant,
  onRequestChaperone,
  onLog,
  onStart,
  onRx,
}: {
  p: Patient;
  phone?: boolean;
  onAddAllergy: (v: string) => boolean;
  onConfirmAttendant: (name: string, id: string) => void;
  onRequestChaperone: () => void;
  onLog: (sys: number, dia: number, sugar: number, type: VitalType) => void;
  onStart: () => void;
  onRx: () => void;
}) {
  const [allergyInput, setAllergyInput] = useState("");
  const [nurse, setNurse] = useState(NURSES[0].id);
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [sugar, setSugar] = useState("");
  const [sugarType, setSugarType] = useState<VitalType>("Fasting");
  const [vErr, setVErr] = useState("");
  const last = p.vitals[p.vitals.length - 1];
  const bp = last ? bpFlag(last.systolic, last.diastolic) : null;
  const sg = last ? sugarFlag(last.sugar, last.sugarType) : null;
  const flagTone = (f: "critical" | "elevated" | "normal" | null) => (f === "critical" ? "crit" : f === "elevated" ? "warn" : "ok");
  const flagText = (f: "critical" | "elevated" | "normal" | null) => (f === "critical" ? "Critical" : f === "elevated" ? "Elevated" : "Normal");

  const submitVital = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Number(sys);
    const d = Number(dia);
    const g = Number(sugar);
    if (!s || !d || !g || s < 60 || s > 260 || d < 30 || d > 160 || g < 30 || g > 600) {
      setVErr("Enter BP and sugar within realistic ranges.");
      return;
    }
    setVErr("");
    onLog(s, d, g, sugarType);
    setSys("");
    setDia("");
    setSugar("");
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar initials={initials(p.name)} size={52} tone={p.gender === "Female" ? "lav" : "mist"} />
            <div className="min-w-0">
              <p className="text-[19px] font-bold leading-tight text-ink">{p.name}</p>
              <p className="text-[13.5px] text-ink-muted">
                {p.age}y · {p.gender} · Blood <span className="font-semibold text-ink">{p.bloodGroup}</span>
              </p>
              <p className="tabular text-[13px] text-ink-muted">
                {p.token} · {p.bay} · {p.slot}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <LevelBadge p={p} />
            <StatusBadge s={p.status} />
          </div>
        </div>
        {isActiveSos(p) && (
          <Alert tone="crit" className="mt-4" icon={<Siren className="h-5 w-5" />} title={sosText(p).replace("SOS ALERT: ", "Emergency: ")}>
            Seen first. Support Desk has been notified.
          </Alert>
        )}
        <div className="mt-4">
          <Eyebrow>Chief complaint</Eyebrow>
          <p className="mt-1 text-[14.5px] leading-relaxed text-ink">{p.chiefComplaint}</p>
        </div>
        <div className={cx("mt-4 grid gap-2", phone ? "grid-cols-1" : "grid-cols-2")}>
          <Button onClick={onStart}>{p.status === "Waiting" ? "Start consultation" : p.status === "In Consultation" ? "Write prescription" : "View prescription"}</Button>
          <Button variant="secondary" icon={<FileSignature className="h-4 w-4" />} onClick={onRx}>
            Open Rx editor
          </Button>
        </div>
      </Card>

      {p.allergies.length > 0 ? (
        <Alert tone="crit" title={`Allergies: ${p.allergies.join(", ")}`}>
          Verified in the patient's Health Passport. Conflicting drugs are blocked in the Rx editor.
        </Alert>
      ) : (
        <Alert tone="ok" title="No known allergies recorded" />
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (onAddAllergy(allergyInput)) setAllergyInput("");
        }}
      >
        <input aria-label="Add allergy" placeholder="Add a newly reported allergy" value={allergyInput} onChange={(e) => setAllergyInput(e.target.value)} className={cx(inputCls, "h-11 text-[14px]")} />
        <Button type="submit" size="md" variant="secondary" icon={<Plus className="h-4 w-4" />}>
          Add
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Latest BP</p>
          <p className="tabular text-[24px] font-bold text-ink">{last ? `${last.systolic}/${last.diastolic}` : "—"}</p>
          <p className="text-[12px] text-ink-soft">mmHg {last && `· ${last.label} · ${last.source}`}</p>
          {last && <Badge tone={flagTone(bp)} className="mt-1.5">{flagText(bp)}</Badge>}
        </Card>
        <Card className="p-4">
          <p className="text-[12.5px] font-semibold text-ink-muted">Blood sugar</p>
          <p className="tabular text-[24px] font-bold text-ink">{last ? last.sugar : "—"}</p>
          <p className="text-[12px] text-ink-soft">mg/dL {last && `· ${last.sugarType}`}</p>
          {last && <Badge tone={flagTone(sg)} className="mt-1.5">{flagText(sg)}</Badge>}
        </Card>
      </div>

      <Card className="p-4">
        <CardHeader title="Blood pressure, last 7 readings" sub="Home logs from the patient app, plus clinic spot checks" />
        {p.vitals.length >= 2 ? (
          <LineChart
            labels={p.vitals.map((v) => v.label)}
            series={[
              { name: "Systolic", values: p.vitals.map((v) => v.systolic) },
              { name: "Diastolic", values: p.vitals.map((v) => v.diastolic), dashed: true, marker: "square" },
            ]}
            min={60}
            max={180}
            target={{ from: 90, to: 130, label: "Target" }}
            unit="mmHg"
            height={phone ? 170 : 200}
            showValues
          />
        ) : (
          <p className="text-[14px] text-ink-muted">Not enough readings yet. Log a spot check below.</p>
        )}
        <form onSubmit={submitVital} className="mt-4 space-y-2">
          <Eyebrow>Log a clinic spot check</Eyebrow>
          <div className="grid grid-cols-3 gap-2">
            <input aria-label="Systolic" inputMode="numeric" placeholder="Sys" value={sys} onChange={(e) => setSys(e.target.value.replace(/\D/g, ""))} className={cx(inputCls, "h-11 tabular")} />
            <input aria-label="Diastolic" inputMode="numeric" placeholder="Dia" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, ""))} className={cx(inputCls, "h-11 tabular")} />
            <input aria-label="Sugar" inputMode="numeric" placeholder="Sugar" value={sugar} onChange={(e) => setSugar(e.target.value.replace(/\D/g, ""))} className={cx(inputCls, "h-11 tabular")} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={sugarType}
              onChange={(v) => setSugarType(v as VitalType)}
              options={[
                { value: "Fasting", label: "Fasting" },
                { value: "Post-Prandial", label: "After meal" },
              ]}
            />
            <Button type="submit" size="sm">
              Log reading
            </Button>
          </div>
          {vErr && <p className="text-[13px] font-semibold text-coral-dark">{vErr}</p>}
        </form>
      </Card>

      <Card className="p-4">
        <CardHeader title="History" />
        <div className="flex flex-wrap gap-1.5">
          {p.chronic.length ? p.chronic.map((c) => <Badge key={c} tone="info" noIcon>{c}</Badge>) : <span className="text-[14px] text-ink-muted">No chronic conditions</span>}
        </div>
      </Card>

      <Card tone="lav" className="p-4">
        <CardHeader
          title="Chaperone nurse"
          sub={p.chaperone.status === "assigned" ? `${p.chaperone.attendantName} (ID #${p.chaperone.attendantId}) · ${p.chaperone.confirmedAt}` : p.chaperone.status === "pending" ? "Requested. Assign a female nurse before the exam." : "Not requested"}
          right={<Badge tone={p.chaperone.status === "assigned" ? "ok" : p.chaperone.status === "pending" ? "warn" : "neutral"}>{p.chaperone.status === "assigned" ? "Assigned" : p.chaperone.status === "pending" ? "Pending" : "Not requested"}</Badge>}
        />
        {p.chaperone.status !== "assigned" && (
          <div className="flex flex-wrap gap-2">
            <select aria-label="Choose nurse" value={nurse} onChange={(e) => setNurse(e.target.value)} className={cx(inputCls, "h-11 min-w-0 flex-1 text-[14px]")}>
              {NURSES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} · {n.id}
                </option>
              ))}
            </select>
            <Button
              size="md"
              icon={<Shield className="h-4 w-4" />}
              onClick={() => {
                const n = NURSES.find((x) => x.id === nurse)!;
                onConfirmAttendant(n.name, n.id);
              }}
            >
              Assign Chaperone Nurse
            </Button>
            {p.chaperone.status === "not-requested" && (
              <Button size="md" variant="quiet" onClick={onRequestChaperone}>
                Mark as requested
              </Button>
            )}
          </div>
        )}
        {p.chaperone.log.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12.5px] text-lav-ink">
            {p.chaperone.log.slice(0, 3).map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  RX EDITOR                                                                 */
/* -------------------------------------------------------------------------- */

function RxEditor({
  patient,
  draft,
  onDraft,
  onSign,
  onViewRx,
  onToast,
  phone,
}: {
  patient: Patient;
  draft: RxDraft;
  onDraft: (patch: Partial<RxDraft>) => void;
  onSign: () => void;
  onViewRx: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
  phone?: boolean;
}) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [duration, setDuration] = useState("");
  const [instructions, setInstructions] = useState("");
  const [formError, setFormError] = useState("");
  const [signError, setSignError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [checks, setChecks] = useState({ identity: false, allergies: false, dose: false });

  const conflict = findAllergyConflict(name, patient.allergies);
  const alt = conflict ? safeAlternative(conflict) : null;
  const note = interactionNote(name, patient);
  const issued = patient.status === "Prescription Issued" && patient.prescription !== null;
  const overrideCount = draft.meds.filter((m) => m.allergyOverride).length;
  const allChecked = checks.identity && checks.allergies && checks.dose;

  const reset = () => {
    setName("");
    setDosage("");
    setDuration("");
    setInstructions("");
    setOverrideOpen(false);
    setOverrideReason("");
  };

  const pushMed = (med: Omit<RxMedicine, "id">) => {
    onDraft({ meds: [...draft.meds, { ...med, id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }] });
  };

  const addMed = (withOverride = false) => {
    if (!name.trim()) return setFormError("Enter a medicine name or pick a preset.");
    if (!dosage.trim()) return setFormError("Select or type a dosage pattern.");
    if (!duration.trim()) return setFormError("Select or type a duration.");
    if (conflict && !withOverride) return setFormError("Resolve the allergy conflict first.");
    if (withOverride && overrideReason.trim().length < 8) return setFormError("Write a clinical reason (at least 8 characters) to override.");
    setFormError("");
    pushMed({
      name: name.trim(),
      dosage: dosage.trim(),
      duration: duration.trim(),
      instructions: withOverride ? `${instructions.trim() ? `${instructions.trim()}. ` : ""}Allergy override: ${overrideReason.trim()}` : instructions.trim(),
      allergyOverride: withOverride,
    });
    onToast(withOverride ? `${name.trim()} added with a documented allergy override (${conflict})` : `${name.trim()} added`, withOverride ? "warn" : "info");
    reset();
  };

  const replaceWithAlt = () => {
    if (!alt) return;
    pushMed({ name: alt.name, dosage: alt.dosage, duration: alt.duration, instructions: instructions.trim(), allergyOverride: false });
    onToast(`Replaced with ${alt.name}`, "success");
    setFormError("");
    reset();
  };

  const toggleChip = (chip: string) =>
    onDraft({ adviceChips: draft.adviceChips.includes(chip) ? draft.adviceChips.filter((c) => c !== chip) : [...draft.adviceChips, chip] });

  const sign = () => {
    if (name.trim()) return setSignError("A medicine is typed but not added. Add it first, or clear the field.");
    if (draft.meds.length === 0 && draft.adviceChips.length === 0 && !draft.adviceNote.trim()) {
      setSignError("Add at least one medicine or piece of advice before signing.");
      onToast("Prescription is empty", "warn");
      return;
    }
    if (!allChecked) return setSignError("Complete the review checklist before signing.");
    setSignError("");
    onSign();
  };

  if (issued && patient.prescription) {
    return (
      <Card className="p-5">
        <Alert tone="ok" title={`E-prescription ${patient.prescription.hash} issued`} action={<Button size="sm" icon={<Printer className="h-4 w-4" />} onClick={onViewRx}>View and print</Button>}>
          Signed {patient.prescription.issuedAt}. {patient.prescription.meds.length} medicine(s).
        </Alert>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {patient.allergies.length > 0 && (
        <Alert tone="crit" title={`${patient.name.split(" ")[0]} is allergic to ${patient.allergies.join(", ")}`}>
          Conflicting medicines are flagged before they can be added.
        </Alert>
      )}

      <Card className="space-y-4 p-5">
        <CardHeader title="Diagnosis and findings" right={<span className="tabular text-[12px] font-bold text-ink-muted">{patient.token}</span>} />
        <Field label="Diagnosis" htmlFor="rx-dx">
          <input id="rx-dx" value={draft.diagnosis} onChange={(e) => onDraft({ diagnosis: e.target.value })} placeholder="e.g. Unstable angina, rule out NSTEMI" className={inputCls} />
        </Field>
        <Field label="Examination findings" htmlFor="rx-find">
          <textarea id="rx-find" rows={2} value={draft.findings} onChange={(e) => onDraft({ findings: e.target.value })} className={cx(inputCls, "h-auto py-2.5")} />
        </Field>
      </Card>

      <Card className="space-y-3 p-5">
        <CardHeader title="Add medicine" />
        <div className="flex flex-wrap gap-1.5">
          {MED_PRESETS.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => {
                setName(m.name);
                setDosage(m.dosage);
                setDuration(m.duration);
                setFormError("");
              }}
              className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-brand"
            >
              {m.name.replace("Tab. ", "")}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setName("Cap. Amoxicillin 500mg");
              setDosage("1-0-1 After Food");
              setDuration("14 Days");
            }}
            className="rounded-full border border-dashed border-line-strong bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:border-brand"
          >
            Amoxicillin 500mg
          </button>
        </div>
        <Field label="Medicine" htmlFor="rx-med">
          <input
            id="rx-med"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setOverrideOpen(false);
            }}
            placeholder="Type a medicine name"
            className={cx(inputCls, conflict && inputErrCls)}
          />
        </Field>

        {conflict && (
          <Alert tone="crit" title={`Allergy conflict: ${conflict}`}>
            <p>{name} belongs to a drug group this patient is allergic to.</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {alt && (
                <Button size="sm" onClick={replaceWithAlt}>
                  Replace with {alt.name.replace("Tab. ", "").replace(/\s\d.*$/, "")}
                </Button>
              )}
              <Button size="sm" variant="quiet" icon={<Trash2 className="h-4 w-4" />} onClick={reset}>
                Remove
              </Button>
              <Button size="sm" variant="emergencyOutline" onClick={() => setOverrideOpen((v) => !v)}>
                Override with reason
              </Button>
            </div>
            {overrideOpen && (
              <div className="mt-3 space-y-2">
                <textarea
                  aria-label="Override reason"
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Clinical reason, e.g. desensitised under supervision"
                  className={cx(inputCls, "h-auto bg-white py-2 text-[14px]")}
                />
                <Button size="sm" variant="emergency" onClick={() => addMed(true)}>
                  Add with documented override
                </Button>
              </div>
            )}
          </Alert>
        )}
        {!conflict && note && (
          <Alert tone="warn" title="Interaction note">
            {note}
          </Alert>
        )}

        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink">Dosage</p>
          <div className="flex flex-wrap gap-1.5">
            {DOSAGE_PATTERNS.map((d) => (
              <ChoiceChip key={d} on={dosage === d} onClick={() => setDosage(d)} className="!h-9 !px-3 !text-[13px]">
                {d}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[14px] font-semibold text-ink">Duration</p>
          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((d) => (
              <ChoiceChip key={d} on={duration === d} onClick={() => setDuration(d)} className="!h-9 !px-3 !text-[13px]">
                {d}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <Field label="Instructions (optional)" htmlFor="rx-ins">
          <input id="rx-ins" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Avoid grapefruit" className={inputCls} />
        </Field>
        {formError && <p className="text-[13.5px] font-semibold text-coral-dark">{formError}</p>}
        <Button full variant="secondary" icon={<Plus className="h-4 w-4" />} disabled={!!conflict} onClick={() => addMed(false)}>
          {conflict ? "Resolve the conflict to add" : "Add to prescription"}
        </Button>
      </Card>

      <Card className="p-5">
        <CardHeader title="Prescription" sub={`${draft.meds.length} medicine(s)`} right={overrideCount > 0 ? <Badge tone="crit">{overrideCount} override{overrideCount > 1 ? "s" : ""}</Badge> : undefined} />
        {draft.meds.length === 0 ? (
          <p className="text-[14px] text-ink-muted">No medicines yet.</p>
        ) : (
          <ul className="space-y-2">
            {draft.meds.map((m, i) => (
              <li key={m.id} className={cx("flex items-start gap-3 rounded-xl border p-3", m.allergyOverride ? "border-coral-line bg-coral-tint" : "border-line")}>
                <span className="tabular text-[13px] font-bold text-ink-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1 text-[14px]">
                  <p className="font-bold text-ink">{m.name}</p>
                  <p className="text-ink-muted">
                    {m.dosage} · {m.duration}
                  </p>
                  {m.instructions && <p className="text-[13px] text-ink-muted">{m.instructions}</p>}
                  {m.allergyOverride && <Badge tone="crit" className="mt-1">Allergy override documented</Badge>}
                </div>
                <button type="button" aria-label={`Remove ${m.name}`} onClick={() => onDraft({ meds: draft.meds.filter((x) => x.id !== m.id) })} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-white">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <p className="mb-1.5 text-[14px] font-semibold text-ink">Advice and follow-up</p>
          <div className="flex flex-wrap gap-1.5">
            {ADVICE_CHIPS.map((c) => (
              <ChoiceChip key={c} on={draft.adviceChips.includes(c)} onClick={() => toggleChip(c)} className="!h-auto !py-1.5 !px-3 !text-[13px]">
                {c}
              </ChoiceChip>
            ))}
          </div>
          <textarea aria-label="Advice note" rows={2} value={draft.adviceNote} onChange={(e) => onDraft({ adviceNote: e.target.value })} placeholder="Other advice, one per line" className={cx(inputCls, "mt-2 h-auto py-2.5")} />
        </div>
      </Card>

      <Card tone="sage" className="space-y-2.5 p-5">
        <CardHeader title="Review and sign" sub={`Signing as ${DOCTOR.name} · NMC ${DOCTOR.nmc}`} />
        <Checkbox checked={checks.identity} onChange={(v) => setChecks((c) => ({ ...c, identity: v }))}>
          Patient identity confirmed ({patient.token})
        </Checkbox>
        <Checkbox checked={checks.allergies} onChange={(v) => setChecks((c) => ({ ...c, allergies: v }))}>
          Allergies reviewed{overrideCount > 0 ? ` (${overrideCount} override documented)` : ""}
        </Checkbox>
        <Checkbox checked={checks.dose} onChange={(v) => setChecks((c) => ({ ...c, dose: v }))}>
          Doses and durations checked
        </Checkbox>
        {signError && <p className="text-[13.5px] font-semibold text-coral-dark">{signError}</p>}
        <Button full icon={<FileSignature className="h-5 w-5" />} disabled={!allChecked} onClick={sign} className={phone ? "" : "mt-1"}>
          Sign and issue
        </Button>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  RX MODAL (printable)                                                      */
/* -------------------------------------------------------------------------- */

function RxModal({
  patient,
  phone,
  sync,
  onClose,
  onToast,
}: {
  patient: Patient;
  phone?: boolean;
  sync?: "sending" | "delivered" | "local";
  onClose: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
}) {
  const rx = patient.prescription!;
  const copy = async () => {
    const ok = await copyText(buildRxSummary(patient, rx));
    onToast(ok ? "Prescription copied" : "Couldn't copy on this browser", ok ? "success" : "warn");
  };
  return (
    <div className={cx("z-[90] flex items-start justify-center overflow-y-auto bg-ink/50 p-3", phone ? "absolute inset-0" : "fixed inset-0 py-10")} role="dialog" aria-modal="true" aria-label="E-prescription">
      <div className="w-full max-w-2xl">
        <div className="no-print mb-2 flex flex-wrap items-center justify-end gap-2">
          <Badge tone={sync === "delivered" ? "ok" : sync === "sending" ? "info" : "warn"} className="mr-auto bg-white">
            {sync === "delivered" ? "Delivered to patient app" : sync === "sending" ? "Sending" : "Saved locally, cloud not reachable"}
          </Badge>
          <Button size="sm" variant="quiet" icon={<Copy className="h-4 w-4" />} onClick={copy}>
            Copy
          </Button>
          <Button size="sm" variant="quiet" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
          <Button size="sm" variant="quiet" icon={<X className="h-4 w-4" />} onClick={onClose}>
            Close
          </Button>
        </div>
        <div id="rx-print-area" className="rounded-2xl border border-line bg-white p-6 text-ink shadow-frame">
          <div className="flex items-start justify-between gap-4 border-b-2 border-brand pb-4">
            <div>
              <p className="font-brand text-[22px] font-semibold text-brand">CuraPulse</p>
              <p className="text-[13px] text-ink-muted">{DOCTOR.hospital}</p>
            </div>
            <div className="text-right text-[13px]">
              <p className="font-bold">{DOCTOR.name}</p>
              <p className="text-ink-muted">{DOCTOR.title}</p>
              <p className="tabular text-ink-muted">NMC Reg {DOCTOR.nmc}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px]">
            <p>
              <span className="text-ink-muted">Patient: </span>
              <b>{patient.name}</b>, {patient.age}y, {patient.gender}
            </p>
            <p className="text-right tabular">
              <span className="text-ink-muted">Rx: </span>
              <b>{rx.hash}</b>
            </p>
            <p>
              <span className="text-ink-muted">Token: </span>
              {patient.token} · {patient.bay}
            </p>
            <p className="text-right">
              <span className="text-ink-muted">Blood: </span>
              {rx.bloodGroup}
            </p>
            <p className="col-span-2">
              <span className="text-ink-muted">Allergies: </span>
              <b className="text-coral-dark">{rx.allergies.length ? rx.allergies.join(", ") : "None recorded"}</b>
            </p>
            <p className="col-span-2">
              <span className="text-ink-muted">Vitals: </span>
              {rx.vitalsSnapshot}
            </p>
            <p className="col-span-2">
              <span className="text-ink-muted">Chaperone: </span>
              {rx.chaperoneBadge}
            </p>
          </div>
          <div className="mt-4">
            <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Diagnosis</p>
            <p className="text-[15px]">{rx.diagnosis || "Not specified"}</p>
            {rx.findings && <p className="mt-1 text-[13.5px] text-ink-muted">Examination: {rx.findings}</p>}
          </div>
          <div className="mt-4">
            <p className="font-brand text-[26px] font-semibold text-brand">℞</p>
            {rx.meds.length ? (
              <ol className="mt-1 space-y-2">
                {rx.meds.map((m, i) => (
                  <li key={m.id} className="text-[14.5px]">
                    <b>
                      {i + 1}. {m.name}
                    </b>{" "}
                    · {m.dosage} · {m.duration}
                    {m.instructions && <span className="block text-[13px] text-ink-muted">{m.instructions}</span>}
                    {m.allergyOverride && <span className="block text-[12px] font-bold uppercase text-coral-dark">Allergy override documented</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[14px] text-ink-muted">No medicines prescribed.</p>
            )}
          </div>
          {rx.advice.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Advice and follow-up</p>
              <ul className="mt-1 list-disc pl-5 text-[14px]">
                {rx.advice.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-8 flex items-end justify-between gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-brand text-center text-[9px] font-bold uppercase leading-tight text-brand">
              NMC
              <br />
              Verified
              <br />
              Council Seal
            </div>
            <div className="text-right">
              <p className="font-brand text-[22px] italic text-ink">{DOCTOR.name}</p>
              <div className="ml-auto mt-0.5 h-px w-48 bg-ink" />
              <p className="mt-1 text-[12px] text-ink-muted">Digitally signed · {rx.issuedAt}</p>
            </div>
          </div>
          <p className="mt-6 border-t border-line pt-3 text-center text-[11.5px] text-ink-soft">Issued by a registered medical practitioner via CuraPulse. Verify at the pharmacy with the Rx number.</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  REGISTRATION (writes curapulse_doctor_applications for the Support Desk)  */
/* -------------------------------------------------------------------------- */

function MyApplications({ refreshKey }: { refreshKey: number }) {
  const [apps, setApps] = useState<StoredApp[]>([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(REG_STORAGE_KEY) || "[]");
      setApps(Array.isArray(raw) ? (raw as StoredApp[]) : []);
    } catch {
      setApps([]);
    }
  }, [refreshKey]);
  return (
    <Card className="p-4">
      <CardHeader title="Applications from this device" sub="Vetted by the Support Desk" />
      {apps.length === 0 ? (
        <p className="text-[14px] text-ink-muted">None submitted yet.</p>
      ) : (
        <ul className="space-y-2">
          {apps.slice(0, 5).map((a) => {
            const st = String(a.verification_status || "PENDING").toUpperCase();
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 text-[14px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{a.full_name}</p>
                  <p className="tabular text-[12px] text-ink-muted">
                    {a.id} · {a.nmc_registration_id}
                  </p>
                </div>
                <Badge tone={st === "APPROVED" || st === "VERIFIED_ACTIVE" ? "ok" : st === "REJECTED" ? "crit" : st === "MORE_INFO" ? "warn" : "info"}>
                  {st === "APPROVED" || st === "VERIFIED_ACTIVE" ? "Approved" : st === "REJECTED" ? "Rejected" : st === "MORE_INFO" ? "More info needed" : "Pending"}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RegistrationForm({ onToast }: { onToast: (message: string, kind?: ToastKind) => void }) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<RegForm>(EMPTY_REG);
  const [errors, setErrors] = useState<string[]>([]);
  const [appId, setAppId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);

  const set = (k: keyof RegForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fillDemo = () =>
    setForm({
      fullName: "Dr. Meghna Iyer",
      email: "meghna.iyer@example.in",
      phone: "+91 98730 11245",
      councilId: "DMC/R/2019/11873",
      council: "Delhi Medical Council",
      degree: "MBBS, MD",
      specialty: "General Medicine",
      hospital: "Bhagwan Mahavir Hospital, Pitampura",
      address: "H-4/5, Pitampura, New Delhi 110034",
      fee: "600",
      hours: "Mon-Sat, 10:00 AM - 4:00 PM",
      degreeFile: "MD_Degree_Certificate.pdf",
      councilFile: "DMC_Registration_2019.jpg",
    });

  const validate1 = () => {
    const e: string[] = [];
    if (form.fullName.trim().length < 4) e.push("Enter the full name as on the council certificate.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.push("Enter a valid email.");
    if (form.phone.replace(/\D/g, "").length < 10) e.push("Enter a valid 10-digit phone number.");
    if (form.councilId.trim().length < 6) e.push("Enter the NMC / State Council registration number.");
    if (!form.specialty.trim()) e.push("Enter your specialization.");
    setErrors(e);
    return e.length === 0;
  };

  const validate2 = () => {
    const e: string[] = [];
    if (!form.hospital.trim()) e.push("Enter your hospital or clinic.");
    if (!form.address.trim()) e.push("Enter the clinic address.");
    const fee = Number(form.fee);
    if (!Number.isFinite(fee) || fee <= 0) e.push("Enter a consultation fee in rupees.");
    if (!form.degreeFile) e.push("Upload your medical degree scan.");
    if (!form.councilFile) e.push("Upload your council registration certificate.");
    setErrors(e);
    return e.length === 0;
  };

  const submit = async () => {
    if (!validate2()) return;
    setSubmitting(true);
    const id = `APP-${Date.now().toString().slice(-6)}`;
    const record = {
      id,
      full_name: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      nmc_registration_id: form.councilId.trim(),
      state_medical_council: form.council,
      degree: form.degree,
      specialty: form.specialty.trim(),
      hospital_affiliation: form.hospital.trim(),
      address: form.address.trim(),
      consultation_fee: Number(form.fee),
      working_hours: form.hours,
      documents: [form.degreeFile, form.councilFile],
      submitted_at: new Date().toISOString(),
      verification_status: "PENDING",
    };
    try {
      const prev = JSON.parse(window.localStorage.getItem(REG_STORAGE_KEY) || "[]");
      const list = Array.isArray(prev) ? prev : [];
      window.localStorage.setItem(REG_STORAGE_KEY, JSON.stringify([record, ...list].slice(0, 20)));
    } catch {
      // Local storage unavailable; the cloud write below still runs.
    }
    let ok = false;
    try {
      const res = await supabase.from("doctor_applications").insert([record]);
      ok = !res.error;
    } catch {
      ok = false;
    }
    setCloudOk(ok);
    setAppId(id);
    setSubmitting(false);
    setStage(3);
    onToast(`Application ${id} sent to the Support Desk for vetting`, "success");
  };

  const fileField = (k: "degreeFile" | "councilFile", label: string) => (
    <Field label={label} htmlFor={`reg-${k}`}>
      <label htmlFor={`reg-${k}`} className={cx("flex h-12 cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed px-3.5 text-[14px]", form[k] ? "border-brand bg-sage text-sage-ink" : "border-line-strong bg-white text-ink-muted")}>
        {form[k] ? <CheckCircle2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
        <span className="truncate">{form[k] || "Choose a PDF or image"}</span>
      </label>
      <input id={`reg-${k}`} type="file" accept=".pdf,image/*" className="sr-only" onChange={(e) => set(k, e.target.files?.[0]?.name ?? "")} />
    </Field>
  );

  return (
    <Card className="p-5">
      <CardHeader
        title="Register a new doctor"
        sub={stage === 3 ? "Submitted" : `Step ${stage} of 2 · ${stage === 1 ? "Identity and council" : "Practice and documents"}`}
        right={
          stage < 3 ? (
            <Button size="sm" variant="tertiary" onClick={fillDemo}>
              Fill demo
            </Button>
          ) : undefined
        }
      />
      {errors.length > 0 && (
        <Alert tone="crit" className="mb-3" title="Please fix this first">
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {stage === 1 && (
        <div className="space-y-3">
          <Field label="Full name" htmlFor="reg-name">
            <input id="reg-name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email" htmlFor="reg-email">
              <input id="reg-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Phone" htmlFor="reg-phone">
              <input id="reg-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="NMC / State Council registration number" htmlFor="reg-nmc">
            <input id="reg-nmc" value={form.councilId} onChange={(e) => set("councilId", e.target.value)} placeholder="DMC/R/2019/11873" className={cx(inputCls, "tabular")} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Council" htmlFor="reg-council">
              <select id="reg-council" value={form.council} onChange={(e) => set("council", e.target.value)} className={inputCls}>
                {COUNCILS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Degree" htmlFor="reg-degree">
              <select id="reg-degree" value={form.degree} onChange={(e) => set("degree", e.target.value)} className={inputCls}>
                {DEGREES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Specialization" htmlFor="reg-spec">
            <input id="reg-spec" value={form.specialty} onChange={(e) => set("specialty", e.target.value)} placeholder="e.g. General Medicine" className={inputCls} />
          </Field>
          <Button full onClick={() => validate1() && setStage(2)}>
            Continue
          </Button>
        </div>
      )}
      {stage === 2 && (
        <div className="space-y-3">
          <Field label="Hospital or clinic" htmlFor="reg-hosp">
            <input id="reg-hosp" value={form.hospital} onChange={(e) => set("hospital", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Clinic address" htmlFor="reg-addr">
            <input id="reg-addr" value={form.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Consultation fee (₹)" htmlFor="reg-fee">
              <input id="reg-fee" inputMode="numeric" value={form.fee} onChange={(e) => set("fee", e.target.value.replace(/\D/g, ""))} className={inputCls} />
            </Field>
            <Field label="Working hours" htmlFor="reg-hours">
              <input id="reg-hours" value={form.hours} onChange={(e) => set("hours", e.target.value)} className={inputCls} />
            </Field>
          </div>
          {fileField("degreeFile", "Medical degree scan")}
          {fileField("councilFile", "Council registration certificate")}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="quiet" onClick={() => setStage(1)}>
              Back
            </Button>
            <Button loading={submitting} disabled={submitting} onClick={() => void submit()}>
              Submit for vetting
            </Button>
          </div>
        </div>
      )}
      {stage === 3 && (
        <div className="space-y-3">
          <Timeline
            items={[
              { title: "Application saved", sub: appId, state: "done" },
              { title: cloudOk ? "Sent to CuraPulse Cloud" : "Cloud not reachable, kept on this device", sub: cloudOk ? "Confirmed by the server" : "The Support Desk on this device can still see it", state: cloudOk ? "done" : "active" },
              { title: "Support Desk vetting", sub: "Council number and documents are checked by a person", state: "pending" },
            ]}
          />
          <Button
            full
            variant="secondary"
            onClick={() => {
              setForm(EMPTY_REG);
              setErrors([]);
              setStage(1);
            }}
          >
            Register another doctor
          </Button>
        </div>
      )}
    </Card>
  );
}
