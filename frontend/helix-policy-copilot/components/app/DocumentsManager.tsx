"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Spinner } from "@/components/ui";
import { AppIcon } from "./Icons";

type Status = "indexed" | "processing" | "failed";
type Doc = { id: string; name: string; status: Status; stage: string | null; size: number | null; pages: number | null; uploadedAt: string | null; error: string | null };
type Upload = { key: number; name: string; state: "uploading" | "processing" | "done" | "error"; docId?: string; stage?: string; message?: string };

const MAX_MB = 10; // matches MAX_SIZE_BYTES in the backend
const fmtSize = (b: number | null) => (b == null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const cap = (s?: string | null) => (s ? s[0].toUpperCase() + s.slice(1) : "Queued");
const ext = (n: string) => (n.includes(".") ? n.split(".").pop()!.toUpperCase() : "");

const BADGE: Record<Status, { label: string; cls: string }> = {
  indexed: { label: "Indexed", cls: "bg-green-50 text-green-700 ring-green-200" },
  processing: { label: "Processing", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700 ring-red-200" },
};
const FILTERS: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "indexed", label: "Indexed" },
  { id: "processing", label: "Processing" },
  { id: "failed", label: "Failed" },
];

/* ---------------- Upload dialog ---------------- */
function UploadDialog({ onClose, uploads, onFiles }: { onClose: () => void; uploads: Upload[]; onFiles: (f: FileList | File[]) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-navy/50" onClick={onClose} aria-hidden="true" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="upload-title" tabIndex={-1} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-white p-6 shadow-card focus:outline-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold">Upload documents</h2>
            <p className="mt-1 text-[13.5px] text-muted">Add policies for Copilot to answer from. They&apos;re indexed automatically.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink">
            <AppIcon name="close" className="h-5 w-5" />
          </button>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
          className={`mt-5 flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${drag ? "border-brand bg-blue-50" : "border-slate-300 bg-canvas"}`}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-brand"><AppIcon name="upload" className="h-5 w-5" /></span>
          <p className="mt-3 text-[14.5px] font-medium">Drag and drop files here</p>
          <p className="mt-1 text-[13px] text-muted">PDF or DOCX, up to {MAX_MB} MB each</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-[14px] font-medium shadow-btn hover:bg-slate-50">
            Browse files
          </button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.docx" className="sr-only" tabIndex={-1} onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {uploads.length > 0 && (
          <ul className="mt-4 space-y-2" aria-live="polite">
            {uploads.slice(0, 6).map((u) => (
              <li key={u.key} className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-2.5 text-[13.5px]">
                <span className="shrink-0">
                  {(u.state === "uploading" || u.state === "processing") && <span className="text-brand"><Spinner /></span>}
                  {u.state === "done" && <Icon name="check" className="h-4 w-4 text-success" />}
                  {u.state === "error" && <Icon name="alert" className="h-4 w-4 text-danger" />}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                <span className={`shrink-0 text-right ${u.state === "error" ? "max-w-[55%] text-danger" : "text-muted"}`}>
                  {u.state === "uploading" ? "Uploading..." : u.state === "processing" ? `${cap(u.stage)}...` : u.state === "done" ? "Indexed" : u.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-5 text-[14px] font-medium shadow-btn hover:bg-slate-50">Done</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Delete confirmation ---------------- */
function DeleteDialog({ doc, onClose, onDeleted }: { doc: Doc; onClose: () => void; onDeleted: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (res.ok) { onDeleted(doc.id); return; }
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Couldn't delete this document. Please try again.");
    } catch {
      setErr("Can't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-navy/50" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-desc" tabIndex={-1} className="relative w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-card focus:outline-none">
        <h2 id="del-title" className="text-lg font-semibold">Delete this document?</h2>
        <p id="del-desc" className="mt-2 text-[14px] leading-relaxed text-muted">
          <span className="font-medium text-ink">{doc.name}</span> will be removed from the knowledge base. Copilot will no longer answer from it. This can&apos;t be undone.
        </p>
        {err && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13.5px] text-red-800">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> {err}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-[14px] font-medium shadow-btn hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button onClick={confirm} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-danger px-4 text-[14px] font-medium text-white shadow-btn hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy && <Spinner />}
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function DocumentsManager() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [listErr, setListErr] = useState(false);
  const [listMissing, setListMissing] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const keyRef = useRef(0);
  const uploadsRef = useRef<Upload[]>([]);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDocs(data.documents);
      setListMissing(!!data.listMissing);
      setListErr(false);
    } catch {
      setListErr(true);
      setDocs((d) => d ?? []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = useCallback((key: number, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x))), []);
  const closeDialog = useCallback(() => setOpen(false), []);
  const closeDelete = useCallback(() => setToDelete(null), []);

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

  const counts = useMemo(() => {
    const c = { all: docs?.length ?? 0, indexed: 0, processing: 0, failed: 0 };
    docs?.forEach((d) => { c[d.status]++; });
    return c;
  }, [docs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(docs ?? [])]
      .filter((d) => (filter === "all" || d.status === filter) && (!q || d.name.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.status === "processing") - Number(a.status === "processing") || (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
  }, [docs, query, filter]);

  const uploadBtn = (
    <button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white shadow-btn transition-colors hover:bg-[#1d4fd8] active:bg-brand-dark">
      <AppIcon name="upload" /> Upload documents
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Documents</h1>
          <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">Manage the policies and guidelines Copilot answers from. Only admins can see this page.</p>
        </div>
        {uploadBtn}
      </div>

      {/* Toolbar */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors ${filter === f.id ? "bg-navy text-white" : "border border-line bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {f.label}
              <span className={`text-[12px] ${filter === f.id ? "text-slate-300" : "text-muted"}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <label htmlFor="doc-search" className="sr-only">Search documents</label>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          <input id="doc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-[14px] placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15" />
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white shadow-btn">
        {docs === null ? (
          <p className="px-5 py-12 text-center text-[14px] text-muted">Loading documents...</p>
        ) : listErr ? (
          <div className="px-5 py-12 text-center text-[14px]">
            <p className="text-danger">Couldn&apos;t load documents.</p>
            <button onClick={load} className="mt-2 font-medium text-brand hover:underline">Retry</button>
          </div>
        ) : listMissing ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[14.5px] font-medium">The document list isn&apos;t available yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">The backend needs a <code className="rounded bg-slate-100 px-1">GET /upload/documents</code> endpoint. Uploads still work and show their progress in the upload dialog.</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-brand"><AppIcon name="doc" className="h-6 w-6" /></span>
            <p className="mt-4 text-[15px] font-semibold">No documents yet</p>
            <p className="mt-1 max-w-xs text-[13.5px] text-muted">Upload your first policy so Copilot can start answering questions.</p>
            <div className="mt-5">{uploadBtn}</div>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-[14px] text-muted">No documents match your search or filter.</p>
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-line bg-canvas text-[12.5px] font-medium uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 sm:px-5">Name</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Type</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Pages</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Size</th>
                <th scope="col" className="hidden px-3 py-3 md:table-cell">Uploaded</th>
                <th scope="col" className="px-4 py-3 text-right sm:px-5">Status</th>
                <th scope="col" className="w-12 px-2 py-3 sm:px-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-slate-500"><AppIcon name="doc" /></span>
                      <div className="min-w-0">
                        <p className="max-w-[16rem] truncate font-medium sm:max-w-sm">{d.name}</p>
                        <p className={`max-w-[16rem] truncate text-[12.5px] sm:max-w-sm ${d.status === "failed" ? "text-danger" : "text-muted"}`}>
                          {d.status === "failed" && d.error ? d.error : d.status === "processing" ? `${cap(d.stage)}...` : <span className="md:hidden">{[ext(d.name), fmtSize(d.size), d.pages ? `${d.pages} pages` : ""].filter(Boolean).join(" · ")}</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3.5 text-slate-600 md:table-cell">{ext(d.name) || "-"}</td>
                  <td className="hidden px-3 py-3.5 text-slate-600 md:table-cell">{d.pages ?? "-"}</td>
                  <td className="hidden px-3 py-3.5 text-slate-600 md:table-cell">{fmtSize(d.size) || "-"}</td>
                  <td className="hidden px-3 py-3.5 text-slate-600 md:table-cell">{fmtDate(d.uploadedAt) || "-"}</td>
                  <td className="px-4 py-3.5 text-right sm:px-5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ring-inset ${BADGE[d.status].cls}`}>
                      {d.status === "processing" && <Spinner />}
                      {BADGE[d.status].label}
                    </span>
                  </td>
                  <td className="px-2 py-3.5 text-right sm:px-3">
                    <button
                      onClick={() => setToDelete(d)}
                      disabled={d.status === "processing"}
                      aria-label={`Delete ${d.name}`}
                      title={d.status === "processing" ? "Wait until processing finishes" : "Delete document"}
                      className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4.5A.5.5 0 0 1 9.5 4h5a.5.5 0 0 1 .5.5V7" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && <UploadDialog onClose={closeDialog} uploads={uploads} onFiles={handleFiles} />}
      {toDelete && (
        <DeleteDialog
          doc={toDelete}
          onClose={closeDelete}
          onDeleted={(id) => { setDocs((d) => d?.filter((x) => x.id !== id) ?? d); setToDelete(null); load(); }}
        />
      )}
    </>
  );
}