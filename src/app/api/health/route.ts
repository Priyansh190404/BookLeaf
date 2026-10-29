import { route } from "@/lib/http/route";

export const GET = route({ public: true }, async () => ({ status: "ok", time: new Date().toISOString() }));
