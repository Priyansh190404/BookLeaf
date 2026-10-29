import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../db";
import type { AdminTicket, AuthorTicket, Message } from "../types";
import type { Category, Priority, Status } from "../validation";

// ---------- row types & mappers ----------

interface TicketRow {
  id: string; ticket_number: number; author_id: string; book_id: string | null;
  subject: string; description: string; status: Status;
  category: Category | null; category_source: AdminTicket["categorySource"];
  priority: Priority; priority_source: AdminTicket["prioritySource"]; ai_rationale: string | null;
  assigned_to: string | null; ai_draft: string | null; ai_draft_msg_count: number | null;
  created_at: Date; updated_at: Date;
  author_name: string; author_email: string; book_title: string | null;
  assigned_name: string | null; public_reply_count: string; public_msg_count: string;
}

interface MessageRow {
  id: string; sender_role: "author" | "admin"; sender_name: string; body: string;
  is_internal: boolean; ai_assisted: boolean; created_at: Date;
}

const SELECT_TICKET = `
  SELECT t.*, a.name AS author_name, a.email AS author_email, b.title AS book_title,
         u.name AS assigned_name,
         (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id=t.id AND NOT m.is_internal AND m.sender_role='admin') AS public_reply_count,
         (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id=t.id AND NOT m.is_internal) AS public_msg_count
  FROM tickets t
  JOIN authors a ON a.id = t.author_id
  LEFT JOIN books b ON b.id = t.book_id
  LEFT JOIN users u ON u.id = t.assigned_to`;

const iso = (d: Date) => d.toISOString();

export const toAuthorTicket = (r: TicketRow): AuthorTicket => ({
  id: r.id,
  ticketNumber: r.ticket_number,
  subject: r.subject,
  description: r.description,
  status: r.status,
  bookId: r.book_id,
  bookTitle: r.book_title,
  attachments: [],
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const toAdminTicket = (r: TicketRow): AdminTicket => ({
  ...toAuthorTicket(r),
  authorId: r.author_id,
  authorName: r.author_name,
  authorEmail: r.author_email,
  category: r.category,
  categorySource: r.category_source,
  priority: r.priority,
  prioritySource: r.priority_source,
  aiRationale: r.ai_rationale,
  assignedTo: r.assigned_to,
  assignedToName: r.assigned_name,
  aiDraft: r.ai_draft,
  // Draft is stale if the public thread has grown since it was generated.
  aiDraftStale: r.ai_draft !== null && r.ai_draft_msg_count !== Number(r.public_msg_count),
  publicReplyCount: Number(r.public_reply_count),
});

const toMessage = (m: MessageRow): Message => ({
  id: m.id,
  senderRole: m.sender_role,
  senderName: m.sender_name,
  body: m.body,
  isInternal: m.is_internal,
  aiAssisted: m.ai_assisted,
  createdAt: iso(m.created_at),
});

// ---------- queries ----------

export interface TicketFilter {
  authorId?: string;            // forced for authors (row-level isolation)
  status?: Status;
  category?: Category;
  priority?: Priority;
  assigned?: "me" | "unassigned";
  assignedUserId?: string;      // resolves "me"
  from?: string;
  to?: string;
  q?: string;
  sort: "urgency" | "newest" | "oldest";
  limit: number;
  offset: number;
}

// ticket_number is the final tiebreaker so pagination order is stable.
const ORDER: Record<TicketFilter["sort"], string> = {
  // Unresolved first; within those, most urgent first, then oldest first.
  urgency: `(t.status IN ('Resolved','Closed')) ASC,
            CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END ASC,
            t.created_at ASC, t.ticket_number ASC`,
  newest: "t.created_at DESC, t.ticket_number DESC",
  oldest: "t.created_at ASC, t.ticket_number ASC",
};

function buildWhere(f: TicketFilter): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };

  if (f.authorId) add("t.author_id = ?", f.authorId);
  if (f.status) add("t.status = ?", f.status);
  if (f.category) add("t.category = ?", f.category);
  if (f.priority) add("t.priority = ?", f.priority);
  if (f.assigned === "me" && f.assignedUserId) add("t.assigned_to = ?", f.assignedUserId);
  if (f.assigned === "unassigned") where.push("t.assigned_to IS NULL");
  if (f.from) add("t.created_at >= ?::date", f.from);
  if (f.to) add("t.created_at < (?::date + 1)", f.to);
  if (f.q) {
    params.push(`%${f.q.replace(/[%_]/g, "\\$&")}%`);
    const p = `$${params.length}`;
    where.push(`(t.subject ILIKE ${p} OR t.description ILIKE ${p} OR a.name ILIKE ${p} OR t.ticket_number::text ILIKE ${p})`);
  }
  return { sql: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export async function listTickets(f: TicketFilter): Promise<TicketRow[]> {
  const { sql, params } = buildWhere(f);
  params.push(f.limit, f.offset);
  return query<TicketRow>(
    `${SELECT_TICKET} ${sql} ORDER BY ${ORDER[f.sort]} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

/** Total rows matching the filter (ignores limit/offset) for the pager. */
export async function countTickets(f: TicketFilter): Promise<number> {
  const { sql, params } = buildWhere(f);
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM tickets t JOIN authors a ON a.id = t.author_id ${sql}`, params);
  return Number(row?.n ?? 0);
}

/** Queue-wide headline numbers, computed over ALL tickets (not just the visible page). */
export async function ticketSummary(slaHours: Record<Priority, number>) {
  const row = await queryOne<Record<"unresolved" | "critical" | "unassigned" | "overdue", string>>(
    `SELECT
       count(*) FILTER (WHERE status IN ('Open','In Progress')) AS unresolved,
       count(*) FILTER (WHERE status IN ('Open','In Progress') AND priority = 'Critical') AS critical,
       count(*) FILTER (WHERE status IN ('Open','In Progress') AND assigned_to IS NULL) AS unassigned,
       count(*) FILTER (WHERE status IN ('Open','In Progress') AND created_at < now() - (
         CASE priority WHEN 'Critical' THEN $1::int WHEN 'High' THEN $2::int WHEN 'Medium' THEN $3::int ELSE $4::int END
       ) * interval '1 hour') AS overdue
     FROM tickets`,
    [slaHours.Critical, slaHours.High, slaHours.Medium, slaHours.Low],
  );
  return {
    unresolved: Number(row?.unresolved ?? 0), critical: Number(row?.critical ?? 0),
    unassigned: Number(row?.unassigned ?? 0), overdue: Number(row?.overdue ?? 0),
  };
}

export const getTicketRow = (id: string) => queryOne<TicketRow>(`${SELECT_TICKET} WHERE t.id = $1`, [id]);

export async function listMessages(ticketId: string, includeInternal: boolean): Promise<Message[]> {
  const rows = await query<MessageRow>(
    `SELECT m.id, m.sender_role, u.name AS sender_name, m.body, m.is_internal, m.ai_assisted, m.created_at
     FROM ticket_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.ticket_id = $1 ${includeInternal ? "" : "AND NOT m.is_internal"}
     ORDER BY m.created_at ASC`,
    [ticketId],
  );
  return rows.map(toMessage);
}

/** Batch-load messages for many tickets in one query (avoids N+1 on list views). */
export async function listMessagesForTickets(ids: string[], includeInternal: boolean): Promise<Map<string, Message[]>> {
  const out = new Map<string, Message[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const rows = await query<MessageRow & { ticket_id: string }>(
    `SELECT m.ticket_id, m.id, m.sender_role, u.name AS sender_name, m.body, m.is_internal, m.ai_assisted, m.created_at
     FROM ticket_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.ticket_id = ANY($1::uuid[]) ${includeInternal ? "" : "AND NOT m.is_internal"}
     ORDER BY m.created_at ASC`,
    [ids],
  );
  for (const r of rows) out.get(r.ticket_id)!.push(toMessage(r));
  return out;
}

/** Last N public messages, newest last: bounded context for the drafting prompt. */
export async function listRecentPublicMessages(ticketId: string, limit: number): Promise<Message[]> {
  const rows = await query<MessageRow>(
    `SELECT * FROM (
       SELECT m.id, m.sender_role, u.name AS sender_name, m.body, m.is_internal, m.ai_assisted, m.created_at
       FROM ticket_messages m JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1 AND NOT m.is_internal
       ORDER BY m.created_at DESC LIMIT $2
     ) x ORDER BY created_at ASC`,
    [ticketId, limit],
  );
  return rows.map(toMessage);
}

// ---------- writes ----------

export async function insertTicket(input: {
  authorId: string; bookId: string | null; subject: string; description: string;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO tickets (author_id, book_id, subject, description)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.authorId, input.bookId, input.subject, input.description],
  );
  return row!.id;
}

/**
 * Add a message and apply the status side-effects atomically:
 *  - first admin public reply on an Open ticket -> In Progress
 *  - author reply on a Resolved/Closed ticket -> reopened as Open
 */
export async function insertMessage(input: {
  ticketId: string; senderId: string; senderRole: "author" | "admin"; body: string;
  isInternal: boolean; aiAssisted: boolean;
}): Promise<void> {
  await withTransaction(async (c: PoolClient) => {
    await c.query(
      `INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, body, is_internal, ai_assisted)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.ticketId, input.senderId, input.senderRole, input.body, input.isInternal, input.aiAssisted],
    );
    if (input.isInternal) {
      await c.query(`UPDATE tickets SET updated_at = now() WHERE id=$1`, [input.ticketId]);
    } else if (input.senderRole === "admin") {
      await c.query(
        `UPDATE tickets SET updated_at = now(),
           status = CASE WHEN status = 'Open' THEN 'In Progress'::ticket_status ELSE status END
         WHERE id=$1`,
        [input.ticketId],
      );
    } else {
      await c.query(
        `UPDATE tickets SET updated_at = now(), resolved_at = NULL,
           status = CASE WHEN status IN ('Resolved','Closed') THEN 'Open'::ticket_status ELSE status END
         WHERE id=$1`,
        [input.ticketId],
      );
    }
  });
}

export interface TicketPatch {
  status?: Status;
  category?: Category;
  priority?: Priority;
  assignedTo?: string | null;
}

export async function patchTicket(id: string, p: TicketPatch): Promise<void> {
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [id];
  const add = (sql: string, v: unknown) => { params.push(v); sets.push(sql.replace("?", `$${params.length}`)); };

  if (p.status) {
    add("status = ?", p.status);
    sets.push(p.status === "Resolved" || p.status === "Closed" ? "resolved_at = COALESCE(resolved_at, now())" : "resolved_at = NULL");
  }
  if (p.category) { add("category = ?", p.category); sets.push("category_source = 'admin'"); }
  if (p.priority) { add("priority = ?", p.priority); sets.push("priority_source = 'admin'"); }
  if (p.assignedTo !== undefined) add("assigned_to = ?", p.assignedTo);

  await query(`UPDATE tickets SET ${sets.join(", ")} WHERE id = $1`, params);
}

/** Written by the AI triage step. Never overwrites a value an admin has set. */
export async function saveTriage(id: string, t: {
  category: Category; priority: Priority; source: "ai" | "fallback"; rationale: string | null;
}): Promise<void> {
  await query(
    `UPDATE tickets SET
       category        = CASE WHEN category_source = 'admin' THEN category ELSE $2::ticket_category END,
       category_source = CASE WHEN category_source = 'admin' THEN category_source ELSE $4::triage_source END,
       priority        = CASE WHEN priority_source = 'admin' THEN priority ELSE $3::ticket_priority END,
       priority_source = CASE WHEN priority_source = 'admin' THEN priority_source ELSE $4::triage_source END,
       ai_rationale    = $5
     WHERE id = $1`,
    [id, t.category, t.priority, t.source, t.rationale],
  );
}

export async function saveDraft(id: string, draft: string, publicMsgCount: number): Promise<void> {
  await query(
    `UPDATE tickets SET ai_draft=$2, ai_draft_at=now(), ai_draft_msg_count=$3 WHERE id=$1`,
    [id, draft, publicMsgCount],
  );
}

/** Bump updated_at so pollers and sorting notice new activity (e.g. an attachment). */
export const touchTicket = (id: string) => query(`UPDATE tickets SET updated_at = now() WHERE id=$1`, [id]);
