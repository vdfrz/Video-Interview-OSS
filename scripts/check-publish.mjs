#!/usr/bin/env node
/** Inspect the exact Git index, never secret values in terminal output. */
import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';

const screenshots = new Set([
  'docs/screenshots/home.jpg',
  'docs/screenshots/question-bank.jpg',
  'docs/screenshots/settings.jpg',
  'docs/screenshots/session-feedback.jpg',
  'docs/screenshots/feedback-evidence.jpg',
  'docs/screenshots/answer-feedback-blurred.png',
]);
const forbiddenPath = /(^|\/)(?:node_modules|dist|coverage|tmp|sources|recordings|uploads|exports|dev-assets|__pycache__|\.venv|venv|\.cache|test-results|playwright-report)(?:\/|$)|^docs\/(?:qa\/|PDD\.md$)|^(?:Product_Flow|Video_Interview_Practice_Actionable_Insights|Video_Interview_Review_Detailed_Notes)\.md$|(^|\/)(?:\.env(?:\..*)?|\.npmrc|credentials[^/]*|secrets[^/]*)$/i;
const privateExtension = /\.(?:webm|mp4|mov|mkv|avi|wav|mp3|m4a|aiff?|flac|ogg|png|jpe?g|webp|gif|heic|pdf|zip|sqlite\d*|db|pem|key|p12|pfx|pyc|pyo)$/i;
const textExtensions = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.html', '.py', '.txt', '.yml', '.yaml', '.toml']);
const textNames = new Set(['LICENSE', 'PRVIA-LICENSE', '.gitignore', '.nvmrc', '.env.example']);
const secretPatterns = [
  ['OpenAI/OpenRouter-style credential', /\bsk-(?:or-v1-|proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack credential', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Credential in URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/],
  ['Embedded media payload', /data:(?:image|audio|video)\/[^;,]+;base64,[A-Za-z0-9+/]{1000,}/],
  ['Personal absolute path', /\/(?:Users|home)\/[A-Za-z0-9._-]+\//],
];
const entries = execFileSync('git', ['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean);
const issues = [];
for (const entry of entries) {
  const [metadata, path] = entry.split('\t');
  const [mode, objectId, stage] = metadata.split(' ');
  if (stage !== '0' || !['100644', '100755'].includes(mode)) {
    issues.push(`${path}: unsupported index entry (conflict, symlink, or submodule)`); continue;
  }
  const approvedScreenshot = screenshots.has(path);
  if (path !== '.env.example' && (forbiddenPath.test(path) || (privateExtension.test(path) && !approvedScreenshot))) {
    issues.push(`${path}: private path or unapproved media`); continue;
  }
  const data = execFileSync('git', ['cat-file', 'blob', objectId], {maxBuffer: 10 * 1024 * 1024});
  if (approvedScreenshot) {
    const validMagic = path.endsWith('.png')
      ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : data.subarray(0, 3).equals(Buffer.from([255,216,255]));
    if (!validMagic || data.length > 3_000_000) {
      issues.push(`${path}: invalid or oversized screenshot`);
    }
    continue; // Screenshots require visual review; text rules cannot inspect pixels.
  }
  if ((!textExtensions.has(extname(path)) && !textNames.has(path.split('/').at(-1))) || data.includes(0)) {
    issues.push(`${path}: unknown file type or binary content`); continue;
  }
  const lines = data.toString('utf8').split('\n');
  lines.forEach((line, index) => {
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(line)) issues.push(`${path}:${index + 1}: ${label}`);
    }
  });
}
if (!entries.length) issues.push('No files in the Git index. Stage the intended publication files first.');
if (issues.length) {
  console.error('Publication check failed (values redacted):\n' + issues.join('\n'));
  process.exit(1);
}
console.log(`Publication check passed: ${entries.length} indexed files. Only ${screenshots.size} named screenshots are permitted as binary assets. Visually review screenshots and inspect the staged diff before pushing.`);
