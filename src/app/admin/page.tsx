"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PriorityBadge, SourceTag, StatusBadge } from "@/components/Badges";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { apiList } from "@/lib/client/api";
import { usePolling, usePollingFn } from "@/lib/client/usePolling";
import { formatAge, isOverdue } from "@/lib/sla";
import type { AdminTicket, TicketSummary } from "@/lib/types";
import { CATEGORIES, PRIORITIES, STATUSES } from "@/lib/validation";

const PAGE_SIZE = 25;
const EMPTY = { status: "", category: "", priority: "", assigned: "", from: "", to: "", q: "", sort: "urgency" };

export default function Queue() {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const change = (patch: Partial<typeof EMPTY>) => { setF({ ...f, ...patch }); setPage(0); };
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => change({ [k]: e.target.value });

  const url = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v));
    return `/api/tickets?${p}`;
  }, [f, page]);
  const { data, error, loading } = usePollingFn(url, () => apiList<AdminTicket>(url), 8000);
  const { data: summary } = usePolling<TicketSummary>("/api/tickets/summary", 8000);

  const tickets = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Toast when a ticket we haven't seen arrives (first page, default view only, so filters/paging don't trigger it).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.items.map((t) => t.id));
    if (page === 0 && f.sort === "urgency" && !f.q && !f.status && !f.category && !f.priority && !f.assigned && !f.from && !f.to) {
      if (seen.current) {
        const fresh = data.items.filter((t) => !seen.current!.has(t.id));
        if (fresh.length) toast(fresh.length === 1 ? `New ticket #${fresh[0].ticketNumber} from ${fresh[0].authorName}` : `${fresh.length} new tickets arrived`, "info");
      }
      seen.current = ids;
    } else {
      seen.current = null;
    }
  }, [data, page, f, toast]);

  return (
    <>
      <h1>Ticket Queue</h1>
      <div className="chips">
        <span className="chip"><b>{summary?.unresolved ?? "–"}</b>unresolved</span>
        <span className="chip"><b>{summary?.critical ?? "–"}</b>critical</span>
        <span className="chip" style={summary?.overdue ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}}><b>{summary?.overdue ?? "–"}</b>overdue vs. target</span>
        <span className="chip"><b>{summary?.unassigned ?? "–"}</b>unassigned</span>
      </div>

      <div className="card row filters">
        <input placeholder="Search subject, author, #…" value={f.q} onChange={set("q")} />
        <select value={f.status} onChange={set("status")}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.category} onChange={set("category")}><option value="">All categories</option>{CATEGORIES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.priority} onChange={set("priority")}><option value="">All priorities</option>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={f.assigned} onChange={set("assigned")}><option value="">Anyone</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select>
        <label style={{ margin: 0, fontWeight: 400 }}>From <input type="date" value={f.from} onChange={set("from")} /></label>
        <label style={{ margin: 0, fontWeight: 400 }}>To <input type="date" value={f.to} onChange={set("to")} /></label>
        <select value={f.sort} onChange={set("sort")}>
          <option value="urgency">Most urgent first</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option>
        </select>
        <button className="secondary" onClick={() => { setF(EMPTY); setPage(0); }}>Reset</button>
      </div>

      <div className="card scroll">
        {loading && <div style={{ padding: 20 }}><Skeleton rows={6} height={40} /></div>}
        {error && <p className="err">{error}</p>}
        {data && tickets.length === 0 && <div className="empty">No tickets match these filters.</div>}
        {tickets.length > 0 && (
          <table>
            <thead><tr><th>#</th><th>Priority</th><th>Subject</th><th>Author</th><th>Category</th><th>Status</th><th>Assignee</th><th>Waiting</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className={`click ${isOverdue(t) ? "overdue" : ""}`} onClick={() => router.push(`/admin/tickets/${t.id}`)}>
                  <td>{t.ticketNumber}</td>
                  <td><PriorityBadge priority={t.priority} /><SourceTag source={t.prioritySource} /></td>
                  <td><b>{t.subject}</b>{t.attachments.length > 0 && <span title={`${t.attachments.length} attachment(s)`}> 📎{t.attachments.length}</span>}<div className="small muted">{t.bookTitle ?? "General / Account"}</div></td>
                  <td>{t.authorName}</td>
                  <td>{t.category ?? <span className="muted">Unclassified</span>}<SourceTag source={t.categorySource} /></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.assignedToName ?? <span className="muted">—</span>}</td>
                  <td style={isOverdue(t) ? { color: "var(--danger)", fontWeight: 600 } : {}}>{t.status === "Resolved" || t.status === "Closed" ? "—" : formatAge(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > 0 && (
          <div className="pager">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
            <span className="row">
              <button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
              <span>Page {page + 1} / {pages}</span>
              <button className="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button>
            </span>
          </div>
        )}
      </div>
      <p className="small muted">Red edge = open longer than the target for its priority (Critical 8h · High 24h · Medium 3d · Low 7d). “auto*” = AI was unavailable; keyword rules were used, so please review.</p>
    </>
  );
}
