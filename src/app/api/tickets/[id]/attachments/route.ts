import { MAX_FILE_BYTES } from "@/lib/attachments";
import { ApiError, badRequest } from "@/lib/http/errors";
import { route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";

// multipart/form-data with a single `file` field. One request per file so progress/failures are per file.
export const POST = route<{ id: string }>({ roles: ["author"] }, async ({ req, session, params }) => {
  // Reject oversized bodies before buffering them.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) throw new ApiError(413, "FILE_TOO_LARGE", "Files must be 5 MB or smaller");

  const form = await req.formData().catch(() => { throw badRequest("Expected multipart/form-data with a 'file' field"); });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Expected a 'file' field containing a file");

  const meta = await tickets.addAttachment(session, params.id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
  return Response.json({ data: meta }, { status: 201 });
});
