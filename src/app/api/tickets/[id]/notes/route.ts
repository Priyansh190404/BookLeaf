import { readJson, route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";
import { createNoteSchema } from "@/lib/validation";

// Internal note: admin-only, never returned to authors.
export const POST = route<{ id: string }>({ roles: ["admin"] }, async ({ req, session, params }) => {
  const { body } = createNoteSchema.parse(await readJson(req));
  return Response.json({ data: await tickets.addInternalNote(session, params.id, body) }, { status: 201 });
});
