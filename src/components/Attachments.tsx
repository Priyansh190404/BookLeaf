import type { AttachmentMeta } from "@/lib/types";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Files on a ticket: image thumbnails (click to open full size) and download links for PDFs. */
export default function Attachments({ ticketId, items }: { ticketId: string; items: AttachmentMeta[] }) {
  if (!items.length) return null;
  const href = (a: AttachmentMeta) => `/api/tickets/${ticketId}/attachments/${a.id}`;
  return (
    <div className="attachments">
      <div className="small muted">Attachments</div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        {items.map((a) => (
          <a key={a.id} href={href(a)} target="_blank" rel="noopener noreferrer" className="attachment" title={a.filename}>
            {a.mimeType.startsWith("image/")
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={href(a)} alt={a.filename} />
              : <span className="doc">PDF</span>}
            <span className="small">{a.filename}<br /><span className="muted">{size(a.sizeBytes)}</span></span>
          </a>
        ))}
      </div>
    </div>
  );
}
