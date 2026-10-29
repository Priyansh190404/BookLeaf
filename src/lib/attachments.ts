/** Upload rules: size/count caps, content sniffing (never trust the client's MIME type), filename hygiene. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_TICKET = 5;
export const ALLOWED_DESCRIPTION = "PNG, JPEG, GIF, WebP images or PDF";

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

/** Detects the real file type from magic bytes. Returns null for anything not on the allow-list. */
export function sniffMime(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}

/** Images are safe to display inline; everything else is forced to download. */
export const isInlineMime = (m: string) => m.startsWith("image/");

/** Strip any path, control characters and quotes; cap the length; never return empty. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f"<>:*?|]/g, "").trim().slice(-120);
  return clean || "attachment";
}
