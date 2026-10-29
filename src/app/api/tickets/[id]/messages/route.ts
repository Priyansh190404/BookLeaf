import { readJson, route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";
import { createMessageSchema } from "@/lib/validation";

// Public reply: author follow-up or admin response (visible to the author).
export const POST = route<{ id: string }>({}, async ({ req, session, params }) => {
  const body = createMessageSchema.parse(await readJson(req));
  return Response.json({ data: await tickets.postMessage(session, params.id, body) }, { status: 201 });
});
