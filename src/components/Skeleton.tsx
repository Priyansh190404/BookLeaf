/** Shimmering placeholder rows shown while data loads (better than a bare "Loading…"). */
export default function Skeleton({ rows = 4, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height, marginBottom: 10 }} />)}
    </div>
  );
}
