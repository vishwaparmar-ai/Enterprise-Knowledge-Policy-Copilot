"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Spinner } from "@/components/ui";
import { AppIcon } from "./Icons";

type Doc = {
  id: string; name: string; status: "indexed" | "processing" | "failed";
  stage: string | null; size: number | null; pages: number | null; uploadedAt: string | null; error: string | null;
};
type Upload = { key: number; name: string; state: "uploading" | "processing" | "done" | "error"; docId?: string; stage?: string; message?: string };

const MAX_MB = 10; // matches MAX_SIZE_BYTES in the backend
const fmtSize = (b: number | null) => (b == null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const cap = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : "Queued");

const STATUS = {
  indexed: { label: "Indexed", cls: "bg-green-50 text-green-700 ring-green-200" },
  processing: { label: "Processing", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700 ring-red-200" },
};

export default function DocumentsManager() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [listErr, setListErr] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);
  const uploadsRef = useRef<Upload[]>([]);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error();
      setDocs((await res.json()).documents);
      setListErr(false);
    } catch {
      setListErr(true);
      setDocs((d) => d ?? []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback((key: number, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x))), []);

  // Ingestion runs in the background on the server, so poll while anything is still in progress.
  const active = uploads.some((u) => u.state === "processing") || (docs?.some((d) => d.status === "processing") ?? false);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const pending = uploadsRef.current.filter((u) => u.state === "processing" && u.docId);
      await Promise.all(
        pending.map(async (u) => {
          try {
            const r = await fetch(`/api/documents/${u.docId}`);
            if (!r.ok) return;
            const d = await r.json();
            if (d.status === "indexed") patch(u.key, { state: "done", stage: "indexed" });
            else if (d.status === "failed") patch(u.key, { state: "error", message: d.error || "Processing failed." });
            else patch(u.key, { stage: d.stage ?? u.stage });
          } catch { /* retry on next tick */ }
        })
      );
      load();
    }, 3000);
    return () => clearInterval(t);
  }, [active, load, patch]);

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = ++keyRef.current;
      setUploads((u) => [{ key, name: file.name, state: "uploading" }, ...u]);
      if (!/\.(pdf|docx)$/i.test(file.name)) { patch(key, { state: "error", message: "Only PDF and DOCX files are supported." }); continue; }
      if (file.size > MAX_MB * 1048576) { patch(key, { state: "error", message: `File is larger than ${MAX_MB} MB.` }); continue; }
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/documents", { method: "POST", body: form });
        if (res.status === 401) { window.location.assign("/login"); return; }
        if (res.ok) {
          const d = await res.json();
          patch(key, { state: "processing", docId: d.docId, stage: d.stage });
          load();
        } else {
          const d = await res.json().catch(() => ({}));
          patch(key, { state: "error", message: d.error || "Upload failed. Please try again." });
        }
      } catch {
        patch(key, { state: "error", message: "Can't reach the server. Please try again." });
      }
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="upload-h">
        <h2 id="upload-h" className="sr-only">Upload documents</h2>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-brand bg-blue-50" : "border-slate-300 bg-white"}`}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-brand"><AppIcon name="upload" className="h-5 w-5" /></span>
          <p className="mt-3 text-[14.5px] font-medium">Drag and drop files here</p>
          <p className="mt-1 text-[13px] text-muted">PDF or DOCX, up to {MAX_MB} MB each</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-[14px] font-medium shadow-btn hover:bg-slate-50">
            Browse files
          </button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx" className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {uploads.length > 0 && (
          <ul className="mt-3 space-y-2" aria-live="polite">
            {uploads.slice(0, 5).map((u) => (
              <li key={u.key} className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-2.5 text-[13.5px]">
                <span className="shrink-0">
                  {(u.state === "uploading" || u.state === "processing") && <span className="text-brand"><Spinner /></span>}
                  {u.state === "done" && <Icon name="check" className="h-4 w-4 text-success" />}
                  {u.state === "error" && <Icon name="alert" className="h-4 w-4 text-danger" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                <span className={`shrink-0 ${u.state === "error" ? "text-danger" : "text-muted"}`}>
                  {u.state === "uploading" ? "Uploading..." : u.state === "processing" ? `${cap(u.stage)}...` : u.state === "done" ? "Indexed" : u.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="list-h">
        <h2 id="list-h" className="mb-3 text-[15px] font-semibold">Knowledge base</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-btn">
          {docs === null ? (
            <p className="px-5 py-8 text-center text-[14px] text-muted">Loading documents...</p>
          ) : listErr ? (
            <div className="px-5 py-8 text-center text-[14px]">
              <p className="text-danger">Couldn&apos;t load documents.</p>
              <button onClick={load} className="mt-2 font-medium text-brand hover:underline">Retry</button>
            </div>
          ) : docs.length === 0 ? (
            <p className="px-5 py-8 text-center text-[14px] text-muted">No documents yet. Upload your first policy above.</p>
          ) : (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-slate-500"><AppIcon name="doc" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{d.name}</p>
                    <p className={`truncate text-[12.5px] ${d.status === "failed" ? "text-danger" : "text-muted"}`}>
                      {d.status === "failed" && d.error
                        ? d.error
                        : d.status === "processing"
                        ? `${cap(d.stage)}...`
                        : [fmtSize(d.size), d.pages ? `${d.pages} pages` : "", fmtDate(d.uploadedAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}