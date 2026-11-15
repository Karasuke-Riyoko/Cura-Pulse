import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-only secret read from environment variables. Never exposed to browser.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Gemini 1.5 Flash is tried first as specified. Google has retired it for this key,
// so the route automatically falls through to the current Flash-family models.
const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
];
const PER_MODEL_TIMEOUT_MS = 8000;

type UrgencyLevel = "LOW" | "MEDIUM" | "CRITICAL";

interface SymptomCheckRequest {
  symptoms: string;
  age: number | null;
  allergies: string[];
  chronic_conditions: string[];
}

interface SymptomCheckResponse {
  urgency_level: UrgencyLevel;
  first_aid_steps: string[];
  specialist_recommendation: string;
  contraindication_warnings: string[];
  source: "gemini" | "offline-fallback";
  model?: string;
}

const SOS_FIRST_STEP =
  "Press the red SOS button now. The CuraPulse 24/7 Support Desk will receive your location and Emergency Health Snapshot and send an ambulance. You can also call 108 directly.";

const CRITICAL_KEYWORDS = [
  "chest pain", "chest pressure", "chest tightness", "tightness in chest", "crushing", "heart attack",
  "pain radiating", "left arm", "jaw pain", "stroke", "paralysis", "paralyzed", "facial droop",
  "face drooping", "slurred speech", "numbness on one side", "one side of the body", "unconscious",
  "unresponsive", "passed out", "fainted", "not breathing", "shortness of breath", "difficulty breathing",
  "trouble breathing", "can't breathe", "cannot breathe", "gasping", "severe bleeding",
  "uncontrolled bleeding", "bleeding heavily", "won't stop bleeding", "head injury", "major accident",
  "seizure", "convulsion", "anaphylaxis", "throat swelling", "swelling of the throat",
  "suicidal", "overdose", "poison", "snake bite", "snakebite",
];

const MEDIUM_KEYWORDS = [
  "fever", "vomit", "diarrh", "rash", "headache", "migraine", "dizzy", "dizziness", "cough",
  "abdominal pain", "stomach pain", "back pain", "sprain", "swelling", "wheez", "palpitation",
  "infection", "burn", "cut", "blood sugar", "sugar low", "hypoglyc",
];

const SPECIALTY_MAP: { words: string[]; specialist: string }[] = [
  { words: ["chest", "heart", "palpitation", "blood pressure"], specialist: "Cardiologist" },
  { words: ["breath", "wheez", "asthma", "cough", "lung"], specialist: "Pulmonologist" },
  { words: ["stroke", "numb", "seizure", "convulsion", "migraine", "headache", "slurred"], specialist: "Neurologist" },
  { words: ["skin", "rash", "itch", "acne", "eczema"], specialist: "Dermatologist" },
  { words: ["period", "pregnan", "pelvic", "menstru", "vaginal", "breast"], specialist: "Gynaecologist" },
  { words: ["stomach", "abdominal", "vomit", "diarrh", "acidity", "ulcer"], specialist: "Gastroenterologist" },
  { words: ["sugar", "diabet", "thyroid", "hypoglyc"], specialist: "Endocrinologist" },
  { words: ["bone", "joint", "fracture", "sprain", "back pain", "knee"], specialist: "Orthopaedic Specialist" },
  { words: ["child", "baby", "infant"], specialist: "Paediatrician" },
  { words: ["eye", "vision"], specialist: "Ophthalmologist" },
  { words: ["ear", "throat", "nose", "sinus"], specialist: "ENT Specialist" },
  { words: ["anxiety", "panic", "depress", "sleep"], specialist: "Psychiatrist / Counsellor" },
];

const NSAID_PATTERN = /nsaid|ibuprofen|aspirin|naproxen|diclofenac/i;
const NSAID_RISK_CONDITIONS = ["asthma", "ulcer", "peptic", "gastritis", "gerd", "reflux", "kidney", "renal", "bleeding", "hypertension"];

// Lines that look like a medicine order or a dose are dropped from the model output.
const PRESCRIPTION_PATTERN =
  /(\b\d+\s?(mg|mcg|ml|iu)\b|\btablet|\btab\.|\bcapsule|\bsyrup\b|\btake\s+(a|an|one|two)?\s*(paracetamol|ibuprofen|aspirin|antibiotic)|antibiotic course|\bprescrib)/i;

function lower(s: string) {
  return s.toLowerCase();
}

function isCritical(symptoms: string): boolean {
  const t = lower(symptoms);
  return CRITICAL_KEYWORDS.some((k) => t.includes(k));
}

function guessSpecialist(symptoms: string, critical: boolean): string {
  if (critical) return "Emergency Medicine (nearest 24/7 emergency room)";
  const t = lower(symptoms);
  const hit = SPECIALTY_MAP.find((m) => m.words.some((w) => t.includes(w)));
  return hit ? hit.specialist : "General Physician";
}

function hasNsaidRisk(p: SymptomCheckRequest): boolean {
  const conds = p.chronic_conditions.map(lower);
  return (
    conds.some((c) => NSAID_RISK_CONDITIONS.some((r) => c.includes(r))) ||
    p.allergies.some((a) => NSAID_PATTERN.test(a))
  );
}

function baseWarnings(p: SymptomCheckRequest): string[] {
  const out: string[] = [];
  if (hasNsaidRisk(p)) {
    out.push(
      "Avoid over-the-counter pain relievers such as Ibuprofen, Aspirin or Diclofenac until a doctor says they are safe for you. With asthma, stomach ulcers, kidney problems or high blood pressure they can make things worse."
    );
  }
  if (p.allergies.some((a) => /penicillin/i.test(a))) {
    out.push("Penicillin allergy on file. Tell every doctor and paramedic before any antibiotic is given (this includes Amoxicillin and Augmentin).");
  }
  if (p.allergies.some((a) => /sulfa/i.test(a))) {
    out.push("Sulfa allergy on file. Remind the treating doctor before any new medicine is started.");
  }
  if (p.allergies.some((a) => /latex/i.test(a))) {
    out.push("Latex allergy on file. Ask responders to use latex-free gloves and bandages.");
  }
  if (p.allergies.some((a) => /peanut/i.test(a))) {
    out.push("Peanut allergy on file. Avoid unknown foods while unwell. If lips or throat swell, press SOS.");
  }
  if (p.chronic_conditions.some((c) => /diabet/i.test(c))) {
    out.push("Diabetes on file. Check your blood sugar if you can and share the latest reading with the doctor.");
  }
  if (p.chronic_conditions.some((c) => /epilep/i.test(c))) {
    out.push("Epilepsy on file. If a seizure starts, do not put anything in the mouth and do not hold the person down.");
  }
  out.push("This assistant never prescribes medicines. Only a registered doctor can recommend or change your medication.");
  return out;
}

function offlineAdvisory(p: SymptomCheckRequest): SymptomCheckResponse {
  const critical = isCritical(p.symptoms);
  const t = lower(p.symptoms);
  const medium =
    !critical &&
    (MEDIUM_KEYWORDS.some((k) => t.includes(k)) ||
      p.chronic_conditions.length > 0 ||
      (p.age !== null && (p.age >= 65 || p.age <= 5)));

  const urgency_level: UrgencyLevel = critical ? "CRITICAL" : medium ? "MEDIUM" : "LOW";

  const first_aid_steps = critical
    ? [
        SOS_FIRST_STEP,
        "Sit or lie down in the position that makes breathing easiest. Loosen tight clothing at the neck, chest and waist.",
        "Do not eat or drink anything, and do not drive yourself to hospital.",
        "Keep someone with you and unlock the door so responders can get in.",
        "If the person stops breathing or does not respond, start hands-only CPR: push hard and fast in the centre of the chest.",
      ]
    : medium
    ? [
        "Rest in a cool, quiet, well-ventilated place and avoid heavy activity.",
        "Sip water or oral rehydration solution slowly through the day.",
        "Note when the symptoms started and whether they are getting better or worse, so you can tell the doctor.",
        "Book a consultation within 24 hours using Doctor Search.",
        "If you feel faint, breathless, confused or the pain becomes severe, press SOS immediately.",
      ]
    : [
        "Rest and stay hydrated.",
        "Keep a simple note of how you feel over the next day.",
        "Book a routine consultation if symptoms last more than 2 to 3 days.",
        "Press SOS if anything suddenly gets much worse.",
      ];

  return {
    urgency_level,
    first_aid_steps,
    specialist_recommendation: guessSpecialist(p.symptoms, critical),
    contraindication_warnings: baseWarnings(p),
    source: "offline-fallback",
  };
}

function systemPrompt(): string {
  return `You are a certified clinical safety assistant inside the CuraPulse patient app in India.

Hard rules:
1. You MUST NEVER prescribe medications, name a prescription drug to take, or suggest specific drug dosages. This follows Indian National Medical Commission telemedicine guidelines. You may warn the patient about what to AVOID given their allergies and conditions.
2. You provide only: an urgency level, plain-language first-aid steps, the type of specialist to see, and contraindication warnings based on the patient's allergies and chronic conditions.
3. Use simple, calm, short sentences a frightened person can follow. Never use the words "triage" or "triad".
4. If symptoms suggest a life-threatening emergency (chest pain or pressure, pain spreading to the arm or jaw, stroke signs, severe breathing difficulty, unconsciousness, seizure, severe bleeding, severe allergic reaction, poisoning or overdose), set urgency_level to "CRITICAL" and make the FIRST first-aid step tell the user to press the SOS button or call 108.
5. If the patient has asthma, stomach ulcers, kidney disease or hypertension, warn against NSAID pain relievers in contraindication_warnings.
6. Return ONLY one JSON object with exactly this shape and no other text:
{"urgency_level":"LOW"|"MEDIUM"|"CRITICAL","first_aid_steps":[string],"specialist_recommendation":string,"contraindication_warnings":[string]}`;
}

function userPrompt(p: SymptomCheckRequest): string {
  return `Patient profile:
- Age: ${p.age ?? "not provided"}
- Known allergies: ${p.allergies.length ? p.allergies.join(", ") : "none reported"}
- Chronic conditions: ${p.chronic_conditions.length ? p.chronic_conditions.join(", ") : "none reported"}

Symptoms described by the patient:
"""${p.symptoms.slice(0, 1500)}"""

Return the JSON safety advisory now.`;
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : String(x ?? "")).trim())
    .filter((x) => x.length > 0)
    .map((x) => x.replace(/triage/gi, "urgency check").replace(/triad/gi, "group"));
}

function reconcile(raw: Record<string, unknown>, p: SymptomCheckRequest, model: string): SymptomCheckResponse {
  const fallback = offlineAdvisory(p);
  const lvl = String(raw.urgency_level ?? "").toUpperCase();
  let urgency_level: UrgencyLevel = lvl === "LOW" || lvl === "MEDIUM" || lvl === "CRITICAL" ? lvl : fallback.urgency_level;
  // Safety floor: keyword-detected emergencies can never be downgraded by the model.
  if (isCritical(p.symptoms)) urgency_level = "CRITICAL";

  let first_aid_steps = cleanList(raw.first_aid_steps).filter((s) => !PRESCRIPTION_PATTERN.test(s));
  if (first_aid_steps.length === 0) first_aid_steps = fallback.first_aid_steps;
  if (urgency_level === "CRITICAL" && !/sos|108|112|ambulance/i.test(first_aid_steps[0] ?? "")) {
    first_aid_steps = [SOS_FIRST_STEP, ...first_aid_steps];
  }

  const contraindication_warnings = cleanList(raw.contraindication_warnings).filter(
    (s) => !/\b\d+\s?(mg|mcg|ml)\b/i.test(s)
  );
  for (const w of baseWarnings(p)) {
    const key = w.split(" ").slice(0, 3).join(" ");
    const alreadyCovered =
      contraindication_warnings.some((c) => c.includes(key)) ||
      (NSAID_PATTERN.test(w) && contraindication_warnings.some((c) => NSAID_PATTERN.test(c)));
    if (!alreadyCovered) contraindication_warnings.push(w);
  }

  const spec =
    typeof raw.specialist_recommendation === "string" && raw.specialist_recommendation.trim()
      ? raw.specialist_recommendation.trim()
      : fallback.specialist_recommendation;

  return {
    urgency_level,
    first_aid_steps: first_aid_steps.slice(0, 7),
    specialist_recommendation: spec,
    contraindication_warnings: contraindication_warnings.slice(0, 8),
    source: "gemini",
    model,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callGemini(model: string, p: SymptomCheckRequest): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_MODEL_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        cache: "no-store",
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: userPrompt(p) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 2048 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((x) => !x.thought && typeof x.text === "string")
      .map((x) => x.text)
      .join("");
    return text ? extractJson(text) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const symptoms = typeof body.symptoms === "string" ? body.symptoms.trim() : "";
  if (!symptoms) {
    return NextResponse.json({ error: "Please describe your symptoms." }, { status: 400 });
  }

  const ageNum = Number(body.age);
  const payload: SymptomCheckRequest = {
    symptoms,
    age: Number.isFinite(ageNum) && ageNum > 0 && ageNum < 130 ? Math.round(ageNum) : null,
    allergies: toStringArray(body.allergies),
    chronic_conditions: toStringArray(body.chronic_conditions),
  };

  for (const model of GEMINI_MODELS) {
    const raw = await callGemini(model, payload);
    if (raw) {
      return NextResponse.json(reconcile(raw, payload, model), { status: 200 });
    }
  }

  return NextResponse.json(offlineAdvisory(payload), { status: 200 });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/symptom-check",
    body: "{ symptoms: string, age?: number, allergies?: string[], chronic_conditions?: string[] }",
    returns: "{ urgency_level, first_aid_steps, specialist_recommendation, contraindication_warnings }",
  });
}
