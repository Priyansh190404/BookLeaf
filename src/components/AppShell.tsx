"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { ToastProvider } from "./Toast";

interface Props { name: string; role: "author" | "admin"; children: React.ReactNode }

const LINKS = {
  author: [["/author/books", "My Books"], ["/author/tickets/new", "Submit a Query"], ["/author/tickets", "My Tickets"]],
  admin: [["/admin", "Ticket Queue"]],
} as const;

export default function AppShell({ name, role, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };
  return (
    <ToastProvider>
      <nav className="topbar">
        <span className="brand"><span className="logo" />BookLeaf <span className="muted small" style={{ fontFamily: "inherit", fontWeight: 500 }}>{role === "admin" ? "Ops" : "Authors"}</span></span>
        {LINKS[role].map(([href, label]) => {
          const active = href === "/admin" || href === "/author/tickets" ? path === href || (path.startsWith(href + "/") && !path.endsWith("/new")) : path === href;
          return <Link key={href} href={href} className={active ? "active" : ""}>{label}</Link>;
        })}
        <span className="spacer" />
        <span className="small who">{name}</span>
        <button onClick={logout}>Log out</button>
      </nav>
      <main className="container">{children}</main>
    </ToastProvider>
  );
}
