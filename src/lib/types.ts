// DTOs shared by API responses and the React client (import with `import type`).
import type { Category, Priority, Status } from "./validation";

export interface Book {
  id: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publicationDate: string | null;
  status: string;
  mrp: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
  isPublished: boolean;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Message {
  id: string;
  senderRole: "author" | "admin";
  senderName: string;
  body: string;
  isInternal: boolean;
  aiAssisted: boolean;
  createdAt: string;
}

/** What an author sees: no triage metadata, no internal notes. */
export interface AuthorTicket {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  status: Status;
  bookId: string | null;
  bookTitle: string | null;
  attachments: AttachmentMeta[];
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

/** What the ops team sees. */
export interface AdminTicket extends AuthorTicket {
  authorId: string;
  authorName: string;
  authorEmail: string;
  category: Category | null;
  categorySource: "ai" | "fallback" | "admin" | "pending";
  priority: Priority;
  prioritySource: "ai" | "fallback" | "admin" | "pending";
  aiRationale: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  aiDraft: string | null;
  aiDraftStale: boolean;
  publicReplyCount: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface TicketSummary {
  unresolved: number;
  critical: number;
  overdue: number;
  unassigned: number;
}
