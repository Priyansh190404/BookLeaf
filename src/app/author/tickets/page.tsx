"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Attachments from "@/components/Attachments";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { StatusBadge } from "@/components/Badges";
import Thread, { when } from "@/components/Thread";
import { api } from "@/lib/client/api";
import { usePolling } from "@/lib/client/usePolling";
import type { AuthorTicket } from "@/lib/types";

function TicketCard({ t, unread, onOpen, onReplied }: { t: AuthorTicket; unread: boolean; onOpen: () => void; onReplied: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const msgs = t.messages ?? [];
  const adminMsgs = msgs.filter((m) => m.senderRole === "admin");
  const adminReplies = adminMsgs.length;
  const latest = adminMsgs[adminMsgs.length - 1];

  // A new reply opens the card so the author sees it immediately, with no click and no refresh.
  useEffect(() => { if (unread) setOpen(true); }, [unread]);

  async function send() {
    setBusy(true); setErr("");
    try {
      await api(`/api/tickets/${t.id}/messages`, { method: "POST", json: { body: reply } });
      setReply(""); onReplied(); toast("Reply sent");
    } catch (e) { setErr((e as Error).message); toast((e as Error).message, "error"); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="row between" style={{ cursor: "pointer" }} onClick={() => { setOpen(!open); if (!open) onOpen(); }}>
        <div>
          <b>{unread && <span className="dot-new" title="New reply" />}#{t.ticketNumber} · {t.subject}</b>
          <div className="small muted">{t.bookTitle ?? "General / Account Level"} · opened {when(t.createdAt)}</div>
        </div>
        <div className="row">
          {adminReplies > 0 && <span className="small muted">{adminReplies} repl{adminReplies > 1 ? "ies" : "y"} from BookLeaf</span>}
          <StatusBadge status={t.status} />
        </div>
      </div>
      {!open && latest && (
        <div className="small muted" style={{ marginTop: 8, cursor: "pointer" }} onClick={() => { setOpen(true); onOpen(); }}>
          <b>BookLeaf:</b> {latest.body.length > 140 ? latest.body.slice(0, 140) + "…" : latest.body}
        </div>
      )}
      {open && (
        <div style={{ marginTop: 12 }}>
          <div className="msg"><div className="meta"><b>Your query</b><span>{when(t.createdAt)}</span></div>{t.description}</div>
          <Attachments ticketId={t.id} items={t.attachments} />
          <Thread messages={msgs} />
          {adminReplies === 0 && t.status === "Open" && <p className="small muted">Our team has your query and will respond soon. This page updates automatically.</p>}
          {t.status === "Closed" ? (
            <p className="small muted">This ticket is closed. <Link href="/author/tickets/new">Open a new query</Link> if you need more help.</p>
          ) : (
            <>
              <label htmlFor={`r${t.id}`}>{t.status === "Resolved" ? "Not resolved? Reply to reopen" : "Add a reply"}</label>
              <textarea id={`r${t.id}`} style={{ minHeight: 70 }} value={reply} onChange={(e) => setReply(e.target.value)} />
              {err && <div className="err">{err}</div>}
              <p><button disabled={busy || !reply.trim()} onClick={send}>{busy ? "Sending…" : "Send reply"}</button></p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function List() {
  const params = useSearchParams();
  const submitted = params.get("submitted");
  const uploadFailed = params.get("uploadFailed");
  const toast = useToast();
  // Polling every 5s: admin responses appear without a refresh.
  const { data: tickets, error, loading, refresh } = usePolling<AuthorTicket[]>("/api/tickets?include=messages&sort=newest&limit=100", 5000);

  // In-app notification: when BookLeaf replies, toast once and mark the ticket until it's opened.
  const seenReplies = useRef<Map<string, number> | null>(null);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!tickets) return;
    const counts = new Map(tickets.map((t) => [t.id, (t.messages ?? []).filter((m) => m.senderRole === "admin").length]));
    if (seenReplies.current) {
      const fresh = tickets.filter((t) => (counts.get(t.id) ?? 0) > (seenReplies.current!.get(t.id) ?? 0));
      if (fresh.length) {
        toast(fresh.length === 1 ? `New reply from BookLeaf on #${fresh[0].ticketNumber}` : `${fresh.length} tickets have new replies`, "info");
        setUnread((u) => new Set([...u, ...fresh.map((t) => t.id)]));
      }
    }
    seenReplies.current = counts;
  }, [tickets, toast]);

  return (
    <>
      <div className="row between">
        <div><h1>My Tickets</h1><p className="muted small">Updates automatically. No need to refresh.</p></div>
        <Link href="/author/tickets/new"><button>New query</button></Link>
      </div>
      {submitted && <p className="okmsg">✓ Your query has been submitted. We'll respond within 48 hours.</p>}
      {uploadFailed && <div className="banner">Your query was submitted, but these files couldn't be uploaded: {uploadFailed}. You can mention them in a reply.</div>}
      {loading && <Skeleton rows={3} height={72} />}
      {error && <p className="err">{error}</p>}
      {tickets && tickets.length === 0 && (
        <div className="card empty">You haven't raised any queries yet.<br /><Link href="/author/tickets/new">Submit your first query</Link></div>
      )}
      {tickets?.map((t) => (
        <TicketCard key={t.id} t={t} unread={unread.has(t.id)} onReplied={refresh}
          onOpen={() => setUnread((u) => { const n = new Set(u); n.delete(t.id); return n; })} />
      ))}
    </>
  );
}

export default function MyTickets() { return <Suspense><List /></Suspense>; }
