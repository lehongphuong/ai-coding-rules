import { createHash } from 'node:crypto';

/** First 8 hex chars of sha256(text.trim()). Used for managed-block hashes. */
export function shortHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 8);
}
