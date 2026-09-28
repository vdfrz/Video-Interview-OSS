import { describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { assessSession, SESSION_AREAS } from './session-assessment.ts';
import { CONTENT_MODEL } from './schema.ts';
import { getQuestion, getRubric } from './rubric.ts';
import { createApp } from './app.ts';

const text = 'I reviewed a loan agreement and explained how the repayment terms affected both parties.';
const transcript = { text, segments: [{ start: 0.24, end: 8, text }], duration: 10,
  metrics: { wordsPerMinute: 90, pauseCount: 0 } };
const input = () => ({ apiKey: 'sk-or-test-key', answers: ['1', '71', '17'].map(id => ({
  question: getQuestion(id)!, transcript,
  assessment: { contentStatus: 'complete', visualStatus: 'complete', score: 6,
    summary: 'You give a relevant example that needs further explanation.', strengths: [],
    improvements: ['Explain what the outcome showed you.'],
    criteria: getRubric(getQuestion(id)!.category).map(criterion => ({ name: criterion.name,
      rating: 'developing', score: 6, whatWorked: 'You describe an action.', whatToImprove: 'Explain its significance.',
      feedback: 'The link to your reasoning needs more detail.', evidence: [{ timestamp: 0.24, quote: text }] })),
    delivery: { summary: 'Only ASR pacing estimates are available.', wordsPerMinute: 90, pauseCount: 0 },
    visualObservations: [{ timestamp: 2, observation: 'The head is turned left in this sample.',
      suggestion: 'Return toward the lens while allowing natural glances.', why: 'This keeps the face easier to see.' }],
    limitations: ['Camera feedback uses sampled images.'], models: { visual: 'qwen/qwen3-vl-32b-instruct' },
  },
})) });
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop',
  message: { content: JSON.stringify(value) } }] }), { headers: { 'Content-Type': 'application/json' } });
const graded = (evidence: { evidenceId: number; kind: string }[]) => ({
  summary: 'Your answers have useful examples but need a clearer explanation of their significance.',
  overallRating: 'strong', areas: SESSION_AREAS.map((name, index) => ({ name, rating: 'strong',
    score: [2, 5, 8, 10][index], whatWorked: 'You give a concrete detail.',
    whatToImprove: 'Explain why that detail answers the question.', feedback: 'The missing link makes your reasoning harder to follow.',
    evidence: [{ evidenceId: evidence.find(item => item.kind === (index === 3 ? 'camera' : 'transcript'))!.evidenceId }],
  })), priorities: ['Connect your example to the exact question.'], limitations: [],
});
const upstream = (transform?: (value: ReturnType<typeof graded>) => unknown) => (async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  const data = JSON.parse(body.messages[1].content);
  expect(body.model).toBe(CONTENT_MODEL);
  expect(body.messages[0].content).toContain('Interview practice coaching rubric');
  const value = graded(data.evidence);
  return response(transform ? transform(value) : value);
}) as typeof fetch;

describe('whole-session practice grading', () => {
  it('joins three answers with exact references and computes the content grade without the camera score', async () => {
    const result = await assessSession(input(), { fetchImpl: upstream() });
    expect(result.overallScore).toBe(5);
    expect(result.overallRating).toBe('developing');
    expect(result.areas[0].rating).toBe('needs_work');
    expect(result.areas[0].evidence[0]).toEqual({ answerIndex: 0, timestamp: 0.24, quote: text, kind: 'transcript' });
    expect(result.areas[3].evidence[0].kind).toBe('camera');
    expect(result.models.session).toBe(CONTENT_MODEL);
  });
  it('accepts public reviews with accumulated server and provider limitations', async () => {
    const saved = input();
    saved.answers.forEach(answer => { answer.assessment.limitations = Array.from({ length: 18 }, (_, i) => `Preserved limitation ${i}`); });
    const result = await assessSession(saved, { fetchImpl: upstream() });
    expect(result.overallScore).toBe(5);
  });
  it('requires exactly three successful content reviews', async () => {
    const incomplete = input(); incomplete.answers[0].assessment.contentStatus = 'failed';
    await expect(assessSession(incomplete)).rejects.toMatchObject({ code: 'SESSION_CONTENT_INCOMPLETE' });
    await expect(assessSession({ ...input(), answers: input().answers.slice(0, 2) })).rejects.toMatchObject({ code: 'INVALID_SESSION' });
  });
  it('revalidates saved quotations against the supplied transcripts', async () => {
    const invalid = input(); invalid.answers[0].assessment.criteria[0].evidence[0].quote = 'an invented candidate experience';
    await expect(assessSession(invalid)).rejects.toMatchObject({ code: 'INVALID_SESSION_EVIDENCE' });
  });
  it('rejects invented evidence identifiers and camera evidence assigned to a content area', async () => {
    await expect(assessSession(input(), { fetchImpl: upstream(value => {
      value.areas[0].evidence = [{ evidenceId: 83 }]; return value;
    }) })).rejects.toMatchObject({ code: 'INVALID_SESSION_EVIDENCE' });
    await expect(assessSession(input(), { fetchImpl: upstream(value => {
      value.areas[0].evidence = value.areas[3].evidence; return value;
    }) })).rejects.toMatchObject({ code: 'INVALID_SESSION_EVIDENCE' });
  });
  it('allows unavailable camera feedback without grading it or penalising content', async () => {
    const partial = input();
    partial.answers.forEach(answer => { answer.assessment.visualStatus = 'failed'; answer.assessment.visualObservations = []; });
    const fetchImpl = (async (_url, init) => {
      const data = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      const value = graded([...data.evidence, { evidenceId: 80, kind: 'camera' }]);
      Object.assign(value.areas[3], { score: null, rating: 'not_assessable', evidence: [], whatWorked: 'Not assessable from these inputs.' });
      return response(value);
    }) as typeof fetch;
    const result = await assessSession(partial, { fetchImpl });
    expect(result.areas[3].score).toBeNull();
    expect(result.areas[3].rating).toBe('not_assessable');
    expect(result.overallScore).toBe(5);
    expect(result.limitations.join(' ')).toContain('no supported camera');
  });
  it('does not call the provider after cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    let calls = 0;
    await expect(assessSession(input(), { signal: controller.signal, fetchImpl: (async () => {
      calls++; return response({});
    }) as typeof fetch })).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' });
    expect(calls).toBe(0);
  });
  it('serves the new API endpoint while preserving saved answer reviews', async () => {
    const server = createApp({ sessionAssess: (data, options) => assessSession(data, { ...options, fetchImpl: upstream() }) }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    try {
      const result = await fetch(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/session-assess`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()),
      });
      expect(result.status).toBe(200);
      expect((await result.json()).overallScore).toBe(5);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
