"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { Session } from "@/lib/auth/session";

const DEMO = [
  ["Author", "priya.sharma@email.com", "Author@123"],
  ["Author (no payouts)", "ananya.reddy@email.com", "Author@123"],
  ["Author (book in production)", "sneha.kulkarni@email.com", "Author@123"],
  ["Admin", "admin@bookleaf.in", "Admin@123"],
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const s = await api<Session>("/api/auth/login", { method: "POST", json: { email, password } });
      router.push(s.role === "admin" ? "/admin" : "/author/books");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="hero">
        <span className="logo" />
        <h1>Your books, your royalties, one place.</h1>
        <p>Track sales and payouts, and get answers from the BookLeaf team without the back-and-forth.</p>
        <ul>
          <li>See royalties earned, paid and pending per book</li>
          <li>Raise a query and watch replies arrive live</li>
          <li>Clear timelines on every response</li>
        </ul>
      </section>
      <section className="panel">
        <div className="card">
          <h1 style={{ fontSize: 24 }}>Welcome back</h1>
          <p className="muted" style={{ margin: "0 0 4px" }}>Sign in to your BookLeaf account.</p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <div className="err" role="alert">{error}</div>}
            <p style={{ marginBottom: 0 }}><button disabled={busy} style={{ width: "100%" }}>{busy ? "Signing in…" : "Sign in"}</button></p>
          </form>
        </div>
        <div className="card">
          <h2 className="small muted" style={{ fontFamily: "inherit", fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>Demo accounts · click to fill</h2>
          <table className="creds"><tbody>
            {DEMO.map(([role, e, p]) => (
              <tr key={e} className="click" onClick={() => { setEmail(e); setPassword(p); }}>
                <td>{role}</td><td>{e}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
