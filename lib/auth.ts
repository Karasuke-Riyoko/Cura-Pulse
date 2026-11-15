"use client";

import { supabase } from "@/lib/supabase";

/** Who is signed in on this device. Stored in localStorage so every portal can read it. */
export type Role = "patient" | "doctor" | "support" | "admin";
export type Sex = "Female" | "Male" | "Other";

export interface Session {
  role: Role;
  userId: string;
  firstName: string;
  surname: string;
  age: string;
  sex: Sex | "";
  method: "email" | "phone";
  contact: string;
  /** "real" when the code was checked by Supabase Auth, "demo" for the demo phone code. */
  verifiedBy: "real" | "demo";
  /** Doctors only: verification state set by the Support Desk. */
  doctorStatus?: "PENDING" | "VERIFIED_ACTIVE" | "MORE_INFO" | "REJECTED";
  doctorAppId?: string;
  /** Staff only (support/admin): the preset staff ID they signed in with. */
  staffId?: string;
  isDemo?: boolean;
  signedInAt: string;
}

export const SESSION_KEY = "curapulse_session";
export const DEMO_PHONE_OTP = "482910";

export const fullName = (s: Pick<Session, "firstName" | "surname">) => [s.firstName.trim(), s.surname.trim()].filter(Boolean).join(" ");

/** One session per role, so one laptop can be signed in as doctor and support at the same time. */
const keyOf = (role: Role) => `${SESSION_KEY}_${role}`;

export function readSession(role: Role = "patient"): Session | null {
  try {
    const raw = window.localStorage.getItem(keyOf(role));
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.role && s.firstName ? s : null;
  } catch {
    return null;
  }
}

export function writeSession(s: Session) {
  try {
    window.localStorage.setItem(keyOf(s.role), JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

export function signOut(role: Role = "patient") {
  try {
    window.localStorage.removeItem(keyOf(role));
  } catch {
    /* ignore */
  }
  void supabase.auth.signOut().catch(() => undefined);
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const phoneDigits = (v: string) => v.replace(/\D/g, "");

/** Sends a 6-digit code. Email goes through Supabase Auth; phone uses the demo code. */
export async function sendCode(method: "email" | "phone", contact: string, meta: Record<string, string>): Promise<{ ok: boolean; demo: boolean; error?: string }> {
  if (method === "phone") return { ok: true, demo: true };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: contact.trim().toLowerCase(),
      // emailRedirectTo: if the email template still sends a link instead of a code, the link brings people back here.
      options: { shouldCreateUser: true, data: meta, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) return { ok: false, demo: false, error: friendly(error.message) };
    return { ok: true, demo: false };
  } catch (e) {
    return { ok: false, demo: false, error: friendly(e instanceof Error ? e.message : String(e)) };
  }
}

/** Checks the code. Returns the Supabase user id for email sign-ins. */
export async function verifyCode(method: "email" | "phone", contact: string, code: string): Promise<{ ok: boolean; userId?: string; meta?: Record<string, unknown>; error?: string }> {
  const token = code.replace(/\D/g, "");
  if (method === "phone") {
    return token === DEMO_PHONE_OTP ? { ok: true, userId: `phone-${phoneDigits(contact)}` } : { ok: false, error: "That code is not right. Check it and try again." };
  }
  try {
    const { data, error } = await supabase.auth.verifyOtp({ email: contact.trim().toLowerCase(), token, type: "email" });
    if (error || !data.user) return { ok: false, error: friendly(error?.message ?? "Code could not be checked.") };
    return { ok: true, userId: data.user.id, meta: data.user.user_metadata ?? undefined };
  } catch (e) {
    return { ok: false, error: friendly(e instanceof Error ? e.message : String(e)) };
  }
}

/** Best-effort save of the profile row (table public.profiles). Never blocks sign-in. */
/** Google sign-in through Supabase. Comes back to /login with #access_token, handled by userFromRedirect. */
export async function startGoogle(): Promise<{ error?: string }> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/login` } });
    if (error) return { error: /provider is not enabled|unsupported provider/i.test(error.message) ? "Google sign-in isn't turned on in Supabase yet (Authentication → Sign In / Providers → Google)." : friendly(error.message) };
    return {};
  } catch (e) {
    return { error: friendly(e instanceof Error ? e.message : String(e)) };
  }
}

/** If the email held a sign-in link instead of a code, Supabase sends people back with #access_token=... */
export async function userFromRedirect(): Promise<{ userId: string; email: string; meta?: Record<string, unknown> } | { error: string } | null> {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errDesc = hash.get("error_description");
  if (errDesc) return { error: friendly(errDesc.replace(/\+/g, " ")) };
  const token = hash.get("access_token");
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { error: friendly(error?.message ?? "Sign-in link could not be checked.") };
    return { userId: data.user.id, email: data.user.email ?? "", meta: data.user.user_metadata ?? undefined };
  } catch (e) {
    return { error: friendly(e instanceof Error ? e.message : String(e)) };
  }
}

export async function saveProfileRow(s: Session, extra: Record<string, unknown> = {}) {
  if (s.method !== "email" || s.verifiedBy !== "real") return;
  try {
    await supabase.from("profiles").upsert({
      id: s.userId,
      role: s.role,
      full_name: fullName(s),
      ...extra,
    });
  } catch {
    /* profile row is optional for the demo */
  }
}

function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (/rate|too many|security purposes/.test(m)) return "Too many codes were sent. Wait a minute and try again.";
  if (/expired|invalid|token/.test(m)) return "That code is wrong or has expired. Request a new one.";
  if (/fetch|network|failed to/.test(m)) return "Can't reach CuraPulse Cloud. Check your internet connection.";
  if (/signups not allowed|disabled/.test(m)) return "Email sign-in is turned off in Supabase (Authentication → Providers → Email).";
  return msg;
}

/** Path each role lands on after sign-in. */
export const HOME_OF: Record<Role, string> = { patient: "/", doctor: "/doctor", support: "/support", admin: "/admin" };

/** Ready-made verified doctor for demos (skips the multi-day review). */
export const DEMO_DOCTOR: Session = {
  role: "doctor",
  userId: "demo-doctor-d1",
  firstName: "Dr. Sunita",
  surname: "Sharma",
  age: "41",
  sex: "Female",
  method: "email",
  contact: "dr.sunita.demo@curapulse.app",
  verifiedBy: "demo",
  doctorStatus: "VERIFIED_ACTIVE",
  isDemo: true,
  signedInAt: "",
};
