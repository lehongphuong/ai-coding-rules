import { SECTION_IDS, type SectionId } from '../types.js';

export const MAX_AI_RULES = 15;
export const MAX_AI_RULE_CHARS = 200;

export interface AiRuleDraft {
  section: SectionId;
  text: string;
}

/**
 * Defensive parse of the model answer. Accepts `{"rules":[...]}` or a bare array, optionally
 * wrapped in prose or a code fence. Returns undefined when no usable JSON is found.
 * Commands are dropped: they must come from detected facts, never from a model.
 */
export function parseAiRules(text: string): AiRuleDraft[] | undefined {
  const value = extractJson(text);
  if (value === undefined) return undefined;
  const list = Array.isArray(value)
    ? value
    : isObj(value) && Array.isArray(value.rules)
      ? value.rules
      : undefined;
  if (!list) return undefined;

  const out: AiRuleDraft[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (out.length >= MAX_AI_RULES) break;
    if (!isObj(item) || typeof item.section !== 'string' || typeof item.text !== 'string') continue;
    const section = item.section.trim().toLowerCase() as SectionId;
    if (!SECTION_IDS.includes(section) || section === 'commands') continue;
    const clean = cleanText(item.text);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section, text: clean });
  }
  return out;
}

function cleanText(raw: string): string {
  const t = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^([-*•]|\d+[.)])\s+/, '');
  if (t.length <= MAX_AI_RULE_CHARS) return t;
  return `${t.slice(0, MAX_AI_RULE_CHARS - 1).trimEnd()}…`;
}

/** First parseable JSON object or array found in `text`. */
export function extractJson(text: string): unknown {
  const direct = tryParse(text.trim());
  if (direct !== undefined) return direct;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '{' && c !== '[') continue;
    const end = matchingBracket(text, i);
    if (end === -1) continue;
    const parsed = tryParse(text.slice(i, end + 1));
    if (parsed !== undefined && typeof parsed === 'object') return parsed;
  }
  return undefined;
}

function matchingBracket(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

function tryParse(s: string): unknown {
  if (!s) return undefined;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
