import { z } from "zod";

export const CATEGORIES = [
  "Royalty & Payments",
  "ISBN & Metadata Issues",
  "Printing & Quality",
  "Distribution & Availability",
  "Book Status & Production Updates",
  "General Inquiry",
] as const;
export const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export const STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(200),
});

export const createTicketSchema = z.object({
  bookId: z.string().trim().min(1).max(20).nullable().optional(), // null/omitted = General / Account Level
  subject: trimmed(5, 150, "Subject"),
  description: trimmed(20, 5000, "Description"),
});

export const createMessageSchema = z.object({
  body: trimmed(1, 5000, "Message"),
  aiAssisted: z.boolean().optional().default(false),
});

export const createNoteSchema = z.object({ body: trimmed(1, 5000, "Note") });

export const updateTicketSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    // "me" assigns to the caller, null unassigns.
    assignedTo: z.union([z.literal("me"), z.null()]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

export const ticketListQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigned: z.enum(["me", "unassigned"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(100).optional(),
  // "urgency" = open-first, then priority, then oldest-first. "newest" = plain recency.
  sort: z.enum(["urgency", "newest", "oldest"]).optional().default("urgency"),
  include: z.literal("messages").optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
