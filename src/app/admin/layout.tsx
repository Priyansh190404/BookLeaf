import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getServerSession } from "@/lib/auth/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session || session.role !== "admin") redirect("/login");
  return <AppShell name={session.name} role="admin">{children}</AppShell>;
}
