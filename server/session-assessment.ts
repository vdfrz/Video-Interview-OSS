import { z, ZodError } from 'zod';
import { ApiError, completion, coachingBoundary } from './assessment.ts';
import { CONTENT_MODEL, contentSchema, transcriptSchema, validateEvidence, practiceMean, practiceRating } from './schema.ts';
import { getQuestion, getRubric } from './rubric.ts';
import { COACHING_RUBRIC, COACHING_RUBRIC_METADATA } from './coaching.ts';

const line = z.string().trim().min(1).max(2400);
const rating = z.enum(['strong', 'developing', 'needs_work', 'not_assessable']);
export const SESSION_AREAS = ['Relevance', 'Examples and reasoning', 'Structure', 'Camera presentation'] as const;
const savedAssessment = contentSchema.extend({
  score: z.number().min(0).max(10).nullable().optional(),
  // Public reviews include server limitations and preserved earlier component notes.
  limitations: z.array(line).min(1).max(100),
  delivery: z.object({ summary: line, wordsPerMinute: z.number().finite().nonnegative().max(1200),
    pauseCount: z.number().int().nonnegative().max(2000) }).strict(),
  visualObservations: z.array(z.object({ timestamp: z.number().finite().nonnegative(),
    observation: line, suggestion: line, why: line.optional() }).strict()).max(8),
  contentStatus: z.enum(['complete', 'failed']).optional(), contentError: line.optional(),
  visualStatus: z.enum(['complete', 'failed', 'not_requested']).optional(), visualError: line.optional(),
  models: z.object({ content: z.string().max(200).optional(), visual: z.string().max(200).optional() }).strict().optional(),
  rubric: z.object({ version: z.string().max(100), path: z.string().max(200) }).strict().optional(),
}).strict();
const requestSchema = z.object({
  apiKey: z.string().trim().min(10).max(256).regex(/^[A-Za-z0-9_-]+$/),
  answers: z.array(z.object({ question: z.object({ id: z.union([z.string().max(20), z.number().int()]),
    text: z.string().max(3000), category: z.string().max(200) }).strict(),
    assessment: savedAssessment, transcript: transcriptSchema.optional(),
  }).strict()).length(3),
}).strict();
const providerSchema = z.object({ summary: line, overallRating: rating,
  areas: z.array(z.object({ name: z.enum(SESSION_AREAS), rating,
    score: z.number().int().min(0).max(10).nullable(), whatWorked: line, whatToImprove: line,
    feedback: line, evidence: z.array(z.object({ evidenceId: z.number().int().nonnegative().max(83) }).strict()).max(5),
  }).strict()).length(4), priorities: z.array(line).min(1).max(3), limitations: z.array(line).max(8),
}).strict();
type Evidence = { answerIndex: number; timestamp: number; quote: string; kind: 'transcript' | 'camera' };

export async function assessSession(input: unknown, options: {
  fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal;
} = {}) {
  if (options.signal?.aborted) throw new ApiError(499, 'REQUEST_CANCELLED', 'Session review stopped. Saved answer feedback is preserved.');
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, 'INVALID_SESSION', 'Provide exactly three completed answer reviews for the session assessment.');
  const evidence: Evidence[] = [];
  const limits: string[] = [];
  const answers = parsed.data.answers.map((answer, answerIndex) => {
    const question = getQuestion(answer.question.id);
    if (!question || answer.assessment.contentStatus === 'failed') {
      throw new ApiError(400, 'SESSION_CONTENT_INCOMPLETE', 'All three answers need successful content feedback before grading the session.');
    }
    const names = getRubric(question.category).map(criterion => criterion.name);
    const assessment = answer.assessment;
    if (answer.transcript) {
      try { validateEvidence(assessment, answer.transcript, names); }
      catch { throw new ApiError(400, 'INVALID_SESSION_EVIDENCE', 'An answer review contains unsupported transcript evidence or incorrect rubric criteria.'); }
    } else {
      if (assessment.criteria.length !== names.length || new Set(assessment.criteria.map(c => c.name)).size !== names.length ||
          assessment.criteria.some(c => !names.includes(c.name) || (c.rating !== 'not_assessable' && c.evidence.length === 0))) {
        throw new ApiError(400, 'INVALID_SESSION_EVIDENCE', 'An answer review has missing evidence or incorrect rubric criteria.');
      }
      limits.push(`Answer ${answerIndex + 1}: the session review received saved feedback without the underlying transcript.`);
    }
    const reference = (item: Evidence) => {
      const existing = evidence.findIndex(value => value.answerIndex === item.answerIndex && value.kind === item.kind &&
        value.timestamp === item.timestamp && value.quote === item.quote);
      if (existing >= 0) return existing;
      evidence.push(item); return evidence.length - 1;
    };
    const contentCriteria = assessment.criteria.map(criterion => ({ name: criterion.name, rating: criterion.rating,
      feedback: criterion.feedback, evidenceIds: criterion.evidence.map(item => reference({
        answerIndex, timestamp: item.timestamp, quote: item.quote, kind: 'transcript',
      })),
    }));
    const cameraUsable = assessment.visualStatus !== 'failed' && assessment.visualStatus !== 'not_requested';
    if (!cameraUsable || assessment.visualObservations.length === 0) {
      limits.push(`Answer ${answerIndex + 1}: no supported camera observations were available to the session review.`);
    }
    const cameraObservations = cameraUsable ? assessment.visualObservations.map(item => {
      if (answer.transcript && item.timestamp > answer.transcript.duration) {
        throw new ApiError(400, 'INVALID_SESSION_EVIDENCE', 'A camera observation falls outside its recording timeline.');
      }
      return { observation: item.observation, suggestion: item.suggestion, why: item.why,
        evidenceId: reference({ answerIndex, timestamp: item.timestamp, quote: item.observation, kind: 'camera' }) };
    }) : [];
    return { answerIndex, question, transcript: answer.transcript ? { text: answer.transcript.text,
      segments: answer.transcript.segments } : undefined, summary: assessment.summary, strengths: assessment.strengths,
      improvements: assessment.improvements, contentCriteria, cameraObservations, limitations: assessment.limitations };
  });
  const outputShape = { summary: 'Two-sentence overview of the complete three-answer session.', overallRating: 'developing',
    areas: SESSION_AREAS.map(name => ({ name, rating: 'developing', feedback: 'What worked, what did not, why it matters and a useful adjustment.',
      score: 'An independently chosen integer 0–10, or null when not assessable', whatWorked: 'Specific supported aspect, or no clear strength demonstrated.', whatToImprove: 'Specific change for the next attempt.',
      evidence: [{ evidenceId: 0 }] })), priorities: ['Most useful action for the next session.'], limitations: [] };
  let provider;
  try {
    const raw = await completion(parsed.data.apiKey, CONTENT_MODEL, [
      { role: 'system', content: `${coachingBoundary}\nGrade this complete THREE-ANSWER practice session using the server-loaded coaching Markdown:\n${COACHING_RUBRIC}\nAssess the overall answer content first: relevance, examples/reasoning and structure. Camera presentation is a separate fourth area and must use only supplied camera observations, not imagined video. This is a numerical practice grade, not a hiring prediction. Do not force praise. Give a balanced account of what works, what does not, why and how to improve. Preserve distinctions between question categories. Do not invent experiences or contradictions. Each area must include an integer score from0to10 using the Markdown anchors, or null when there is insufficient evidence; whatWorked names the specific useful aspect or states that no clear strength was demonstrated; whatToImprove is a concrete next step; feedback explains why. The server derives ratings from scores and the overall content score from the three content areas only; do not output an overallScore. Ratings must be strong, developing, needs_work or not_assessable. Return exactly this shape: ${JSON.stringify(outputShape)}. Include each named area once. A rated area needs at least one supplied evidenceId. Content areas must use transcript evidence IDs; camera presentation must use camera IDs. If no supported camera evidence exists, use not_assessable with empty evidence for that area and do not penalise the overall content grade for missing camera input. Select IDs only; never generate quotes, timestamps or answer indices. The server attaches their exact saved sources. Overall grade should reflect the three content areas. Keep the summary to two sentences, area feedback focused, and at most three concrete priorities. About 300–450 words total is enough. Do not print evidenceId, segmentId or frameId identifiers in human-facing prose. State that this synthesizes completed reviews; you did not hear audio or inspect new video.` },
      { role: 'user', content: JSON.stringify({ answers, evidence: evidence.map((item, evidenceId) => ({ evidenceId, ...item })) }) },
    ], options.fetchImpl ?? globalThis.fetch, options.timeoutMs ?? 60_000, options.signal, z.toJSONSchema(providerSchema));
    provider = providerSchema.parse(raw);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const detail = error instanceof ZodError ? ` (${error.issues.slice(0, 3).map(issue => `${issue.path.join('.')} ${issue.code}`).join('; ')})` : '';
    throw new ApiError(502, 'INVALID_SESSION_ASSESSMENT', `The session grading response did not match the required format${detail}. Saved answer feedback is preserved.`);
  }
  if (options.signal?.aborted) throw new ApiError(499, 'REQUEST_CANCELLED', 'Session review stopped. Saved answer feedback is preserved.');
  if (new Set(provider.areas.map(area => area.name)).size !== SESSION_AREAS.length) {
    throw new ApiError(502, 'INVALID_SESSION_EVIDENCE', 'The session review did not include each required grading area exactly once.');
  }
  const areas = provider.areas.map(area => {
    const areaRating = practiceRating(area.score);
    if (areaRating !== 'not_assessable' && area.evidence.length === 0) {
      throw new ApiError(502, 'INVALID_SESSION_EVIDENCE', 'A graded session area has no supporting saved evidence.');
    }
    return { ...area, rating: areaRating, evidence: area.evidence.map(item => {
      const source = evidence[item.evidenceId];
      if (!source || (area.name === 'Camera presentation') !== (source.kind === 'camera')) {
        throw new ApiError(502, 'INVALID_SESSION_EVIDENCE', 'The session review selected an unsupported source or the wrong evidence type.');
      }
      return source;
    }) };
  });
  const overallScore = practiceMean(areas.filter(area => area.name !== 'Camera presentation').map(area => area.score));
  return { ...provider, areas, overallScore, overallRating: practiceRating(overallScore), limitations: [...new Set([...provider.limitations, ...limits,
    'This practice grade synthesizes the three completed answer reviews; it does not verify the truth of claims or predict a hiring outcome.',
    'Transcript evidence is automatically transcribed. Camera evidence quotes an earlier model observation of a sampled image, not the candidate’s spoken words or continuous behaviour.'])],
    models: { session: CONTENT_MODEL }, rubric: COACHING_RUBRIC_METADATA };
}
