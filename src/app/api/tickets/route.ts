import { readJson, route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";
import { createTicketSchema, ticketListQuerySchema } from "@/lib/validation";

// Authors get their own tickets; admins get the whole queue (filterable).
export const GET = route({}, async ({ req, session }) => {
  const q = ticketListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const { include, ...filter } = q;
  const { items, total } = await tickets.listTickets(session, filter, include === "messages");
  return Response.json({ data: items, meta: { total, limit: filter.limit, offset: filter.offset } });
});

export const POST = route({ roles: ["author"] }, async ({ req, session }) => {
  const body = createTicketSchema.parse(await readJson(req));
  const ticket = await tickets.createTicket(session, body);
  return Response.json({ data: ticket }, { status: 201 });
});
