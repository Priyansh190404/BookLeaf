import { readJson, route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";
import { updateTicketSchema } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>({}, ({ session, params }) => tickets.getTicket(session, params.id));

export const PATCH = route<P>({ roles: ["admin"] }, async ({ req, session, params }) =>
  tickets.updateTicket(session, params.id, updateTicketSchema.parse(await readJson(req))),
);
