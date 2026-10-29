/**
 * Ticket use-cases. Routes stay thin (parse -> call service -> respond); all authorization
 * rules, lifecycle rules and AI orchestration live here.
 */
import { AiUnavailableError } from "../ai/client";
import { buildFacts, triageBookContext } from "../ai/context";
import { generateDraft } from "../ai/draft";
import { triageTicket } from "../ai/triage";
import type { Session } from "../auth/session";
import { MAX_FILES_PER_TICKET, MAX_FILE_BYTES, ALLOWED_DESCRIPTION, sanitizeFilename, sniffMime } from "../attachments";
import { ApiError, badRequest, conflict, notFound } from "../http/errors";
import * as attachmentRepo from "../repositories/attachments";
import { SLA_HOURS } from "../sla";
import { getBookRow, listBookRowsByAuthor } from "../repositories/books";
import * as repo from "../repositories/tickets";
import type { AdminTicket, AuthorTicket, Message } from "../types";
import type { Category, Priority, Status } from "../validation";

const isAdmin = (s: Session) => s.role === "admin";

/** Authors may only touch their own tickets. We 404 (not 403) so ticket ids can't be probed. */
async function loadAccessible(session: Session, id: string) {
  const row = await repo.getTicketRow(id);
  if (!row || (!isAdmin(session) && row.author_id !== session.authorId)) throw notFound("Ticket");
  return row;
}

// ---------- create ----------

export async function createTicket(
  session: Session,
  input: { bookId?: string | null; subject: string; description: string },
): Promise<AuthorTicket> {
  const authorId = session.authorId!;
  const bookId = input.bookId || null;

  // The selected book must belong to this author.
  let bookContext: string | null = null;
  if (bookId) {
    const book = await getBookRow(bookId);
    if (!book || book.author_id !== authorId) throw badRequest("Selected book was not found on your account", [{ field: "bookId", message: "Unknown book" }]);
    bookContext = triageBookContext(book);
  }

  // 1. The ticket is persisted FIRST. Nothing the AI does can prevent creation.
  const id = await repo.insertTicket({ authorId, bookId, subject: input.subject, description: input.description });

  // 2. Triage is best-effort. triageTicket() already degrades to keyword rules when the AI is down;
  //    the catch below is a last guard so an unexpected bug here can never lose a ticket.
  try {
    const t = await triageTicket({ subject: input.subject, description: input.description, bookContext });
    await repo.saveTriage(id, { category: t.category, priority: t.priority, source: t.source, rationale: t.rationale });
  } catch (err) {
    console.error("[tickets] triage step failed; ticket kept untriaged", err);
  }

  const row = await repo.getTicketRow(id);
  return repo.toAuthorTicket(row!);
}

// ---------- read ----------

/** Attach file metadata (never bytes) to a set of ticket DTOs with one query. */
async function withAttachments<T extends { id: string; attachments: AuthorTicket["attachments"] }>(tickets: T[]): Promise<T[]> {
  const byTicket = await attachmentRepo.listAttachmentsForTickets(tickets.map((t) => t.id));
  return tickets.map((t) => ({ ...t, attachments: byTicket.get(t.id) ?? [] }));
}

export async function listTickets(
  session: Session,
  filter: Omit<repo.TicketFilter, "authorId" | "assignedUserId">,
  includeMessages = false,
): Promise<{ items: (AuthorTicket | AdminTicket)[]; total: number }> {
  const scoped: repo.TicketFilter = {
    ...filter,
    authorId: isAdmin(session) ? undefined : session.authorId!, // row-level isolation
    assignedUserId: session.userId,
  };
  const [rows, total] = await Promise.all([repo.listTickets(scoped), repo.countTickets(scoped)]);
  let items: (AuthorTicket | AdminTicket)[] = await withAttachments(isAdmin(session) ? rows.map(repo.toAdminTicket) : rows.map(repo.toAuthorTicket));
  if (includeMessages) {
    const byTicket = await repo.listMessagesForTickets(items.map((t) => t.id), isAdmin(session));
    items = items.map((t) => ({ ...t, messages: byTicket.get(t.id) ?? [] }));
  }
  return { items, total };
}

export const summary = () => repo.ticketSummary(SLA_HOURS);

export async function getTicket(session: Session, id: string): Promise<(AuthorTicket | AdminTicket) & { messages: Message[] }> {
  const row = await loadAccessible(session, id);
  const messages = await repo.listMessages(id, isAdmin(session)); // internal notes only for admins
  const [ticket] = await withAttachments([isAdmin(session) ? repo.toAdminTicket(row) : repo.toAuthorTicket(row)]);
  return { ...ticket, messages };
}

// ---------- attachments ----------

/** Only the ticket's own author uploads. Type is detected from content, not from the client's claim. */
export async function addAttachment(session: Session, ticketId: string, file: { name: string; bytes: Buffer }) {
  const row = await loadAccessible(session, ticketId);
  if (session.role !== "author") throw new ApiError(403, "FORBIDDEN", "Only the ticket's author can attach files");
  if (row.status === "Closed") throw conflict("This ticket is closed. Please open a new ticket.");
  if (file.bytes.length === 0) throw badRequest("The file is empty");
  if (file.bytes.length > MAX_FILE_BYTES) throw new ApiError(413, "FILE_TOO_LARGE", `Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller`);
  if ((await attachmentRepo.countAttachments(ticketId)) >= MAX_FILES_PER_TICKET) {
    throw conflict(`A ticket can have at most ${MAX_FILES_PER_TICKET} attachments`);
  }
  const mime = sniffMime(file.bytes);
  if (!mime) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", `Unsupported file type. Allowed: ${ALLOWED_DESCRIPTION}`);

  const meta = await attachmentRepo.insertAttachment({
    ticketId, uploadedBy: session.userId, filename: sanitizeFilename(file.name), mimeType: mime, data: file.bytes,
  });
  await repo.touchTicket(ticketId);
  return meta;
}

export async function getAttachmentFile(session: Session, ticketId: string, attachmentId: string) {
  await loadAccessible(session, ticketId); // same ownership rule as the ticket itself
  const file = await attachmentRepo.getAttachmentFile(ticketId, attachmentId);
  if (!file) throw notFound("Attachment");
  return file;
}

// ---------- conversation ----------

export async function postMessage(session: Session, id: string, input: { body: string; aiAssisted: boolean }) {
  const row = await loadAccessible(session, id);
  if (!isAdmin(session) && row.status === "Closed") {
    throw conflict("This ticket is closed. Please open a new ticket for further questions.");
  }
  await repo.insertMessage({
    ticketId: id, senderId: session.userId, senderRole: session.role,
    body: input.body, isInternal: false, aiAssisted: isAdmin(session) && input.aiAssisted,
  });
  return getTicket(session, id);
}

export async function addInternalNote(session: Session, id: string, body: string) {
  await loadAccessible(session, id);
  await repo.insertMessage({ ticketId: id, senderId: session.userId, senderRole: "admin", body, isInternal: true, aiAssisted: false });
  return getTicket(session, id);
}

// ---------- admin management ----------

export async function updateTicket(
  session: Session, id: string,
  patch: { status?: Status; category?: Category; priority?: Priority; assignedTo?: "me" | null },
) {
  await loadAccessible(session, id);
  await repo.patchTicket(id, {
    status: patch.status, category: patch.category, priority: patch.priority,
    assignedTo: patch.assignedTo === undefined ? undefined : patch.assignedTo === "me" ? session.userId : null,
  });
  return getTicket(session, id);
}

// ---------- AI actions (admin) ----------

export interface DraftResult {
  draft: string | null;
  aiAvailable: boolean;
  reason?: string;
  stale: boolean;
}

/**
 * Returns the cached draft when fresh; otherwise generates (and caches) a new one.
 * If the AI is unavailable we return aiAvailable=false (HTTP 200): the admin writes manually.
 */
export async function getOrCreateDraft(session: Session, id: string, regenerate: boolean): Promise<DraftResult> {
  const row = await loadAccessible(session, id);
  const admin = repo.toAdminTicket(row);
  if (admin.aiDraft && !admin.aiDraftStale && !regenerate) {
    return { draft: admin.aiDraft, aiAvailable: true, stale: false };
  }

  try {
    const [book, allBooks, thread] = await Promise.all([
      row.book_id ? getBookRow(row.book_id) : Promise.resolve(null),
      listBookRowsByAuthor(row.author_id),
      repo.listRecentPublicMessages(id, 6),
    ]);
    const draft = await generateDraft({
      category: admin.category ?? "General Inquiry",
      subject: row.subject,
      description: row.description,
      facts: buildFacts({ authorName: row.author_name, book, allBooks }),
      thread,
      authorFirstName: row.author_name.split(" ")[0],
    });
    await repo.saveDraft(id, draft, Number(row.public_msg_count));
    return { draft, aiAvailable: true, stale: false };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // Keep any older draft visible (flagged stale) rather than showing nothing.
      return { draft: admin.aiDraft, aiAvailable: false, reason: err.reason, stale: admin.aiDraft !== null };
    }
    throw err;
  }
}

/** Re-run classification (e.g. after the AI was down when the ticket arrived). Admin overrides are preserved. */
export async function retriage(session: Session, id: string) {
  const row = await loadAccessible(session, id);
  const t = await triageTicket({ subject: row.subject, description: row.description, bookContext: row.book_title ? `"${row.book_title}"` : null });
  await repo.saveTriage(id, { category: t.category, priority: t.priority, source: t.source, rationale: t.rationale });
  return { aiAvailable: t.source === "ai", ticket: await getTicket(session, id) };
}

