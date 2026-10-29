import { query, queryOne } from "../db";
import type { AttachmentMeta } from "../types";

interface MetaRow { id: string; ticket_id: string; filename: string; mime_type: string; size_bytes: number; created_at: Date }

const toMeta = (r: MetaRow): AttachmentMeta => ({
  id: r.id, filename: r.filename, mimeType: r.mime_type, sizeBytes: r.size_bytes, createdAt: r.created_at.toISOString(),
});

export async function insertAttachment(input: {
  ticketId: string; uploadedBy: string; filename: string; mimeType: string; data: Buffer;
}): Promise<AttachmentMeta> {
  const row = await queryOne<MetaRow>(
    `INSERT INTO ticket_attachments (ticket_id, uploaded_by, filename, mime_type, size_bytes, data)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, ticket_id, filename, mime_type, size_bytes, created_at`,
    [input.ticketId, input.uploadedBy, input.filename, input.mimeType, input.data.length, input.data],
  );
  return toMeta(row!);
}

export async function countAttachments(ticketId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(`SELECT count(*) AS n FROM ticket_attachments WHERE ticket_id=$1`, [ticketId]);
  return Number(row?.n ?? 0);
}

/** Metadata only (never the bytes), batched to avoid N+1 on list views. */
export async function listAttachmentsForTickets(ids: string[]): Promise<Map<string, AttachmentMeta[]>> {
  const out = new Map<string, AttachmentMeta[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const rows = await query<MetaRow>(
    `SELECT id, ticket_id, filename, mime_type, size_bytes, created_at
     FROM ticket_attachments WHERE ticket_id = ANY($1::uuid[]) ORDER BY created_at`,
    [ids],
  );
  for (const r of rows) out.get(r.ticket_id)!.push(toMeta(r));
  return out;
}

export const getAttachmentFile = (ticketId: string, attachmentId: string) =>
  queryOne<{ filename: string; mime_type: string; data: Buffer }>(
    `SELECT filename, mime_type, data FROM ticket_attachments WHERE id=$1 AND ticket_id=$2`,
    [attachmentId, ticketId],
  );
