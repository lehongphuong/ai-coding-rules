/** Rough token estimate (≈ 4 chars per token). Deterministic and offline. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
