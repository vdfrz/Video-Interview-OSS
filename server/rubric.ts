import { readFileSync } from 'node:fs';

const bank = readFileSync(new URL('../Practice_Interview_Question_Bank.md', import.meta.url), 'utf8');
const questions = new Map<string, { id: string; text: string; category: string }>();
let category = '';
for (const line of bank.split('\n')) {
  if (line.startsWith('## ')) category = line.slice(3);
  const match = line.match(/^\*\*(\d+a?)\.\*\* (.+)$/);
  if (match) questions.set(match[1], { id: match[1], text: match[2], category });
}
export function getQuestion(id: string | number) {
  return questions.get(String(id));
}
export function getRubric(category: string) {
  const common = [
    { name: 'Relevance to the question', guidance: 'Does the answer directly address the exact prompt? Distinguish relevant activity from the explanation requested.' },
    { name: 'Specificity and explanation', guidance: 'Look for concrete context, examples and explained significance. Do not reward jargon or invented facts.' },
    { name: 'Structure and clarity', guidance: 'Is there a coherent opening, linked development and conclusion? Judge understandable transcript structure, not accent or grammar stereotypes.' },
  ];
  if (category === 'Motivation for Commercial Law') common.push({ name: 'Personal connection', guidance: 'Use the source video lesson: experience and skills alone do not explain motivation. Check what appealed to the speaker, why, and how further exploration confirmed it. Never infer inner motivation, honesty or genuineness.' });
  else if (category === 'Motivation and Firm Knowledge') common.push({ name: 'Firm relevance and reasoning', guidance: 'Check the firm, role or work addressed by the exact prompt. For motivation questions, connect relevant firm details to reasons expressed by the speaker. For business or strategy questions, explain the relevant commercial reasoning. Current firm claims are not verified; avoid filling in missing firm details.' });
  else if (category === 'Competency Interview Questions') common.push({ name: 'Actions, results and reflection', guidance: 'Check enough situation/task context, the speaker\'s individual actions, outcome and learning. STAR is a preparation aid, not a required formula.' });
  else if (category === 'Scenarios and Ethical Questions') common.push({ name: 'Reasoning and judgement', guidance: 'Check identified concerns, proportionate next steps, alternatives and reasoning. State legal facts cannot be verified without sources.' });
  else if (category.includes('Commercial') || category.includes('Business') || category === 'Technical Case Studies') common.push({ name: 'Commercial reasoning', guidance: 'Check stated business context, stakeholders, consequences and balanced reasoning. Flag absent case materials or unverified current facts; do not fabricate them.' });
  else common.push({ name: 'Self reflection', guidance: 'Check explanation of the speaker\'s own example and its significance. Assess the spoken answer, never personality, identity or employability.' });
  return common;
}
