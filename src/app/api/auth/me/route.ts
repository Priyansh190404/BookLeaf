import { route } from "@/lib/http/route";

export const GET = route({}, async ({ session }) => session);
