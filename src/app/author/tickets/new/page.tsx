"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { MAX_FILES_PER_TICKET, MAX_FILE_BYTES, ALLOWED_DESCRIPTION } from "@/lib/attachments";
import { api, ApiClientError, uploadFile } from "@/lib/client/api";
import { usePolling } from "@/lib/client/usePolling";
import type { AuthorTicket, Book } from "@/lib/types";

function Form() {
  const router = useRouter();
  const preselected = useSearchParams().get("book") ?? "";
  const { data: books } = usePolling<Book[]>("/api/books", 60000);
  const [bookId, setBookId] = useState(preselected);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again after removing it
    const next = [...files];
    setFileError("");
    for (const f of picked) {
      if (next.length >= MAX_FILES_PER_TICKET) { setFileError(`You can attach up to ${MAX_FILES_PER_TICKET} files.`); break; }
      if (f.size > MAX_FILE_BYTES) { setFileError(`"${f.name}" is over ${MAX_FILE_BYTES / 1024 / 1024} MB.`); continue; }
      next.push(f);
    }
    setFiles(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setFieldErrors({});
    try {
      const ticket = await api<AuthorTicket>("/api/tickets", {
        method: "POST",
        json: { bookId: bookId || null, subject, description },
      });
      // The ticket exists now; a failed upload must never lose it, so report failures instead of aborting.
      const failed: string[] = [];
      for (const f of files) {
        try { await uploadFile(`/api/tickets/${ticket.id}/attachments`, f); }
        catch { failed.push(f.name); }
      }
      router.push(`/author/tickets?submitted=1${failed.length ? `&uploadFailed=${encodeURIComponent(failed.join(", "))}` : ""}`);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiClientError && Array.isArray(err.details)) {
        setFieldErrors(Object.fromEntries((err.details as { field: string; message: string }[]).map((d) => [d.field, d.message])));
      }
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1>Submit a Support Query</h1>
      <p className="muted">Tell us what's going on and our team will get back to you. Most queries get a first response within 48 hours.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="book">Which book is this about?</label>
        <select id="book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">General / Account Level</option>
          {books?.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>

        <label htmlFor="subject">Subject</label>
        <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required placeholder="e.g. Royalty for Q2 not received" />
        {fieldErrors.subject && <div className="err">{fieldErrors.subject}</div>}

        <label htmlFor="desc">Describe your query</label>
        <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} required
          placeholder="Include any details that help us: dates, platforms, amounts, what you've already tried." />
        {fieldErrors.description && <div className="err">{fieldErrors.description}</div>}

        <label htmlFor="file">Attachments (optional)</label>
        <input id="file" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" onChange={pickFiles} disabled={files.length >= MAX_FILES_PER_TICKET} />
        <div className="small muted">{ALLOWED_DESCRIPTION}, up to {MAX_FILES_PER_TICKET} files of {MAX_FILE_BYTES / 1024 / 1024} MB each. For print-quality issues, clear photos of the defects help us verify and arrange a free reprint faster.</div>
        {fileError && <div className="err">{fileError}</div>}
        {files.length > 0 && (
          <ul className="filelist">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}><span>{f.name} <span className="muted">({Math.max(1, Math.round(f.size / 1024))} KB)</span></span>
                <button type="button" className="link small" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></li>
            ))}
          </ul>
        )}

        {error && !Object.keys(fieldErrors).length && <div className="err" role="alert">{error}</div>}
        <p><button disabled={busy}>{busy ? (files.length ? "Submitting & uploading…" : "Submitting…") : "Submit query"}</button></p>
      </form>
    </div>
  );
}

// useSearchParams needs a Suspense boundary for static rendering.
export default function NewTicketPage() { return <Suspense><Form /></Suspense>; }
