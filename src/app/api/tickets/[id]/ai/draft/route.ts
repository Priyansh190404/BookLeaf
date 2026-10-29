import { z } from "zod";
import { route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";

const bodySchema = z.object({ regenerate: z.boolean().optional().default(false) });

/** Get (or force-regenerate) the AI draft. Returns 200 with aiAvailable=false if the AI is down. */
export const POST = route<{ id: string }>({ roles: ["admin"] }, async ({ req, session, params }) => {
  const raw = await req.json().catch(() => ({}));
  const { regenerate } = bodySchema.parse(raw);
  return tickets.getOrCreateDraft(session, params.id, regenerate);
});
