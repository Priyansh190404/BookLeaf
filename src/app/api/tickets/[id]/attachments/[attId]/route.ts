import { isInlineMime } from "@/lib/attachments";
import { route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";

// Download/preview. Same access rule as the ticket: owner author or admin; others get 404.
export const GET = route<{ id: string; attId: string }>({}, async ({ session, params }) => {
  const file = await tickets.getAttachmentFile(session, params.id, params.attId);
  const disposition = isInlineMime(file.mime_type) ? "inline" : "attachment";
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime_type,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",          // never let a browser reinterpret the bytes
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
