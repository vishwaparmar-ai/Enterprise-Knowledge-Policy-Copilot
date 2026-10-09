"use client";
import { FormEvent, KeyboardEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/ui";
import { AppIcon } from "./Icons";
import Markdown from "./Markdown";

type Source = { document: string; page: number | null; snippet: string };
type Rating = "up" | "down" | null;
type Msg = { id: number; role: "user" | "assistant"; text: string; sources?: Source[]; retry?: string; messageId?: string; feedback?: Rating;
  streaming?: boolean; stage?: "searching" | "generating"; stopped?: boolean };
type Conv = { id: string; title: string; updatedAt: string };

const SUGGESTIONS = [
  "What is our remote work policy?",
  "How many days of annual leave do I get?",
  "Summarise the information security guidelines",
];

/* ---------------- small icons ---------------- */
const Glyph = ({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);
const PlusIcon = () => <Glyph><path d="M12 5v14M5 12h14" /></Glyph>;
const EditIcon = () => <Glyph className="h-3.5 w-3.5"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" /></Glyph>;
const TrashIcon = () => <Glyph className="h-3.5 w-3.5"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4.5A.5.5 0 0 1 9.5 4h5a.5.5 0 0 1 .5.5V7" /></Glyph>;
const ThumbUpIcon = () => <Glyph className="h-4 w-4"><path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></Glyph>;
const ThumbDownIcon = () => <Glyph className="h-4 w-4"><path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></Glyph>;
const ClockIcon = () => <Glyph><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Glyph>;

/* ---------------- helpers ---------------- */
function groupByDate(convs: Conv[]): [string, Conv[]][] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(new Date());
  const buckets: [string, Conv[]][] = [["Today", []], ["Yesterday", []], ["Previous 7 days", []], ["Older", []]];
  for (const c of convs) {
    const diff = Math.floor((today - startOfDay(new Date(c.updatedAt))) / 86400000);
    buckets[diff <= 0 ? 0 : diff === 1 ? 1 : diff <= 7 ? 2 : 3][1].push(c);
  }
  return buckets.filter(([, items]) => items.length);
}

/* ---------------- source chips ---------------- */
function SourceChips({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!sources.length) return null;
  const chip = "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium";
  return (
    <div className="mt-3">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">Sources</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => {
          const label = `${s.document}${s.page != null ? ` · p.${s.page}` : ""}`;
          const inner = (<><AppIcon name="doc" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span></>);
          // Chips expand only when the backend sends an excerpt; otherwise they are plain labels.
          return s.snippet ? (
            <button
              key={i}
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className={`${chip} transition-colors ${open === i ? "border-brand bg-blue-50 text-brand" : "border-line bg-canvas text-slate-700 hover:border-slate-300"}`}
            >
              {inner}
            </button>
          ) : (
            <span key={i} className={`${chip} border-line bg-canvas text-slate-700`}>{inner}</span>
          );
        })}
      </div>
      {open !== null && sources[open]?.snippet && (
        <div className="mt-2 rounded-lg border border-line bg-canvas p-3 text-[13px] leading-relaxed text-slate-600">
          <p className="font-medium text-ink">{sources[open].document}{sources[open].page != null ? `, page ${sources[open].page}` : ""}</p>
          <p className="mt-1">{sources[open].snippet}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- feedback ---------------- */
const REASONS = [
  { id: "inaccurate", label: "Inaccurate" },
  { id: "not_relevant", label: "Not relevant" },
  { id: "incomplete", label: "Incomplete" },
  { id: "other", label: "Other" },
] as const;

function FeedbackBar({ messageId, initial }: { messageId: string; initial: Rating }) {
  const [rating, setRating] = useState<Rating>(initial);
  const [panel, setPanel] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function call(method: "PUT" | "DELETE", body?: object) {
    const res = await fetch(`/api/feedback/${messageId}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { window.location.assign("/login"); throw new Error("auth"); }
    if (!res.ok) throw new Error("failed");
  }

  async function choose(next: "up" | "down") {
    if (busy) return;
    const prev = rating;
    setNote(null);
    setBusy(true);
    try {
      if (rating === next) {
        // Clicking the same thumb again removes the rating.
        setRating(null);
        setPanel(false);
        await call("DELETE");
      } else {
        setRating(next);
        setPanel(next === "down");
        await call("PUT", { rating: next });
        if (next === "up") setNote({ text: "Thanks for your feedback." });
      }
    } catch {
      setRating(prev);
      setPanel(false);
      setNote({ text: "Couldn't save your feedback. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function sendDetails() {
    if (busy) return;
    setBusy(true);
    try {
      await call("PUT", { rating: "down", reason: reason ?? undefined, comment: comment.trim() || undefined });
      setPanel(false);
      setNote({ text: "Thanks. Your feedback helps us improve the answers." });
    } catch {
      setNote({ text: "Couldn't save your feedback. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const btn = "grid h-8 w-8 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div>
      <div className="flex items-center gap-1">
        <button onClick={() => choose("up")} disabled={busy} aria-pressed={rating === "up"} aria-label="This answer was helpful" title="Helpful"
          className={`${btn} ${rating === "up" ? "bg-green-50 text-success" : "text-muted hover:bg-slate-100 hover:text-ink"}`}>
          <ThumbUpIcon />
        </button>
        <button onClick={() => choose("down")} disabled={busy} aria-pressed={rating === "down"} aria-label="This answer was not helpful" title="Not helpful"
          className={`${btn} ${rating === "down" ? "bg-red-50 text-danger" : "text-muted hover:bg-slate-100 hover:text-ink"}`}>
          <ThumbDownIcon />
        </button>
        {note && <span role="status" className={`ml-2 text-[12.5px] ${note.error ? "text-danger" : "text-muted"}`}>{note.text}</span>}
      </div>

      {panel && (
        <div role="group" aria-label="Tell us what went wrong" className="mt-2 rounded-lg border border-line bg-canvas p-3">
          <p className="text-[13px] font-medium">What went wrong? <span className="font-normal text-muted">(optional)</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r.id} onClick={() => setReason(reason === r.id ? null : r.id)} aria-pressed={reason === r.id}
                className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${reason === r.id ? "border-brand bg-blue-50 text-brand" : "border-line bg-white text-slate-700 hover:border-slate-300"}`}>
                {r.label}
              </button>
            ))}
          </div>
          <label htmlFor={`fb-${messageId}`} className="sr-only">Additional comments</label>
          <textarea id={`fb-${messageId}`} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2}
            placeholder="Anything else we should know?"
            className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setPanel(false)} className="h-8 rounded-lg px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-100">Skip</button>
            <button onClick={sendDetails} disabled={busy || (!reason && !comment.trim())} className="h-8 rounded-lg bg-brand px-3 text-[13px] font-medium text-white hover:bg-[#1d4fd8] disabled:cursor-not-allowed disabled:bg-brand/40">Send feedback</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- conversation list ---------------- */
function ConversationList(props: {
  convs: Conv[] | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  const { convs, activeId, onOpen, onNew, onRename, onDelete } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const groups = useMemo(() => groupByDate(convs ?? []), [convs]);

  return (
    <aside className={`flex-col border-line bg-white ${props.className ?? ""}`} aria-label="Chat history">
      <div className="p-3">
        <button onClick={onNew} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-[14px] font-medium shadow-btn hover:bg-slate-50">
          <PlusIcon /> New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {convs === null ? (
          <p className="px-3 py-4 text-[13px] text-muted">Loading chats...</p>
        ) : convs.length === 0 ? (
          <p className="px-3 py-4 text-[13px] leading-relaxed text-muted">No chats yet. Your conversations will appear here.</p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label} className="mb-3">
              <h2 className="px-3 pb-1 pt-2 text-[11.5px] font-medium uppercase tracking-wide text-muted">{label}</h2>
              <ul className="space-y-0.5">
                {items.map((c) => {
                  const active = c.id === activeId;
                  return (
                    <li key={c.id} className="group relative">
                      {editing === c.id ? (
                        <input
                          autoFocus
                          value={draft}
                          maxLength={120}
                          aria-label="Chat title"
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { if (draft.trim() && draft.trim() !== c.title) onRename(c.id, draft.trim()); setEditing(null); }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          onBlur={() => setEditing(null)}
                          className="h-9 w-full rounded-lg border border-brand bg-white px-3 text-[13.5px] focus:outline-none focus:ring-4 focus:ring-brand/15"
                        />
                      ) : confirm === c.id ? (
                        <div className="flex h-9 items-center justify-between gap-2 rounded-lg bg-red-50 px-3 text-[13px] text-red-800">
                          <span>Delete this chat?</span>
                          <span className="flex gap-1">
                            <button onClick={() => { setConfirm(null); onDelete(c.id); }} className="rounded px-2 py-0.5 font-semibold text-danger hover:bg-red-100">Delete</button>
                            <button onClick={() => setConfirm(null)} className="rounded px-2 py-0.5 font-medium hover:bg-red-100">Cancel</button>
                          </span>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => onOpen(c.id)}
                            aria-current={active ? "page" : undefined}
                            title={c.title}
                            className={`flex h-9 w-full items-center rounded-lg px-3 text-left text-[13.5px] transition-colors ${active ? "bg-blue-50 font-medium text-brand" : "text-slate-700 hover:bg-slate-100"}`}
                          >
                            <span className="truncate pr-14">{c.title}</span>
                          </button>
                          <span className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 lg:hidden lg:group-focus-within:flex lg:group-hover:flex">
                            <button onClick={() => { setDraft(c.title); setEditing(c.id); }} aria-label={`Rename ${c.title}`} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white hover:text-ink">
                              <EditIcon />
                            </button>
                            <button onClick={() => setConfirm(c.id)} aria-label={`Delete ${c.title}`} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white hover:text-danger">
                              <TrashIcon />
                            </button>
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

/* ---------------- main chat ---------------- */
export default function ChatPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q");
  const cParam = params.get("c");

  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(false);
  const [showList, setShowList] = useState(false); // phones: the history list replaces the thread

  const activeRef = useRef<string | null>(null);
  const loadSeq = useRef(0);
  const idRef = useRef(0);
  const started = useRef(false);
  const abortRef = useRef<AbortController | null>(null); // the answer currently streaming, if any
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const nid = () => ++idRef.current;

  const setActive = useCallback((id: string | null) => {
    activeRef.current = id;
    setActiveIdState(id);
    window.history.replaceState(null, "", id ? `/chat?c=${id}` : "/chat");
  }, []);

  const loadConvs = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) throw new Error();
      setConvs((await res.json()).conversations);
    } catch {
      setConvs((c) => c ?? []);
    }
  }, [router]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    loadSeq.current++;
    setActive(null);
    setMessages([]);
    setThreadError(false);
    setThreadLoading(false);
    setShowList(false);
  }, [setActive]);

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const seq = ++loadSeq.current;
    setActive(id);
    setShowList(false);
    setMessages([]);
    setThreadError(false);
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (seq !== loadSeq.current) return;
      if (res.status === 401) { router.push("/login"); return; }
      if (res.status === 404) { newChat(); return; }
      if (!res.ok) throw new Error();
      const d = await res.json();
      if (seq !== loadSeq.current) return;
      setMessages(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        d.messages.map((m: any): Msg => ({ id: nid(), role: m.role, text: m.text, sources: m.sources, messageId: m.role === "assistant" ? m.id : undefined, feedback: m.feedback ?? null }))
      );
    } catch {
      if (seq === loadSeq.current) setThreadError(true);
    } finally {
      if (seq === loadSeq.current) setThreadLoading(false);
    }
  }, [newChat, router, setActive]);

  async function renameConv(id: string, title: string) {
    const before = convs;
    setConvs((c) => c?.map((x) => (x.id === id ? { ...x, title } : x)) ?? c);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      if (!res.ok) throw new Error();
    } catch {
      setConvs(before);
    }
  }

  async function deleteConv(id: string) {
    const before = convs;
    setConvs((c) => c?.filter((x) => x.id !== id) ?? c);
    if (activeRef.current === id) newChat();
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setConvs(before);
    }
  }

  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth", block: "end" }); }, [messages, loading]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (cParam) openConversation(cParam);
    else if (q) send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || loading) return;
    const sentFrom = activeRef.current;
    const assistantId = nid();
    const controller = new AbortController();
    abortRef.current = controller;

    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setMessages((m) => [
      ...m,
      { id: nid(), role: "user", text: question },
      { id: assistantId, role: "assistant", text: "", streaming: true, stage: "searching" },
    ]);
    setLoading(true);

    const update = (patch: Partial<Msg>) => setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, ...patch } : x)));
    let text = "";
    let frame = 0;
    const flush = () => { frame = 0; update({ text, stage: "generating" }); };

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversation_id: sentFrom }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        // In development, show the backend's reason first (the route has already cleared the stale cookies).
        const d = await res.json().catch(() => ({}));
        if (process.env.NODE_ENV !== "production" && d.detail) throw new Error(`Session rejected by backend: ${d.detail}. Sign in again`);
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        // The saved conversation no longer exists (deleted elsewhere): start fresh.
        newChat();
        throw new Error("This conversation is no longer available. Please ask again to start a new chat");
      }
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "failed");
      }

      // Read the stream: one JSON event per line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "status") {
            update({ stage: ev.stage });
          } else if (ev.type === "delta") {
            text += ev.text;
            if (!frame) frame = requestAnimationFrame(flush); // at most one re-render per frame
          } else if (ev.type === "done") {
            finished = true;
            if (frame) cancelAnimationFrame(frame);
            if (!sentFrom && ev.conversation_id && activeRef.current === sentFrom) setActive(ev.conversation_id);
            update({
              text: ev.answer ?? text,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              sources: (ev.citations ?? []).map((c: any) => ({ document: c.source ?? "Document", page: c.page ?? null, snippet: "" })),
              messageId: ev.message_id ?? undefined,
              feedback: null,
              streaming: false,
              stage: undefined,
            });
          } else if (ev.type === "error") {
            throw new Error(ev.message || "failed");
          }
        }
      }
      if (!finished) throw new Error("The connection was interrupted");
      loadConvs(); // refresh titles and ordering
    } catch (err) {
      if (frame) cancelAnimationFrame(frame);
      if (controller.signal.aborted) {
        // The user pressed Stop (or switched chats). The partial answer is not saved on the server.
        update({ text, streaming: false, stage: undefined, stopped: true });
      } else {
        // In development the real reason is shown to help debugging; production shows the generic message.
        const reason = process.env.NODE_ENV !== "production" && err instanceof Error && err.message !== "failed" ? ` (${err.message})` : "";
        update({ text: `I couldn't get an answer just now. Please try again.${reason}`, streaming: false, stage: undefined, retry: question });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  const empty = messages.length === 0 && !loading && !threadLoading && !threadError;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-screen">
      <ConversationList
        convs={convs}
        activeId={activeId}
        onOpen={openConversation}
        onNew={newChat}
        onRename={renameConv}
        onDelete={deleteConv}
        className={`${showList ? "flex" : "hidden"} w-full lg:order-last lg:flex lg:w-64 lg:shrink-0 lg:border-l`}
      />

      <div className={`${showList ? "hidden" : "flex"} min-w-0 flex-1 flex-col lg:flex`}>
        {/* Phone toolbar */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-white px-3 lg:hidden">
          <button onClick={() => setShowList(true)} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-[13.5px] font-medium hover:bg-slate-100">
            <ClockIcon /> Chats
          </button>
          <button onClick={newChat} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-[13.5px] font-medium text-brand hover:bg-blue-50">
            <PlusIcon /> New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" aria-live={loading ? "off" : "polite"}>
            {threadLoading ? (
              <p className="pt-[15vh] text-center text-[14px] text-muted">Loading conversation...</p>
            ) : threadError ? (
              <div className="pt-[15vh] text-center text-[14px]">
                <p className="text-danger">Couldn&apos;t load this conversation.</p>
                <button onClick={() => activeId && openConversation(activeId)} className="mt-2 font-medium text-brand hover:underline">Retry</button>
              </div>
            ) : empty ? (
              <div className="flex flex-col items-center pt-[10vh] text-center">
                <LogoMark size={44} />
                <h1 className="mt-5 text-2xl font-semibold tracking-tight">Ask about Helix policies</h1>
                <p className="mt-2 max-w-sm text-[14.5px] text-muted">Answers come from company documents, with sources you can check.</p>
                <div className="mt-7 flex w-full max-w-md flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-white px-4 py-3 text-left text-[14px] shadow-btn hover:border-slate-300 hover:bg-slate-50">{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-6">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <li key={m.id} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[14.5px] leading-relaxed text-white">{m.text}</p>
                    </li>
                  ) : (
                    <li key={m.id} className="flex gap-3">
                      <span className="mt-0.5 shrink-0"><LogoMark size={28} /></span>
                      <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 shadow-btn">
                        {m.streaming && !m.text ? (
                          <p role="status" className="flex items-center gap-2.5 py-0.5 text-[14px] text-muted">
                            <span className="flex gap-1" aria-hidden="true">
                              {[0, 1, 2].map((i) => (
                                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
                              ))}
                            </span>
                            {m.stage === "generating" ? "Writing the answer..." : "Searching policies..."}
                          </p>
                        ) : (
                          <Markdown text={m.text} />
                        )}
                        {m.stopped && <p className="mt-2 text-[12.5px] italic text-muted">{m.text ? "Response stopped." : "Stopped before an answer was ready."}</p>}
                        {m.sources && <SourceChips sources={m.sources} />}
                        {m.retry && (
                          <button onClick={() => send(m.retry!)} className="mt-2 text-[13px] font-medium text-brand hover:underline">Try again</button>
                        )}
                        {m.messageId && !m.retry && !m.streaming && (
                          <div className="mt-3 border-t border-line pt-2">
                            <FeedbackBar messageId={m.messageId} initial={m.feedback ?? null} />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-line bg-canvas px-4 pb-4 pt-3 sm:px-6">
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(input); }} className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border border-line bg-white p-2 shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <textarea
              id="chat-input"
              ref={taRef}
              rows={1}
              value={input}
              onKeyDown={onKey}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              placeholder="Ask about a policy, guideline, or standard..."
              className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] placeholder:text-slate-400 focus:outline-none focus-visible:ring-0"
            />
            {loading ? (
              <button type="button" onClick={() => abortRef.current?.abort()} aria-label="Stop generating" title="Stop generating" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-navy text-white hover:bg-slate-800">
                <span className="h-3 w-3 rounded-[3px] bg-white" aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} aria-label="Send message" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-white hover:bg-[#1d4fd8] disabled:cursor-not-allowed disabled:bg-brand/40">
                <AppIcon name="send" />
              </button>
            )}
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[12px] text-muted">Copilot can make mistakes. Check the cited sources for important decisions.</p>
        </div>
      </div>
    </div>
  );
}