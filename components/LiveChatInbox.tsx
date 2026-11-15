"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Alert, Avatar, Badge, PageTitle, cx } from "@/components/ui";

/** One row of public.chat_messages (see setup/chat_messages.sql). */
interface Row {
  id: string;
  thread_id: string;
  patient_id: string;
  patient_name: string | null;
  doctor_id: string;
  doctor_name: string | null;
  sender: "patient" | "doctor" | "system";
  body: string;
  card: string | null;
  created_at: string;
}

export interface InboxIdentity {
  id: string;
  name: string;
}

const CARD_LABEL: Record<string, string> = {
  appointment: "Booking card",
  arrival: "Arrival slip",
  prescription: "E-prescription",
  chaperone: "Chaperone request",
  vitals: "Vitals card",
  records: "Records access request",
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const initialsOf = (n: string) =>
  n
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "P";

/**
 * Live chat inbox for the doctor console and support desk.
 * Patients write from the patient app; replies here land on the patient's phone in real time.
 */
export function LiveChatInbox({
  identities,
  storageKey,
  phone,
  title = "Chats",
  replyAs = "doctor",
}: {
  identities: InboxIdentity[];
  storageKey: string;
  phone: boolean;
  title?: string;
  replyAs?: "doctor";
}) {
  const [meId, setMeId] = useState(identities[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"connecting" | "live" | "offline">("connecting");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const me = identities.find((i) => i.id === meId) ?? identities[0];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && identities.some((i) => i.id === saved)) setMeId(saved);
    } catch {
      /* storage blocked: keep default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!meId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    setRows([]);
    setOpenThread(null);
    setState("connecting");
    const add = (r: Row) => setRows((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
    const guard = setTimeout(() => !cancelled && setState((s) => (s === "connecting" ? "offline" : s)), 6000);
    (async () => {
      try {
        const { data, error } = await supabase.from("chat_messages").select("*").eq("doctor_id", meId).order("created_at", { ascending: true }).limit(1000);
        if (cancelled) return;
        if (error) throw error;
        setRows((data ?? []) as Row[]);
        setState("live");
        channel = supabase
          .channel(`curapulse-inbox-${meId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `doctor_id=eq.${meId}` }, (payload: { new: Row }) => add(payload.new))
          .subscribe();
      } catch {
        if (!cancelled) setState("offline");
      } finally {
        clearTimeout(guard);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(guard);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [meId]);

  const threads = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      const list = map.get(r.thread_id) ?? [];
      list.push(r);
      map.set(r.thread_id, list);
    });
    return Array.from(map.entries())
      .map(([id, list]) => {
        const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const last = sorted[sorted.length - 1];
        const name = sorted.find((r) => r.patient_name)?.patient_name || "Patient";
        const lastMine = sorted.map((r) => r.sender).lastIndexOf(replyAs);
        const from = Math.max(seen[id] ?? 0, lastMine + 1);
        const unread = sorted.slice(from).filter((r) => r.sender === "patient").length;
        return { id, name, rows: sorted, last, unread, patientId: last.patient_id };
      })
      .filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()) || t.rows.some((r) => r.body.toLowerCase().includes(q.trim().toLowerCase())))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [rows, seen, q, replyAs]);

  const active = threads.find((t) => t.id === openThread) ?? null;

  useEffect(() => {
    if (active) {
      setSeen((s) => (s[active.id] === active.rows.length ? s : { ...s, [active.id]: active.rows.length }));
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [active]);

  const switchMe = (id: string) => {
    setMeId(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* ignore */
    }
  };

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !active || !me || sending) return;
    setSending(true);
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const row: Row = {
      id,
      thread_id: active.id,
      patient_id: active.patientId,
      patient_name: active.name,
      doctor_id: me.id,
      doctor_name: me.name,
      sender: replyAs,
      body: text,
      card: null,
      created_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from("chat_messages").insert({ ...row, created_at: undefined });
      if (error) throw error;
      setRows((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, row]));
      setDraft("");
    } catch {
      setState("offline");
    } finally {
      setSending(false);
    }
  };

  const totalUnread = threads.reduce((n, t) => n + t.unread, 0);

  const statusBadge =
    state === "live" ? (
      <Badge tone="ok">Live</Badge>
    ) : state === "connecting" ? (
      <Badge tone="neutral">Connecting…</Badge>
    ) : (
      <Badge tone="warn">Offline</Badge>
    );

  const list = (
    <div className="flex min-h-0 flex-col">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          aria-label="Search patients or messages"
          placeholder="Search patients or messages"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-[14.5px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
        />
      </div>
      {threads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-ink-soft" />
          <p className="mt-2 text-[14.5px] font-semibold text-ink">{state === "live" ? "No patient messages yet" : state === "connecting" ? "Loading chats…" : "Chats are offline"}</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            {state === "live" ? `When a patient messages ${me?.name ?? "you"} from the CuraPulse app, it appears here instantly.` : state === "offline" ? "Can't reach CuraPulse Cloud right now." : ""}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenThread(t.id)}
                aria-label={`Open chat with ${t.name}`}
                className={cx("flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-canvas", openThread === t.id && !phone && "bg-sage/40")}
              >
                <Avatar initials={initialsOf(t.name)} size={44} tone="lav" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold text-ink">{t.name}</p>
                    <span className={cx("shrink-0 text-[11.5px]", t.unread ? "font-semibold text-brand" : "text-ink-soft")}>{timeOf(t.last.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] text-ink-muted">
                      {t.last.sender === replyAs ? "You: " : ""}
                      {t.last.body || (t.last.card ? CARD_LABEL[t.last.card] ?? "Card" : "")}
                    </p>
                    {t.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{t.unread}</span>}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const thread = active ? (
    <div className={cx("flex flex-col overflow-hidden border border-line bg-white", phone ? "-mx-4 -my-4 min-h-[calc(100dvh-200px)] rounded-none border-x-0" : "h-[calc(100vh-190px)] min-h-[480px] rounded-2xl")}>
      <div className="flex items-center gap-2 border-b border-line bg-white px-2 py-2">
        {phone && (
          <button type="button" onClick={() => setOpenThread(null)} aria-label="Back to chats" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-canvas">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar initials={initialsOf(active.name)} size={40} tone="lav" />
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-[15.5px] font-bold text-ink">{active.name}</p>
          <p className="truncate text-[12.5px] text-ink-muted">Patient · replying as {me?.name}</p>
        </div>
        {statusBadge}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-[#E8F0EC] bg-[radial-gradient(#d5e3dc_1px,transparent_1px)] px-3 py-3 [background-size:16px_16px]" aria-live="polite">
        {active.rows.map((r) => {
          const mine = r.sender === replyAs;
          if (r.sender === "system")
            return (
              <p key={r.id} className="mx-auto w-fit max-w-[85%] rounded-lg bg-white/80 px-3 py-1.5 text-center text-[12.5px] text-ink-muted">
                {r.body}
              </p>
            );
          return (
            <div key={r.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[80%] rounded-2xl px-3.5 py-2 text-[14.5px] shadow-sm", mine ? "rounded-tr-md bg-[#CDEBE1] text-ink" : "rounded-tl-md bg-white text-ink")}>
                {r.body && <p className="whitespace-pre-wrap break-words">{r.body}</p>}
                {r.card && <p className="mt-1 text-[12.5px] font-semibold text-brand">{CARD_LABEL[r.card] ?? "Card"}</p>}
                <p className="mt-0.5 text-right text-[11px] text-ink-soft">{timeOf(r.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex items-center gap-2 border-t border-line bg-canvas px-2.5 py-2.5">
        <input
          aria-label="Reply"
          placeholder={state === "offline" ? "Offline: replies can't be sent" : "Reply to patient"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={state === "offline"}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[15px] text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send reply"
          disabled={!draft.trim() || sending || state === "offline"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:bg-ink-soft/40"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </form>
    </div>
  ) : null;

  if (phone && active) return thread;

  return (
    <div>
      <PageTitle
        title={
          <span className="flex items-center gap-2">
            {title}
            {totalUnread > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-[13px] font-bold text-white">{totalUnread}</span>}
          </span>
        }
        sub="Messages from patients in the CuraPulse app arrive here live."
        right={statusBadge}
      />
      {identities.length > 1 && (
        <label className="mb-3 flex items-center gap-2 text-[13.5px] text-ink-muted">
          Inbox for
          <select
            aria-label="Inbox for"
            value={me?.id}
            onChange={(e) => switchMe(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2 text-[14px] font-semibold text-ink focus:border-brand focus:outline-none"
          >
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {state === "offline" && (
        <Alert tone="warn" title="Live chat isn't connected" className="mb-3">
          CuraPulse Cloud didn't answer. Check the internet connection, and that the chat table has been set up in Supabase.
        </Alert>
      )}
      {phone ? (
        list
      ) : (
        <div className="grid grid-cols-[340px_1fr] gap-4">
          {list}
          {thread ?? (
            <div className="flex h-[calc(100vh-190px)] min-h-[480px] items-center justify-center rounded-2xl border border-dashed border-line bg-white text-[14px] text-ink-muted">
              Select a chat to read and reply
            </div>
          )}
        </div>
      )}
    </div>
  );
}
