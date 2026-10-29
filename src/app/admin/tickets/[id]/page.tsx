"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PriorityBadge, SourceTag, StatusBadge } from "@/components/Badges";
import Attachments from "@/components/Attachments";
import Skeleton from "@/components/Skeleton";
import Thread, { when } from "@/components/Thread";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client/api";
import { usePolling } from "@/lib/client/usePolling";
import type { AdminTicket, Message } from "@/lib/types";
import { CATEGORIES, PRIORITIES, STATUSES } from "@/lib/validation";

type Detail = AdminTicket & { messages: Message[] };
interface Draft { draft: string | null; aiAvailable: boolean; reason?: string; stale: boolean }

export default function AdminTicket() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: t, error, refresh } = usePolling<Detail>(`/api/tickets/${id}`, 5000);

  // --- reply composer + AI draft ---
  const [reply, setReply] = useState("");
  const [dirty, setDirty] = useState(false);          // admin has typed: never overwrite their work
  const [usedDraft, setUsedDraft] = useState(false);  // reply started from an AI draft
  const [drafting, setDrafting] = useState(false);
  const [aiDown, setAiDown] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const requested = useRef<string>("");

  const loadDraft = useCallback(async (regenerate = false) => {
    setDrafting(true); setAiDown(null);
    try {
      const d = await api<Draft>(`/api/tickets/${id}/ai/draft`, { method: "POST", json: { regenerate } });
      if (!d.aiAvailable) setAiDown(d.reason ?? "unavailable");
      if (d.draft && (regenerate || !dirty)) { setReply(d.draft); setUsedDraft(true); setDirty(false); }
    } catch (e) { setAiDown((e as Error).message); }
    setDrafting(false);
  }, [id, dirty]);

  // Present a draft when the admin opens the ticket (once per ticket-state: first load, or after a new author reply).
  const signature = t ? `${t.id}:${t.aiDraft ? 1 : 0}:${t.aiDraftStale ? 1 : 0}` : "";
  useEffect(() => {
    if (!t || t.status === "Closed" || requested.current === signature) return;
    requested.current = signature;
    if (t.aiDraft && !t.aiDraftStale) { if (!dirty) { setReply(t.aiDraft); setUsedDraft(true); } return; } // cached: free
    loadDraft(false);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(body: Record<string, unknown>) {
    try { await api(`/api/tickets/${id}`, { method: "PATCH", json: body }); await refresh(); toast("Ticket updated"); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function send() {
    setBusy(true);
    try {
      await api(`/api/tickets/${id}/messages`, { method: "POST", json: { body: reply, aiAssisted: usedDraft } });
      setReply(""); setDirty(false); setUsedDraft(false);
      toast("Reply sent. The author can see it now.");
      await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }

  async function addNote() {
    setBusy(true);
    try { await api(`/api/tickets/${id}/notes`, { method: "POST", json: { body: note } }); setNote(""); await refresh(); toast("Internal note added"); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }

  async function retriage() {
    try {
      const r = await api<{ aiAvailable: boolean }>(`/api/tickets/${id}/ai/triage`, { method: "POST" });
      toast(r.aiAvailable ? "Re-classified by AI." : "AI is unavailable right now; keyword rules were applied.", r.aiAvailable ? "success" : "info");
      await refresh();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  if (error && !t) return <p className="err">{error}</p>;
  if (!t) return <Skeleton rows={5} height={60} />;
  const closed = t.status === "Closed";

  return (
    <>
      <p className="small"><Link href="/admin">← Back to queue</Link></p>
      <div className="row between">
        <div>
          <h1>#{t.ticketNumber} · {t.subject}</h1>
          <p className="muted small">{t.authorName} ({t.authorEmail}) · {t.bookTitle ?? "General / Account Level"} · opened {when(t.createdAt)}</p>
        </div>
        <div className="row"><PriorityBadge priority={t.priority} /><StatusBadge status={t.status} /></div>
      </div>

      <div className="layout2">
        <div>
          <div className="card">
            <h2>Conversation</h2>
            <div className="msg"><div className="meta"><b>{t.authorName}</b><span>{when(t.createdAt)}</span></div>{t.description}</div>
            <Attachments ticketId={t.id} items={t.attachments} />
            <Thread messages={t.messages} authorName={t.authorName} />
          </div>

          <div className="card">
            <div className="row between">
              <h2 style={{ margin: 0 }}>Reply to author</h2>
              <button className="secondary" disabled={drafting || closed} onClick={() => loadDraft(true)}>{drafting ? "Drafting…" : "↻ Regenerate AI draft"}</button>
            </div>
            {drafting && <p className="small muted">Drafting a reply from the knowledge base and this author's records…</p>}
            {aiDown && <div className="banner">AI drafting is unavailable right now ({aiDown.replace(/_/g, " ")}). Write your reply manually; everything else works normally.</div>}
            {!drafting && !aiDown && usedDraft && !dirty && <p className="small muted">AI draft: review and edit before sending. Nothing is sent automatically.</p>}
            <textarea style={{ minHeight: 200 }} value={reply} disabled={closed}
              onChange={(e) => { setReply(e.target.value); setDirty(true); }} placeholder={closed ? "Ticket is closed." : "Write your reply…"} />
            <p className="row">
              <button disabled={busy || !reply.trim() || closed} onClick={send}>Send reply</button>
            </p>
          </div>

          <div className="card">
            <h2>Internal note <span className="small muted">(never shown to the author)</span></h2>
            <textarea style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} />
            <p><button className="secondary" disabled={busy || !note.trim()} onClick={addNote}>Add note</button></p>
          </div>
        </div>

        <aside>
          <div className="card">
            <h2>Manage</h2>
            <label>Status</label>
            <select value={t.status} onChange={(e) => patch({ status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <label>Priority <SourceTag source={t.prioritySource} /></label>
            <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
            <label>Category <SourceTag source={t.categorySource} /></label>
            <select value={t.category ?? ""} onChange={(e) => patch({ category: e.target.value })}>
              {!t.category && <option value="" disabled>Unclassified</option>}
              {CATEGORIES.map((s) => <option key={s}>{s}</option>)}
            </select>
            {t.aiRationale && <p className="small muted" style={{ marginTop: 8 }}>Why: {t.aiRationale}</p>}
            <p><button className="link small" onClick={retriage}>Re-run AI classification</button></p>

            <label>Assigned to</label>
            <div>{t.assignedToName ?? <span className="muted">Unassigned</span>}</div>
            <p className="row">
              <button className="secondary" onClick={() => patch({ assignedTo: "me" })}>Assign to me</button>
              {t.assignedTo && <button className="link small" onClick={() => patch({ assignedTo: null })}>Unassign</button>}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
