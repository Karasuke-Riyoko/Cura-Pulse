import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preset staff accounts. These live only on the server, so the passwords never reach the browser.
 * Change them here before the demo. After the password check the person still verifies by email code.
 */
const STAFF: { id: string; password: string; role: "support" | "admin"; name: string; surname: string }[] = [
  { id: "support01", password: "CuraSupport@2026", role: "support", name: "Priya", surname: "Nair" },
  { id: "support02", password: "CuraSupport@2026", role: "support", name: "Rahul", surname: "Menon" },
  { id: "admin01", password: "CuraAdmin@2026", role: "admin", name: "Admin", surname: "CuraPulse" },
];

export async function POST(req: NextRequest) {
  let body: { id?: string; password?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const id = String(body.id ?? "").trim().toLowerCase();
  const pass = String(body.password ?? "");
  const acct = STAFF.find((s) => s.id === id && s.password === pass && (!body.role || s.role === body.role));
  // Small fixed delay so guessing passwords is slower.
  await new Promise((r) => setTimeout(r, 400));
  if (!acct) return NextResponse.json({ ok: false, error: "Staff ID or password is wrong." }, { status: 401 });
  return NextResponse.json({ ok: true, role: acct.role, firstName: acct.name, surname: acct.surname, staffId: acct.id });
}
