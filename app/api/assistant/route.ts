import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * CuraPulse Assistant: AI wellness helper.
 * Guardrails follow India's Telemedicine Practice Guidelines 2020 (AI may not diagnose or prescribe;
 * emergencies are routed to 108/SOS) and the DPDP Act 2023 (data minimisation: the client sends no
 * name, phone or ID; nothing is stored server-side; personal identifiers typed by the user are masked
 * before the text leaves this server).
 */

// Server-only secret (same key as /api/symptom-check). Never sent to the browser.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest"];

type Action = "book" | "sos" | "pharmacies" | "vitals" | "records" | "symptom";
interface Suggestion {
  label: string;
  action: Action;
  specialty?: string;
}
interface Reply {
  reply: string;
  suggestions: Suggestion[];
  emergency: boolean;
  source: "gemini" | "guardrail" | "offline";
}

const EMERGENCY = /(chest pain|chest pressure|can'?t breathe|cannot breathe|not breathing|difficulty breathing|unconscious|fainted|passed out|seizure|stroke|face droop|slurred|severe bleeding|heavy bleeding|suicid|kill myself|end my life|overdose|poison|snake ?bite|anaphyla|throat swelling|heart attack)/i;
const SELF_HARM = /(suicid|kill myself|end my life|self.?harm|hurt myself)/i;

// Rate limit: 20 requests per minute per IP (in-memory, per server instance).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

/** Masks Aadhaar, PAN, phone numbers and emails before text goes to the AI provider. */
function maskPII(t: string) {
  return t
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[ID removed]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[ID removed]")
    .replace(/(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, "[phone removed]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email removed]");
}

/** Blocks dosage-style instructions in case the model slips. */
function stripDosing(t: string) {
  return /\b\d+(\.\d+)?\s?(mg|mcg|ml|units?|tablets?|tabs?|puffs?)\b/i.test(t)
    ? t.replace(/[^.\n]*\b\d+(\.\d+)?\s?(mg|mcg|ml|units?|tablets?|tabs?|puffs?)\b[^.\n]*[.\n]?/gi, "") +
        "\n\nI can't suggest medicine doses. A registered doctor can, after a consultation."
    : t;
}

const ALLOWED_ACTIONS: Action[] = ["book", "sos", "pharmacies", "vitals", "records", "symptom"];

function emergencyReply(selfHarm: boolean): Reply {
  return {
    reply: selfHarm
      ? "I'm really glad you told me. You deserve support right now. Please call Tele-MANAS on 14416 (free, 24x7) or 112 if you are in danger. If you can, stay with someone you trust. You can also press SOS and our Support Desk will reach you."
      : "This could be an emergency. Press SOS now so the Support Desk can send an ambulance, or call 108. Don't drive yourself. Stay with someone if you can.",
    suggestions: [{ label: "Start SOS", action: "sos" }],
    emergency: true,
    source: "guardrail",
  };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many messages. Wait a minute." }, { status: 429 });

  let body: { messages?: { role: string; text: string }[]; profile?: { age?: string; sex?: string; allergies?: string[]; conditions?: string[] } } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-8)
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", text: maskPII(String(m.text ?? "").slice(0, 1000)) }))
    .filter((m) => m.text.trim());
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return NextResponse.json({ error: "Send a message." }, { status: 400 });

  const lastText = msgs[msgs.length - 1].text;
  if (EMERGENCY.test(lastText)) return NextResponse.json(emergencyReply(SELF_HARM.test(lastText)));

  const p = body.profile ?? {};
  const context = `Patient context (no identifiers): age ${String(p.age ?? "unknown").slice(0, 3)}, sex ${String(p.sex ?? "unknown").slice(0, 10)}, allergies: ${(p.allergies ?? []).slice(0, 10).join(", ") || "none listed"}, conditions: ${(p.conditions ?? []).slice(0, 10).join(", ") || "none listed"}.`;

  const system = `You are "CuraPulse Assistant", a friendly health and wellness helper inside an Indian healthcare app. Follow India's Telemedicine Practice Guidelines 2020:
- You are NOT a doctor. Never diagnose. Never name a prescription medicine or give any dose. Over-the-counter advice must be generic ("ask a pharmacist") and must respect the listed allergies.
- If anything sounds urgent, tell them to press SOS or call 108.
- Suggest practical next steps: which kind of specialist to see, home-care and lifestyle tips (Indian diet, hydration, sleep, yoga/walking), when to see a doctor, what to log in vitals, questions to ask the doctor.
- Answer in the user's language (English, Hindi or Hinglish). Keep it under 120 words, warm and plain. No markdown headings; short sentences or up to 4 bullets with "•".
- Never ask for Aadhaar, phone, address or full name.
${context}
Reply ONLY with JSON: {"reply": string, "suggestions": [{"label": string (max 4 words), "action": "book"|"pharmacies"|"vitals"|"records"|"symptom", "specialty"?: string}] (0-3 items)}`;

  for (const model of GEMINI_MODELS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: msgs.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
          generationConfig: { temperature: 0.4, responseMimeType: "application/json", maxOutputTokens: 600 },
          safetySettings: [
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      const text: string = json?.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text ?? "").join("") ?? "";
      const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
      const reply = stripDosing(String(parsed.reply ?? "").slice(0, 1500)).trim();
      if (!reply) continue;
      const suggestions: Suggestion[] = (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
        .filter((s: Suggestion) => ALLOWED_ACTIONS.includes(s?.action) && s.action !== "sos")
        .slice(0, 3)
        .map((s: Suggestion) => ({ label: String(s.label).slice(0, 30), action: s.action, specialty: s.specialty ? String(s.specialty).slice(0, 40) : undefined }));
      return NextResponse.json({ reply, suggestions, emergency: false, source: "gemini" } satisfies Reply);
    } catch {
      // try next model
    }
  }
  return NextResponse.json({
    reply: "I can't reach the AI service right now. You can describe your symptoms in Check symptoms, book a doctor, or message the Support Desk.",
    suggestions: [
      { label: "Check symptoms", action: "symptom" },
      { label: "Find a doctor", action: "book" },
    ],
    emergency: false,
    source: "offline",
  } satisfies Reply);
}
