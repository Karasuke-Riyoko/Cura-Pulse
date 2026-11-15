"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, FileUp, KeyRound, Mail, ShieldCheck, Smartphone, Sparkles, Stethoscope, User, UserCog } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DEMO_DOCTOR,
  DEMO_PHONE_OTP,
  HOME_OF,
  Role,
  Session,
  Sex,
  fullName,
  isEmail,
  phoneDigits,
  readSession,
  saveProfileRow,
  sendCode,
  startGoogle,
  userFromRedirect,
  verifyCode,
  writeSession,
} from "@/lib/auth";
import { Alert, Badge, Button, ChoiceChip, Field, cx, inputCls, inputErrCls } from "@/components/ui";

type Tab = "patient" | "doctor" | "staff";
type Step = "details" | "method" | "code" | "professional" | "review" | "pending" | "staffCreds";
type Mode = "signup" | "login";

interface DocReview {
  verdict: "LOOKS_VALID" | "NEEDS_ATTENTION" | "UNREADABLE";
  document_type: string;
  extracted: { name: string; registration_number: string; council_or_university: string; issue_date: string; expiry_date: string };
  issues: string[];
  summary: string;
  source: "gemini" | "offline";
}

const ACCOUNTS_KEY = "curapulse_accounts";
const PENDING_KEY = "curapulse_pending_signin";
const APPS_KEY = "curapulse_doctor_applications";
const COUNCILS = ["National Medical Commission (NMC)", "Delhi Medical Council", "Maharashtra Medical Council", "Karnataka Medical Council", "Tamil Nadu Medical Council", "West Bengal Medical Council", "Other State Medical Council"];

/** Local copy of who signed up with which email/phone, so "Log in" can find the name again on this device. */
function rememberAccount(s: Session) {
  try {
    const all = JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) || "{}");
    all[`${s.role}:${s.contact.toLowerCase()}`] = { firstName: s.firstName, surname: s.surname, age: s.age, sex: s.sex, doctorAppId: s.doctorAppId, doctorStatus: s.doctorStatus };
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
function recallAccount(role: Role, contact: string): Partial<Session> | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) || "{}");
    return all[`${role}:${contact.toLowerCase()}`] ?? null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("patient");
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex | "">("");

  const [method, setMethod] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [codeIsDemo, setCodeIsDemo] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const verified = useRef<{ userId: string; real: boolean } | null>(null);

  const [qualification, setQualification] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [regNo, setRegNo] = useState("");
  const [council, setCouncil] = useState(COUNCILS[0]);
  const [experience, setExperience] = useState("");
  const [hospital, setHospital] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extraNote, setExtraNote] = useState("");
  const [review, setReview] = useState<DocReview | null>(null);
  const [appId, setAppId] = useState("");

  const [staffRole, setStaffRole] = useState<"support" | "admin">("support");
  const [staffId, setStaffId] = useState("");
  const [staffPass, setStaffPass] = useState("");
  const staffInfo = useRef<{ firstName: string; surname: string; staffId: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const q = new URLSearchParams(window.location.search).get("role");
    const want = (["patient", "doctor", "support", "admin"] as Role[]).includes(q as Role) ? (q as Role) : "patient";
    const s = readSession(want);
    if (s) {
      router.replace(HOME_OF[s.role]);
      return;
    }
    if (q === "doctor") setTab("doctor");
    if (q === "support" || q === "admin") {
      setTab("staff");
      setStaffRole(q);
      setStep("staffCreds");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Came back from an emailed sign-in link: restore the form, then finish once state is applied.
  const [resume, setResume] = useState<{ userId: string; meta?: Record<string, unknown> } | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await userFromRedirect();
      if (!r) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if ("error" in r) {
        setError(`${r.error} Request a new code.`);
        return;
      }
      try {
        const p = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "null");
        if (p) {
          setTab(p.tab);
          setMode(p.mode);
          setStaffRole(p.staffRole);
          staffInfo.current = p.staff ?? null;
          setFirstName(p.firstName);
          setSurname(p.surname);
          setAge(p.age);
          setSex(p.sex);
          setMethod("email");
          setContact(r.email || p.contact);
        } else {
          setMode("login");
          setMethod("email");
          setContact(r.email);
        }
      } catch {
        setMode("login");
        setMethod("email");
        setContact(r.email);
      }
      setResume({ userId: r.userId, meta: r.meta });
    })();
  }, []);
  useEffect(() => {
    if (!resume) return;
    setResume(null);
    afterVerified(resume.userId, resume.meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const role: Role = tab === "staff" ? staffRole : tab;

  const switchTab = (t: Tab) => {
    demoAuto.current = false;
    setTab(t);
    setError(null);
    setCode("");
    setMode("signup");
    staffInfo.current = null;
    setStep(t === "staff" ? "staffCreds" : "details");
  };

  const submitDetails = () => {
    const ageN = Number(age);
    if (firstName.trim().length < 2) return setError("Enter your name.");
    if (!age || !Number.isFinite(ageN) || ageN < 1 || ageN > 120) return setError("Enter a valid age.");
    if (tab === "doctor" && ageN < 22) return setError("Doctors must be at least 22.");
    if (!sex) return setError("Select your sex.");
    setError(null);
    setStep("method");
  };

  const requestCode = async () => {
    const c = contact.trim();
    if (method === "email" && !isEmail(c)) return setError("Enter a valid email address.");
    if (method === "phone" && phoneDigits(c).length < 10) return setError("Enter a 10-digit mobile number.");
    setError(null);
    setBusy(true);
    try {
      // Saved so an emailed sign-in link (instead of a code) can finish sign-up on return.
      window.localStorage.setItem(PENDING_KEY, JSON.stringify({ tab, mode, staffRole, staff: staffInfo.current, firstName, surname, age, sex, method, contact: c }));
    } catch {
      /* ignore */
    }
    const res = await sendCode(method, c, { first_name: firstName.trim(), surname: surname.trim(), age, sex, role });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not send the code.");
    setCodeIsDemo(res.demo);
    setCode("");
    setResendIn(30);
    setStep("code");
  };

  const finishSession = (s: Session) => {
    writeSession(s);
    rememberAccount(s);
    void saveProfileRow(s);
    router.replace(HOME_OF[s.role]);
  };

  const baseSession = (r: Role, userId: string): Session => ({
    role: r,
    userId,
    firstName: firstName.trim(),
    surname: surname.trim(),
    age: age.trim(),
    sex,
    method,
    contact: contact.trim(),
    verifiedBy: verified.current?.real ? "real" : "demo",
    signedInAt: new Date().toISOString(),
  });

  const checkCode = async () => {
    const digits = code.replace(/\D/g, "").length;
    if (digits < 6 || digits > 8) return setError("Enter the code from the email or SMS.");
    setError(null);
    setBusy(true);
    const res = await verifyCode(method, contact, code);
    setBusy(false);
    if (!res.ok || !res.userId) return setError(res.error ?? "That code is not right.");
    afterVerified(res.userId, res.meta);
  };

  /** Runs after a code (or an emailed sign-in link) proves the person owns the email/phone. */
  const afterVerified = (userId: string, meta?: Record<string, unknown>) => {
    const res = { userId };
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    verified.current = { userId: res.userId, real: method === "email" };

    if (tab === "staff" && staffInfo.current) {
      return finishSession({
        role: staffRole,
        userId: res.userId,
        firstName: staffInfo.current.firstName,
        surname: staffInfo.current.surname,
        age: "",
        sex: "",
        method,
        contact: contact.trim(),
        verifiedBy: method === "email" ? "real" : "demo",
        staffId: staffInfo.current.staffId,
        signedInAt: new Date().toISOString(),
      });
    }

    if (mode === "login") {
      const saved = recallAccount(role, contact.trim());
      const fn = String(saved?.firstName ?? meta?.first_name ?? "");
      if (!fn) {
        setMode("signup");
        setStep("details");
        setError("We couldn't find your details. Fill them in once and you're done.");
        return;
      }
      setFirstName(fn);
      setSurname(String(saved?.surname ?? meta?.surname ?? ""));
      setAge(String(saved?.age ?? meta?.age ?? ""));
      setSex((saved?.sex ?? meta?.sex ?? "") as Sex | "");
      if (role === "doctor" && !saved?.doctorAppId) {
        setStep("professional");
        return;
      }
      return finishSession({
        role,
        userId: res.userId,
        firstName: fn,
        surname: String(saved?.surname ?? meta?.surname ?? ""),
        age: String(saved?.age ?? meta?.age ?? ""),
        sex: (saved?.sex ?? meta?.sex ?? "") as Sex | "",
        method,
        contact: contact.trim(),
        verifiedBy: method === "email" ? "real" : "demo",
        doctorAppId: saved?.doctorAppId,
        doctorStatus: saved?.doctorStatus,
        signedInAt: new Date().toISOString(),
      });
    }

    if (tab === "doctor") return setStep("professional");
    finishSession(baseSession("patient", res.userId));
  };

  const runAiCheck = async () => {
    if (qualification.trim().length < 2) return setError("Enter your qualification, for example MBBS, MD.");
    if (specialty.trim().length < 2) return setError("Enter your specialty.");
    if (regNo.trim().length < 4) return setError("Enter your medical registration number.");
    if (!experience || Number(experience) > 60) return setError("Enter your years of experience.");
    if (!file) return setError("Upload your degree or registration certificate.");
    if (file.size > 4 * 1024 * 1024) return setError("The file is larger than 4 MB. Upload a smaller scan.");
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("fullName", fullName({ firstName, surname }));
    fd.append("registrationNo", regNo.trim());
    fd.append("council", council);
    fd.append("qualification", qualification.trim());
    try {
      const res = await fetch("/api/verify-doctor-doc", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Check failed");
      setReview(json as DocReview);
    } catch (e) {
      setReview({
        verdict: "NEEDS_ATTENTION",
        document_type: "Not analysed",
        extracted: { name: "", registration_number: "", council_or_university: "", issue_date: "", expiry_date: "" },
        issues: [`AI check could not run (${e instanceof Error ? e.message : "network"}). Support will review the file by hand.`],
        summary: "",
        source: "offline",
      });
    }
    setBusy(false);
    setStep("review");
  };

  const doctorFirst = () => (firstName.trim().toLowerCase().startsWith("dr") ? firstName.trim() : `Dr. ${firstName.trim()}`);

  const submitApplication = async () => {
    if (!verified.current) return;
    setBusy(true);
    const id = `APP-${Date.now().toString().slice(-6)}`;
    const record = {
      id,
      user_id: verified.current.userId,
      full_name: fullName({ firstName: doctorFirst(), surname }),
      email: method === "email" ? contact.trim() : "",
      phone: method === "phone" ? contact.trim() : "",
      age: Number(age),
      sex,
      nmc_registration_id: regNo.trim(),
      state_medical_council: council,
      degree: qualification.trim(),
      specialty: specialty.trim(),
      experience_years: Number(experience),
      hospital_affiliation: hospital.trim() || "Not provided",
      notes: extraNote.trim(),
      documents: file ? [file.name] : [],
      ai_review: review,
      submitted_at: new Date().toISOString(),
      verification_status: "PENDING",
    };
    try {
      const prev = JSON.parse(window.localStorage.getItem(APPS_KEY) || "[]");
      window.localStorage.setItem(APPS_KEY, JSON.stringify([record, ...(Array.isArray(prev) ? prev : [])].slice(0, 30)));
    } catch {
      /* ignore */
    }
    try {
      await supabase.from("doctor_applications").insert([record]);
    } catch {
      /* local copy is enough for the demo */
    }
    const s: Session = { ...baseSession("doctor", verified.current.userId), firstName: doctorFirst(), doctorAppId: id, doctorStatus: "PENDING" };
    writeSession(s);
    rememberAccount(s);
    void saveProfileRow(s);
    setBusy(false);
    setAppId(id);
    setStep("pending");
  };

  const signInWithGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      window.localStorage.setItem(PENDING_KEY, JSON.stringify({ tab, mode, staffRole, staff: staffInfo.current, firstName, surname, age, sex, method: "email", contact: "" }));
    } catch {
      /* ignore */
    }
    const r = await startGoogle();
    // On success the browser leaves for Google; we only get here on an error.
    setBusy(false);
    if (r.error) setError(r.error);
  };

  /** Fills every field of the current step with demo data. */
  const fillStep = (st: Step) => {
    if (st === "staffCreds") {
      setStaffId(staffRole === "admin" ? "admin01" : "support01");
      setStaffPass(staffRole === "admin" ? "CuraAdmin@2026" : "CuraSupport@2026");
    } else if (st === "details") {
      if (tab === "doctor") {
        // Same doctor the patient app lists as d1, so names match on both sides.
        setFirstName("Dr. Sunita");
        setSurname("Sharma");
        setAge("41");
        setSex("Female");
      } else {
        setFirstName("Aarohi");
        setSurname("Deshmukh");
        setAge("24");
        setSex("Female");
      }
    } else if (st === "method") {
      setMethod("phone");
      setContact(tab === "doctor" ? "+91 95217 81502" : tab === "staff" ? (staffRole === "admin" ? "+91 93540 82092" : "+91 97736 33163") : "+91 88009 48077");
    } else if (st === "code") {
      setCode(DEMO_PHONE_OTP);
    } else if (st === "professional") {
      setQualification("MBBS, MD (General Medicine), DM (Cardiology)");
      setSpecialty("Cardiology & General Medicine");
      setRegNo("DL-2018-09412");
      setCouncil("Delhi Medical Council");
      setExperience("14");
      setHospital("Apollo Indraprastha, New Delhi");
      void fetch("/demo/demo-doctor-certificate.pdf")
        .then((r) => r.blob())
        .then((b) => setFile(new File([b], "demo-doctor-certificate.pdf", { type: "application/pdf" })))
        .catch(() => undefined);
    }
  };

  /** One click turns on demo mode: every later step is filled as it opens, but the person still presses each button. */
  const demoAuto = useRef(false);
  useEffect(() => {
    if (!demoAuto.current) return;
    if (step === "code" && !codeIsDemo) return; // real email code: the person types it
    fillStep(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, codeIsDemo]);

  const fillDemo = () => {
    setError(null);
    demoAuto.current = true;
    fillStep(step);
  };
  const canFillDemo = step === "details" || step === "staffCreds" || step === "method" || step === "professional" || (step === "code" && codeIsDemo);

  const useDemoDoctor = () => {
    writeSession({ ...DEMO_DOCTOR, signedInAt: new Date().toISOString() });
    router.replace("/doctor");
  };

  const staffContinue = async () => {
    if (!staffId.trim() || !staffPass) return setError("Enter your staff ID and password.");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/staff-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: staffId, password: staffPass, role: staffRole }) });
      const json = await res.json();
      setBusy(false);
      if (!res.ok || !json.ok) return setError(json.error || "Staff ID or password is wrong.");
      staffInfo.current = { firstName: json.firstName, surname: json.surname, staffId: json.staffId };
      setMethod("email");
      setContact("");
      setStep("method");
    } catch {
      setBusy(false);
      setError("Can't reach the server. Check your connection.");
    }
  };

  const back = () => {
    setError(null);
    if (step === "method") {
      if (tab === "staff") return setStep("staffCreds");
      setMode("signup");
      return setStep("details");
    }
    if (step === "code") return setStep("method");
    if (step === "review") return setStep("professional");
    if (step === "professional") return setStep("method");
    setStep("details");
  };

  const steps: Step[] = tab === "doctor" ? ["details", "method", "code", "professional", "review"] : tab === "patient" ? ["details", "method", "code"] : ["staffCreds", "method", "code"];
  const stepIdx = Math.max(0, steps.indexOf(step));
  const showBack = step !== "details" && step !== "staffCreds" && step !== "pending";

  const title =
    step === "details"
      ? tab === "doctor"
        ? "Join as a doctor"
        : "Create your account"
      : step === "method"
        ? tab === "staff"
          ? "Confirm it's you"
          : mode === "login"
            ? "Log in"
            : "How should we reach you?"
        : step === "code"
          ? "Enter the code"
          : step === "professional"
            ? "Your medical credentials"
            : step === "review"
              ? "AI document check"
              : step === "pending"
                ? "Application sent"
                : staffRole === "admin"
                  ? "Admin sign-in"
                  : "Support Desk sign-in";

  if (!mounted) return <div className="min-h-screen bg-canvas" />;

  return (
    <div className="min-h-screen bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12h4l2-5 4 10 2-5h6" />
            </svg>
          </span>
          <span className="font-brand text-[26px] font-semibold text-ink">CuraPulse</span>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl border border-line bg-white p-1" role="tablist" aria-label="Sign in as">
          {(
            [
              ["patient", "Patient", <User key="p" className="h-4 w-4" />],
              ["doctor", "Doctor", <Stethoscope key="d" className="h-4 w-4" />],
              ["staff", "Staff", <UserCog key="s" className="h-4 w-4" />],
            ] as [Tab, string, React.ReactNode][]
          ).map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => switchTab(k)}
              className={cx("flex h-10 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition", tab === k ? "bg-brand text-white" : "text-ink-muted hover:bg-canvas")}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-3xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            {showBack && (
              <button type="button" onClick={back} className="mb-3 flex items-center gap-1 text-[14px] font-semibold text-brand">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <h1 className="text-[24px] font-bold leading-tight text-ink">{title}</h1>
            {step !== "pending" && mode === "signup" && (
              <div className="mt-3 flex gap-1.5" aria-hidden>
                {steps.map((s, i) => (
                  <span key={s} className={cx("h-1.5 flex-1 rounded-full", i <= stepIdx ? "bg-brand" : "bg-line")} />
                ))}
              </div>
            )}
          </div>

          {canFillDemo && (
            <button type="button" onClick={fillDemo} className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-lav/60 px-3 py-1 text-[12.5px] font-semibold text-lav-ink hover:bg-lav">
              <Sparkles className="h-3.5 w-3.5" /> Fill demo details
            </button>
          )}
          {error && (
            <Alert tone="crit" className="mb-4">
              {error}
            </Alert>
          )}

          {step === "details" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" htmlFor="fn">
                  <input id="fn" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder={tab === "doctor" ? "Meera" : "Aisha"} />
                </Field>
                <Field label={<span>Surname <span className="font-normal text-ink-soft">(optional)</span></span>} htmlFor="sn">
                  <input id="sn" autoComplete="family-name" value={surname} onChange={(e) => setSurname(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Age" htmlFor="age">
                <input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} className={cx(inputCls, "max-w-[120px]")} />
              </Field>
              <div>
                <p className="mb-1.5 text-[14px] font-semibold text-ink">Sex</p>
                <div className="flex flex-wrap gap-2">
                  {(["Female", "Male", "Other"] as Sex[]).map((s) => (
                    <ChoiceChip key={s} on={sex === s} onClick={() => setSex(s)}>
                      {s}
                    </ChoiceChip>
                  ))}
                </div>
                {tab === "patient" && sex === "Female" && <p className="mt-2 text-[13px] text-ink-muted">You'll also get women-rated doctors and a female-doctors-only search.</p>}
              </div>
              <Button full onClick={submitDetails}>
                Continue
              </Button>
              <p className="text-center text-[14px] text-ink-muted">
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-semibold text-brand"
                  onClick={() => {
                    setError(null);
                    setMode("login");
                    setStep("method");
                  }}
                >
                  Log in
                </button>
              </p>
              {tab === "doctor" && (
                <div className="border-t border-line pt-4">
                  <Button full variant="tertiary" icon={<Sparkles className="h-4 w-4" />} onClick={useDemoDoctor}>
                    Use demo doctor account (already verified)
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === "staffCreds" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <ChoiceChip on={staffRole === "support"} onClick={() => setStaffRole("support")}>
                  Support Desk
                </ChoiceChip>
                <ChoiceChip on={staffRole === "admin"} onClick={() => setStaffRole("admin")}>
                  Admin
                </ChoiceChip>
              </div>
              <Field label="Staff ID" htmlFor="sid">
                <input id="sid" autoComplete="username" value={staffId} onChange={(e) => setStaffId(e.target.value)} className={inputCls} placeholder={staffRole === "admin" ? "admin01" : "support01"} />
              </Field>
              <Field label="Password" htmlFor="spw">
                <input id="spw" type="password" autoComplete="current-password" value={staffPass} onChange={(e) => setStaffPass(e.target.value)} className={inputCls} onKeyDown={(e) => e.key === "Enter" && staffContinue()} />
              </Field>
              <Button full icon={<KeyRound className="h-4 w-4" />} loading={busy} onClick={staffContinue}>
                Continue
              </Button>
              <p className="text-[13px] text-ink-muted">Staff accounts are created by CuraPulse in advance. After the password you confirm with a one-time code.</p>
            </div>
          )}

          {step === "method" && (
            <div className="space-y-4">
              {tab === "staff" && staffInfo.current && <Badge tone="ok">Password correct · {staffInfo.current.firstName}</Badge>}
              <div className="grid grid-cols-2 gap-2">
                {(["email", "phone"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    onClick={() => {
                      setMethod(m);
                      setContact("");
                      setError(null);
                    }}
                    className={cx("flex flex-col items-center gap-1 rounded-2xl border p-3 text-[14px] font-semibold", method === m ? "border-brand bg-sage/50 text-brand" : "border-line text-ink-muted")}
                  >
                    {m === "email" ? <Mail className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
                    {m === "email" ? "Email" : "Phone"}
                  </button>
                ))}
              </div>
              <Field
                label={method === "email" ? "Email address" : "Mobile number"}
                htmlFor="contact"
                help={method === "phone" ? `Demo mode: SMS isn't connected yet, so the code is ${DEMO_PHONE_OTP}.` : "We'll email you a one-time code."}
              >
                <input
                  id="contact"
                  type={method === "email" ? "email" : "tel"}
                  inputMode={method === "email" ? "email" : "tel"}
                  autoComplete={method === "email" ? "email" : "tel"}
                  placeholder={method === "email" ? "you@example.com" : "+91 98xxx xxxxx"}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && requestCode()}
                  className={cx(inputCls, error && inputErrCls)}
                />
              </Field>
              <Button full loading={busy} onClick={requestCode}>
                Send code
              </Button>
              {tab !== "staff" && (
                <>
                  <div className="flex items-center gap-3 text-[12.5px] text-ink-soft">
                    <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                  </div>
                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={busy}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-line-strong bg-white text-[15px] font-semibold text-ink hover:bg-canvas disabled:opacity-60"
                  >
                    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                    </svg>
                    Continue with Google
                  </button>
                </>
              )}
            </div>
          )}

          {step === "code" && (
            <div className="space-y-4">
              <p className="text-[14.5px] text-ink-muted">
                {codeIsDemo ? (
                  <>
                    Demo code for <b className="text-ink">{contact}</b>: enter <b className="text-ink">{DEMO_PHONE_OTP}</b>.
                  </>
                ) : (
                  <>
                    We emailed a code to <b className="text-ink">{contact}</b>. Check spam if you don't see it. If the email has a sign-in link instead, open it on this device.
                  </>
                )}
              </p>
              <input
                aria-label="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => e.key === "Enter" && checkCode()}
                className={cx(inputCls, "tabular text-center text-[24px] tracking-[0.5em]", error && inputErrCls)}
              />
              <Button full loading={busy} onClick={checkCode} icon={<ShieldCheck className="h-4 w-4" />}>
                Verify
              </Button>
              <div className="flex items-center justify-between text-[14px]">
                <button type="button" className="font-semibold text-brand disabled:text-ink-soft" disabled={resendIn > 0 || busy} onClick={requestCode}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
                <button type="button" className="font-semibold text-ink-muted" onClick={() => setStep("method")}>
                  Change {method === "email" ? "email" : "number"}
                </button>
              </div>
            </div>
          )}

          {step === "professional" && (
            <div className="space-y-4">
              <Badge tone="ok">{method === "email" ? "Email" : "Phone"} verified</Badge>
              <Field label="Qualification" htmlFor="q">
                <input id="q" value={qualification} onChange={(e) => setQualification(e.target.value)} className={inputCls} placeholder="MBBS, MD (General Medicine)" />
              </Field>
              <Field label="Specialty" htmlFor="sp">
                <input id="sp" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputCls} placeholder="General Medicine" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Registration no." htmlFor="rn">
                  <input id="rn" value={regNo} onChange={(e) => setRegNo(e.target.value)} className={inputCls} placeholder="DMC/R/2019/11873" />
                </Field>
                <Field label="Experience (years)" htmlFor="ex">
                  <input id="ex" inputMode="numeric" value={experience} onChange={(e) => setExperience(e.target.value.replace(/\D/g, "").slice(0, 2))} className={inputCls} />
                </Field>
              </div>
              <Field label="Medical council" htmlFor="mc">
                <select id="mc" value={council} onChange={(e) => setCouncil(e.target.value)} className={inputCls}>
                  {COUNCILS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label={<span>Hospital or clinic <span className="font-normal text-ink-soft">(optional)</span></span>} htmlFor="hp">
                <input id="hp" value={hospital} onChange={(e) => setHospital(e.target.value)} className={inputCls} />
              </Field>
              <div>
                <p className="mb-1.5 text-[14px] font-semibold text-ink">Degree or registration certificate</p>
                <label className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed p-4", file ? "border-brand bg-sage/40" : "border-line hover:bg-canvas")}>
                  <FileUp className="h-6 w-6 shrink-0 text-brand" />
                  <span className="min-w-0 text-[14px]">
                    <span className="block truncate font-semibold text-ink">{file ? file.name : "Upload PDF or photo"}</span>
                    <span className="text-ink-muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : "PDF, JPG or PNG, up to 4 MB"}</span>
                  </span>
                  <input aria-label="Certificate file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <Field label={<span>Anything else for the reviewers <span className="font-normal text-ink-soft">(optional)</span></span>} htmlFor="nt">
                <textarea id="nt" rows={3} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} className={cx(inputCls, "h-auto py-2")} placeholder="Prior experience, fellowships, other certificates" />
              </Field>
              <Button full loading={busy} onClick={runAiCheck}>
                {busy ? "AI is reading your document…" : "Check document"}
              </Button>
            </div>
          )}

          {step === "review" && review && (
            <div className="space-y-4">
              <Alert
                tone={review.verdict === "LOOKS_VALID" ? "ok" : "warn"}
                title={review.verdict === "LOOKS_VALID" ? "No visible problems found" : review.verdict === "UNREADABLE" ? "Document is hard to read" : "Some things need a look"}
              >
                The AI only flags visible problems. A person on the Support team makes the final decision.
              </Alert>
              {review.source === "gemini" && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-2xl bg-canvas p-3.5 text-[13.5px]">
                  <dt className="text-ink-muted">Document</dt>
                  <dd className="font-semibold text-ink">{review.document_type || "—"}</dd>
                  <dt className="text-ink-muted">Name on it</dt>
                  <dd className="font-semibold text-ink">{review.extracted.name || "—"}</dd>
                  <dt className="text-ink-muted">Reg. no.</dt>
                  <dd className="font-semibold text-ink">{review.extracted.registration_number || "—"}</dd>
                  <dt className="text-ink-muted">Issued by</dt>
                  <dd className="font-semibold text-ink">{review.extracted.council_or_university || "—"}</dd>
                </dl>
              )}
              {review.issues.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[14px] font-semibold text-ink">Flagged</p>
                  <ul className="space-y-1.5">
                    {review.issues.map((i) => (
                      <li key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13.5px] text-amber-900">
                        {i}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button full loading={busy} onClick={submitApplication}>
                Send to Support for verification
              </Button>
              <Button full variant="secondary" onClick={() => setStep("professional")}>
                Upload a different file
              </Button>
            </div>
          )}

          {step === "pending" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl bg-sage/50 p-4">
                <BadgeCheck className="h-8 w-8 shrink-0 text-brand" />
                <div>
                  <p className="font-semibold text-ink">Application {appId} is with the Support team</p>
                  <p className="text-[13.5px] text-ink-muted">Verification usually takes 1–3 working days. You can see patients once approved.</p>
                </div>
              </div>
              <Button full onClick={() => router.replace("/doctor")}>
                Open doctor console
              </Button>
              <Button full variant="tertiary" icon={<Sparkles className="h-4 w-4" />} onClick={useDemoDoctor}>
                Use demo doctor account for now
              </Button>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[12.5px] text-ink-soft">For emergencies call 108.</p>
      </div>
    </div>
  );
}
