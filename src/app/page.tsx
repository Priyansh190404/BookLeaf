import { redirect } from "next/navigation";

// Middleware normally redirects "/" first; this is the fallback.
export default function Home() { redirect("/login"); }
