import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Server-only secret read from environment variables. Never sent to the browser.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;

export interface DocReview {
  verdict: "LOOKS_VALID" | "NEEDS_ATTENTION" | "UNREADABLE";
  document_type: string;
  extracted: { name: string; registration_number: string; council_or_university: string; issue_date: string; expiry_date: string };
  issues: string[];
  summary: string;
  source: "gemini" | "offline";
}

interface Claimed {
  fullName: string;
  registrationNo: string;
  council: string;
  qualification: string;
}

function offlineReview(c: Claimed, fileName: string, why: string): DocReview {
  return {
    verdict: "NEEDS_ATTENTION",
    document_type: "Not analysed",
    extracted: { name: "", registration_number: "", council_or_university: "", issue_date: "", expiry_date: "" },
    issues: [`AI check could not run (${why}). Support must review "${fileName}" by hand.`],
    summary: `Claimed: ${c.fullName}, ${c.qualification}, reg. ${c.registrationNo} (${c.council}).`,
    source: "offline",
  };
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the document as form data." }, { status: 400 });
  }
  const file = form.get("file");
  const claimed: Claimed = {
    fullName: String(form.get("fullName") ?? ""),
    registrationNo: String(form.get("registrationNo") ?? ""),
    council: String(form.get("council") ?? ""),
    qualification: String(form.get("qualification") ?? ""),
  };
  if (!(file instanceof File)) return NextResponse.json({ error: "No document attached." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Upload a PDF, JPG, PNG or WEBP file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 400 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are helping a medical platform's support team pre-screen a doctor's credential document. You do NOT approve or reject; a human makes the final decision.
Today is ${today}. The applicant claims:
- Name: ${claimed.fullName}
- Qualification: ${claimed.qualification}
- Registration number: ${claimed.registrationNo}
- Council / university: ${claimed.council}

Read the attached document and reply with ONLY JSON in this shape:
{"verdict":"LOOKS_VALID"|"NEEDS_ATTENTION"|"UNREADABLE","document_type":string,"extracted":{"name":string,"registration_number":string,"council_or_university":string,"issue_date":string,"expiry_date":string},"issues":string[],"summary":string}
List in "issues" every VISIBLE problem: name or number not matching the claim, missing registration number, expired or future dates, wrong document type (not a medical degree/registration), blurred or cropped text, signs of editing, missing seal/signature. Use "" for fields you cannot read. Keep each issue under 20 words. If nothing is wrong, issues is [].`;

  for (const model of GEMINI_MODELS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data } }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const json = await res.json();
      const text: string = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      const parsed = JSON.parse(text.replace(/^```json\s*|```$/g, "").trim());
      const ex = parsed.extracted ?? {};
      const review: DocReview = {
        verdict: ["LOOKS_VALID", "NEEDS_ATTENTION", "UNREADABLE"].includes(parsed.verdict) ? parsed.verdict : "NEEDS_ATTENTION",
        document_type: String(parsed.document_type ?? "Unknown"),
        extracted: {
          name: String(ex.name ?? ""),
          registration_number: String(ex.registration_number ?? ""),
          council_or_university: String(ex.council_or_university ?? ""),
          issue_date: String(ex.issue_date ?? ""),
          expiry_date: String(ex.expiry_date ?? ""),
        },
        issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 10) : [],
        summary: String(parsed.summary ?? ""),
        source: "gemini",
      };
      if (review.issues.length && review.verdict === "LOOKS_VALID") review.verdict = "NEEDS_ATTENTION";
      return NextResponse.json(review);
    } catch {
      // try next model
    }
  }
  return NextResponse.json(offlineReview(claimed, file.name, "AI service unavailable"));
}
