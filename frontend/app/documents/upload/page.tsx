"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  FileText,
  FolderOpen,
  Home,
  BarChart3,
  Database,
  Settings,
  Shield,
  Upload,
  Users,
  X,
  CheckCircle2,
  Search,
} from "lucide-react";

export default function UploadDocumentPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [accessLevel, setAccessLevel] = useState("");

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);

    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const droppedFile = event.dataTransfer.files?.[0];

    if (droppedFile) {
      handleFile(droppedFile);
    }
  };

  const removeFile = () => {
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = () => {
    if (!file) {
      alert("Please select a document first.");
      return;
    }

    console.log({
      file,
      title,
      department,
      documentType,
      accessLevel,
    });

    // Connect this later to your FastAPI upload endpoint.
  };

  return (
    <div className="flex min-h-screen bg-background text-text-primary">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside className="flex w-64 flex-col bg-navy-900 text-white">

        {/* Logo */}
        <div className="border-b border-navy-800 px-6 py-5">
          <div className="flex items-center gap-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500">
              <Shield size={20} />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Knowly
              </h1>

              <p className="text-xs text-navy-300">
                Enterprise Knowledge
              </p>
            </div>

          </div>

          <p className="mt-2 text-sm text-navy-300">
            & Policy Copilot
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5">

          <SidebarItem
            icon={<Home size={18} />}
            label="Home"
          />

          <SidebarItem
            icon={<FileText size={18} />}
            label="Chat"
          />

          <SidebarItem
            icon={<FolderOpen size={18} />}
            label="Documents"
            active
          />

          <SidebarItem
            icon={<Database size={18} />}
            label="Knowledge Base"
          />

          <SidebarItem
            icon={<BarChart3 size={18} />}
            label="Evaluation"
          />

          <SidebarItem
            icon={<BarChart3 size={18} />}
            label="Analytics"
          />

          <SidebarItem
            icon={<Settings size={18} />}
            label="Settings"
          />

        </nav>

        {/* Bottom Help Card */}
        <div className="mx-3 mb-4 rounded-lg border border-navy-700 bg-navy-800/70 p-4">

          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500/20 text-primary-300">
            <Users size={17} />
          </div>

          <p className="text-xs font-medium text-white">
            Ask anything about your company policies,
            HR, tech docs and more.
          </p>

        </div>

      </aside>


      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}

      <main className="flex min-w-0 flex-1 flex-col">

        {/* =================================================
            TOP HEADER
        ================================================= */}

        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-7">

          {/* Search */}
          <div className="flex h-10 w-full max-w-2xl items-center gap-3 rounded-md border border-border bg-background px-3">

            <Search
              size={17}
              className="text-text-muted"
            />

            <input
              type="text"
              placeholder="Search documents, topics, or ask a question..."
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />

            <kbd className="rounded border border-border bg-white px-2 py-1 text-[11px] text-text-muted">
              Ctrl K
            </kbd>

          </div>


          {/* User */}
          <div className="ml-6 flex items-center gap-5">

            <button className="text-text-secondary hover:text-text-primary">
              <Bell size={19} />
            </button>

            <div className="flex items-center gap-2">

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                VP
              </div>

              <div className="hidden text-left lg:block">
                <p className="text-sm font-medium text-text-primary">
                  Vishwa Parmar
                </p>

                <p className="text-xs text-text-muted">
                  Employee
                </p>
              </div>

              <ChevronDown
                size={15}
                className="text-text-muted"
              />

            </div>

          </div>

        </header>


        {/* =================================================
            PAGE CONTENT
        ================================================= */}

        <section className="flex-1 overflow-auto">

          <div className="mx-auto max-w-5xl px-8 py-8">

            {/* Breadcrumb */}
            <div className="mb-6 flex items-center gap-2 text-sm">

              <button className="flex items-center gap-1 text-text-muted hover:text-text-primary">
                <ArrowLeft size={15} />
                Documents
              </button>

              <span className="text-text-muted">
                /
              </span>

              <span className="font-medium text-text-primary">
                Upload Document
              </span>

            </div>


            {/* Page Header */}
            <div className="mb-7">

              <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
                Upload Document
              </h1>

              <p className="mt-1.5 text-sm text-text-secondary">
                Add a document to your company's knowledge base.
              </p>

            </div>


            {/* =================================================
                UPLOAD CARD
            ================================================= */}

            <div className="rounded-xl border border-border bg-white shadow-card">

              {/* Card Header */}
              <div className="border-b border-border px-6 py-5">

                <h2 className="text-base font-semibold text-text-primary">
                  Document
                </h2>

                <p className="mt-1 text-sm text-text-secondary">
                  Upload a PDF, Markdown, or text document.
                </p>

              </div>


              <div className="p-6">

                {/* =================================================
                    DROPZONE
                ================================================= */}

                {!file ? (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`
                      flex min-h-72 flex-col items-center justify-center
                      rounded-xl border-2 border-dashed
                      px-6 py-12 text-center
                      transition
                      ${
                        isDragging
                          ? "border-primary-500 bg-primary-50"
                          : "border-border-strong bg-background hover:border-primary-300 hover:bg-primary-50/40"
                      }
                    `}
                  >

                    {/* Upload Icon */}
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
                      <Upload size={25} />
                    </div>

                    <h3 className="text-sm font-semibold text-text-primary">
                      Drag & drop your file here
                    </h3>

                    <p className="mt-2 text-sm text-text-muted">
                      or
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      className="mt-3 rounded-md bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 active:bg-primary-700"
                    >
                      Browse Files
                    </button>

                    <p className="mt-4 text-xs text-text-muted">
                      Supported formats: PDF, MD, TXT
                    </p>

                    <p className="mt-1 text-xs text-text-muted">
                      Maximum file size: 10 MB
                    </p>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.md,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                  </div>
                ) : (
                  /* =================================================
                     SELECTED FILE
                     ================================================= */

                  <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">

                    <div className="flex items-center gap-4">

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-danger-light text-danger">
                        <FileText size={23} />
                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="truncate text-sm font-semibold text-text-primary">
                          {file.name}
                        </p>

                        <p className="mt-1 text-xs text-text-secondary">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                          {" · "}
                          {file.type || "Document"}
                        </p>

                      </div>

                      <div className="flex items-center gap-3">

                        <CheckCircle2
                          size={19}
                          className="text-success"
                        />

                        <button
                          type="button"
                          onClick={removeFile}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-white hover:text-danger"
                        >
                          <X size={17} />
                        </button>

                      </div>

                    </div>

                  </div>
                )}


                {/* =================================================
                    DOCUMENT DETAILS
                ================================================= */}

                <div className="mt-8">

                  <div className="mb-5">

                    <h2 className="text-base font-semibold text-text-primary">
                      Document Details
                    </h2>

                    <p className="mt-1 text-sm text-text-secondary">
                      Optional information to help organize your document.
                    </p>

                  </div>


                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

                    {/* Title */}
                    <FormField label="Title">

                      <input
                        type="text"
                        value={title}
                        onChange={(event) =>
                          setTitle(event.target.value)
                        }
                        placeholder="e.g. HR Policy"
                        className="form-input"
                      />

                    </FormField>


                    {/* Department */}
                    <FormField label="Department">

                      <select
                        value={department}
                        onChange={(event) =>
                          setDepartment(event.target.value)
                        }
                        className="form-input"
                      >
                        <option value="">
                          Select department
                        </option>

                        <option value="hr">
                          Human Resources
                        </option>

                        <option value="engineering">
                          Engineering
                        </option>

                        <option value="finance">
                          Finance
                        </option>

                        <option value="security">
                          Security
                        </option>

                        <option value="it">
                          IT
                        </option>

                        <option value="other">
                          Other
                        </option>

                      </select>

                    </FormField>


                    {/* Document Type */}
                    <FormField label="Document Type">

                      <select
                        value={documentType}
                        onChange={(event) =>
                          setDocumentType(event.target.value)
                        }
                        className="form-input"
                      >

                        <option value="">
                          Select type
                        </option>

                        <option value="policy">
                          Policy
                        </option>

                        <option value="handbook">
                          Handbook
                        </option>

                        <option value="engineering">
                          Engineering Documentation
                        </option>

                        <option value="security">
                          Security Documentation
                        </option>

                        <option value="guide">
                          Guide
                        </option>

                        <option value="other">
                          Other
                        </option>

                      </select>

                    </FormField>


                    {/* Access Level */}
                    <FormField label="Access Level">

                      <select
                        value={accessLevel}
                        onChange={(event) =>
                          setAccessLevel(event.target.value)
                        }
                        className="form-input"
                      >

                        <option value="">
                          Select access level
                        </option>

                        <option value="public">
                          All Employees
                        </option>

                        <option value="department">
                          Department Only
                        </option>

                        <option value="restricted">
                          Restricted
                        </option>

                      </select>

                    </FormField>

                  </div>

                </div>


                {/* =================================================
                    ACTIONS
                ================================================= */}

                <div className="mt-8 flex items-center justify-end gap-3 border-t border-border pt-6">

                  <button
                    type="button"
                    className="rounded-md border border-border bg-white px-5 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-background-soft hover:text-text-primary"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!file}
                    className="
                      rounded-md
                      bg-primary-500
                      px-5 py-2.5
                      text-sm font-medium
                      text-white
                      transition
                      hover:bg-primary-600
                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    Upload Document
                  </button>

                </div>

              </div>

            </div>

          </div>

        </section>

      </main>

    </div>
  );
}


/* =========================================================
   SIDEBAR ITEM
   ========================================================= */

function SidebarItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`
        mb-1 flex w-full items-center gap-3
        rounded-md px-4 py-2.5
        text-sm font-medium
        transition
        ${
          active
            ? "bg-primary-600 text-white"
            : "text-navy-200 hover:bg-navy-800 hover:text-white"
        }
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}


/* =========================================================
   FORM FIELD
   ========================================================= */

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-text-primary">
        {label}
      </label>

      {children}
    </div>
  );
}