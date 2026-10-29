import type { Message } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Conversation view shared by author and admin. Internal notes are visually distinct (admin only; the API never sends them to authors). */
export default function Thread({ messages, authorName }: { messages: Message[]; authorName?: string }) {
  return (
    <>
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.isInternal ? "internal" : m.senderRole}`}>
          <div className="meta">
            <b>{m.isInternal ? `Internal note · ${m.senderName}` : m.senderRole === "admin" ? `BookLeaf · ${m.senderName}` : authorName ?? "You"}</b>
            <span>{when(m.createdAt)}</span>
            {m.aiAssisted && <span className="tag">AI-assisted</span>}
          </div>
          {m.body}
        </div>
      ))}
    </>
  );
}

export { when };
