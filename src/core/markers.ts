/** Managed-block markers shared by the writer (produces) and doctor (recognises). */
export const BEGIN_MARKER_RE = /^<!--\s*ai-rules:begin\s+id=([\w./-]+)(?:\s+hash=([0-9a-f]+))?\s*-->\s*$/;
export const END_MARKER_RE = /^<!--\s*ai-rules:end(?:\s+id=([\w./-]+))?\s*-->\s*$/;

export function beginMarker(id: string, hash: string): string {
  return `<!-- ai-rules:begin id=${id} hash=${hash} -->`;
}

export function endMarker(id: string): string {
  return `<!-- ai-rules:end id=${id} -->`;
}
