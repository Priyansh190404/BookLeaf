import { route } from "@/lib/http/route";
import * as tickets from "@/lib/services/ticketService";

// Headline queue counts over ALL tickets (not just the current page).
export const GET = route({ roles: ["admin"] }, () => tickets.summary());
