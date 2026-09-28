import { readFileSync } from 'node:fs';

export const COACHING_RUBRIC_METADATA = {
  version: '2026-09-28.3', path: 'docs/COACHING_RUBRIC.md',
} as const;
// Load the actual reviewed Markdown, rather than a client-provided substitute.
export const COACHING_RUBRIC = readFileSync(new URL('../docs/COACHING_RUBRIC.md', import.meta.url), 'utf8');
