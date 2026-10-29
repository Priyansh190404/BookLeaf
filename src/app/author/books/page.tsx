"use client";
import Link from "next/link";
import Skeleton from "@/components/Skeleton";
import { usePolling } from "@/lib/client/usePolling";
import type { Book } from "@/lib/types";

const inr = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN")}`);
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—");

export default function MyBooks() {
  const { data: books, error, loading } = usePolling<Book[]>("/api/books", 30000);

  if (loading) return <><h1>My Books</h1><Skeleton rows={4} height={56} /></>;
  if (error) return <p className="err">{error}</p>;
  if (!books?.length) return <div className="card empty">No books on your account yet.</div>;

  const published = books.filter((b) => b.isPublished);
  const sum = (k: "totalRoyaltyEarned" | "royaltyPaid" | "royaltyPending") => published.reduce((n, b) => n + b[k], 0);

  return (
    <>
      <h1>My Books</h1>
      <p className="muted">{books.length} book{books.length > 1 ? "s" : ""} · {published.length} published</p>

      {published.length > 0 && (
        <div className="grid stats" style={{ marginBottom: 16 }}>
          <div className="card stat"><div className="v">{inr(sum("totalRoyaltyEarned"))}</div><div className="l">Total royalty earned</div></div>
          <div className="card stat"><div className="v">{inr(sum("royaltyPaid"))}</div><div className="l">Paid out</div></div>
          <div className="card stat"><div className="v">{inr(sum("royaltyPending"))}</div><div className="l">Pending</div></div>
        </div>
      )}

      <div className="card scroll">
        <table>
          <thead><tr>
            <th>Title</th><th>ISBN</th><th>Genre</th><th>Published</th><th>Status</th><th>MRP</th>
            <th>Copies sold</th><th>Earned</th><th>Paid</th><th>Pending</th><th></th>
          </tr></thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.id}>
                <td><b>{b.title}</b>{b.availableOn.length > 0 && <div className="small muted">{b.availableOn.join(" · ")}</div>}</td>
                <td className="small">{b.isbn ?? "—"}</td>
                <td>{b.genre ?? "—"}</td>
                <td>{date(b.publicationDate)}</td>
                <td><span className={`badge ${b.isPublished ? "b-Resolved" : "b-In-Progress"}`}>{b.status}</span></td>
                {b.isPublished ? (
                  <>
                    <td>{inr(b.mrp)}</td><td>{b.totalCopiesSold.toLocaleString("en-IN")}</td>
                    <td>{inr(b.totalRoyaltyEarned)}</td><td>{inr(b.royaltyPaid)}</td>
                    <td>
                      {inr(b.royaltyPending)}
                      {b.royaltyPaid === 0 && b.royaltyPending > 0 && <div className="small muted">No payout yet</div>}
                      {b.lastRoyaltyPayoutDate && <div className="small muted">Last paid {date(b.lastRoyaltyPayoutDate)}</div>}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="muted small">In production. Sales and royalties start once the book goes live.</td>
                )}
                <td><Link href={`/author/tickets/new?book=${b.id}`} className="small">Ask about this book</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
