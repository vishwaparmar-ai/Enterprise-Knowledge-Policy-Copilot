"use client";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/ui";
import { AppIcon } from "./Icons";
import Markdown from "./Markdown";

type Source = { document: string; page: number | null; snippet: string };
type Msg = { id: number; role: "user" | "assistant"; text: string; sources?: Source[]; retry?: string };

const SUGGESTIONS = [
  "What is our remote work policy?",
  "How many days of annual leave do I get?",
  "Summarise the information security guidelines",
];

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

export default function ChatPanel() {
  const router = useRouter();
  const q = useSearchParams().get("q");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [convoId, setConvoId] = useState<string | null>(null);
  const idRef = useRef(0);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const nid = () => ++idRef.current;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);
  useEffect(() => {
    if (q && !started.current) { started.current = true; send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || loading) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setMessages((m) => [...m, { id: nid(), role: "user", text: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversation_id: convoId }),
      });
      if (res.status === 401) {
        // In development, show the backend's reason first (the route has already cleared the stale cookies).
        const d = await res.json().catch(() => ({}));
        if (process.env.NODE_ENV !== "production" && d.detail) throw new Error(`Session rejected by backend: ${d.detail}. Sign in again`);
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "failed");
      }
      const data = await res.json();
      setConvoId(data.conversation_id ?? null);
      setMessages((m) => [...m, { id: nid(), role: "assistant", text: data.answer, sources: data.sources }]);
    } catch (err) {
      // In development the real reason is shown to help debugging; production shows the generic message.
      const reason = process.env.NODE_ENV !== "production" && err instanceof Error && err.message !== "failed" ? ` (${err.message})` : "";
      setMessages((m) => [...m, { id: nid(), role: "assistant", text: `I couldn't get an answer just now. Please try again.${reason}`, retry: question }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col md:h-screen">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" aria-live="polite">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center pt-[12vh] text-center">
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
                      <Markdown text={m.text} />
                      {m.sources && <SourceChips sources={m.sources} />}
                      {m.retry && (
                        <button onClick={() => send(m.retry!)} className="mt-2 text-[13px] font-medium text-brand hover:underline">Try again</button>
                      )}
                    </div>
                  </li>
                )
              )}
              {loading && (
                <li className="flex items-center gap-3" aria-label="Copilot is typing">
                  <span className="shrink-0"><LogoMark size={28} /></span>
                  <span className="flex gap-1 rounded-2xl border border-line bg-white px-4 py-3.5 shadow-btn">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
                    ))}
                  </span>
                </li>
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
          <button type="submit" disabled={!input.trim() || loading} aria-label="Send message" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-white hover:bg-[#1d4fd8] disabled:cursor-not-allowed disabled:bg-brand/40">
            <AppIcon name="send" />
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[12px] text-muted">Copilot can make mistakes. Check the cited sources for important decisions.</p>
      </div>
    </div>
  );
}