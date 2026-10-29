import { route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";

/** Re-run AI classification + priority (admin overrides are preserved). */
export const POST = route<{ id: string }>({ roles: ["admin"] }, ({ session, params }) =>
  tickets.retriage(session, params.id),
);
