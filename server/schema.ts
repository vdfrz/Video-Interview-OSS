import { z } from 'zod';

export const CONTENT_MODEL = 'google/gemini-3.1-flash-lite';
export const VISION_MODEL = 'qwen/qwen3-vl-32b-instruct';
export const ANALYSIS_MODELS = { content: CONTENT_MODEL, visual: VISION_MODEL } as const;
export const DEFAULT_MODEL = VISION_MODEL;
export const APPROVED_MODELS = [DEFAULT_MODEL] as const;
const line = z.string().trim().min(1).max(2400);
export const segmentSchema = z.object({
  start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(),
  text: z.string().trim().min(1).max(10000),
}).strict();
export const transcriptSchema = z.object({
  text: z.string().trim().min(1).max(50000), segments: z.array(segmentSchema).min(1).max(2000),
  duration: z.number().finite().positive().max(600),
  metrics: z.object({ wordsPerMinute: z.number().finite().nonnegative().max(1200),
    pauseCount: z.number().int().nonnegative().max(2000) }).strict(),
  warnings: z.array(line).max(10).optional(),
}).strict().superRefine((value, ctx) => {
  let last = 0;
  for (const seg of value.segments) {
    if (seg.start < last || seg.end < seg.start || seg.end > value.duration + 0.05) {
      ctx.addIssue({ code: 'custom', message: 'Transcript segment times are invalid.' });
    }
    last = seg.end;
  }
  if (normalize(value.segments.map(s => s.text).join(' ')) !== normalize(value.text)) {
    ctx.addIssue({ code: 'custom', message: 'Transcript text must match its segments.' });
  }
});
export const assessmentRequestSchema = z.object({
  apiKey: z.string().trim().min(10).max(256).regex(/^[A-Za-z0-9_-]+$/),
  model: z.enum(APPROVED_MODELS).default(DEFAULT_MODEL),
  question: z.object({ id: z.union([z.string().max(20), z.number().int()]),
    text: z.string().max(3000), category: z.string().max(200) }).strict(),
  transcript: transcriptSchema,
  frames: z.array(z.object({ timestamp: z.number().finite().nonnegative(),
    dataUrl: z.string().max(1_500_000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/),
  }).strict()).max(32).default([]).refine(frames =>
    frames.reduce((total, frame) => total + frame.dataUrl.length, 0) <= 12_000_000,
    'Combined camera frames exceed the request budget.'),
  // Accepted for compatibility only. This field is never sent to the model.
  rubric: z.unknown().optional(),
}).strict();
export const criterionSchema = z.object({
  name: line, rating: z.enum(['strong', 'developing', 'needs_work', 'not_assessable']),
  score: z.number().int().min(0).max(10).nullable().optional(),
  whatWorked: line.optional(), whatToImprove: line.optional(),
  feedback: line, evidence: z.array(z.object({ timestamp: z.number().finite().nonnegative(),
    quote: z.string().trim().min(1).max(10000) }).strict()).max(5),
}).strict();
export const contentSchema = z.object({
  summary: line, strengths: z.array(line).max(6), improvements: z.array(line).min(1).max(3),
  criteria: z.array(criterionSchema).min(3).max(6),
  delivery: z.object({ summary: line }).strict(), limitations: z.array(line).min(1).max(8),
}).strict();
// Provider references stable segment IDs. Replay times are derived locally,
// never guessed by the model or repaired after generation.
const providerCriterionSchema = criterionSchema.extend({
  score: z.number().int().min(0).max(10).nullable(),
  whatWorked: line, whatToImprove: line,
  evidence: z.array(z.object({
    segmentId: z.number().int().nonnegative().max(1999),
  }).strict()).max(5),
}).strict();
export const providerContentSchema = contentSchema.extend({
  criteria: z.array(providerCriterionSchema).min(3).max(6),
}).strict();
export const visualSchema = z.object({
  visualObservations: z.array(z.object({ timestamp: z.number().finite().nonnegative(),
    observation: line, suggestion: line, why: line.optional() }).strict()).max(4),
}).strict();
export const providerVisualSchema = z.object({
  visualObservations: z.array(z.object({ frameId: z.number().int().nonnegative().max(31),
    observation: line, suggestion: line, why: line }).strict()).max(4),
}).strict();
export function materializeVisualObservations(input: z.infer<typeof providerVisualSchema>, frames: { timestamp: number }[]) {
  return visualSchema.parse({ visualObservations: input.visualObservations.map(observation => {
    const frame = frames[observation.frameId];
    if (!frame) throw new Error('Visual observation contains an unsupported frame identifier.');
    return { timestamp: frame.timestamp, observation: observation.observation,
      suggestion: observation.suggestion, ...(observation.why ? { why: observation.why } : {}) };
  }) }).visualObservations;
}
export type Transcript = z.infer<typeof transcriptSchema>;
export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>;
export type ContentAssessment = z.infer<typeof contentSchema>;
export type ProviderContentAssessment = z.infer<typeof providerContentSchema>;
export const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
export function practiceMean(scores: (number | null | undefined)[]) {
  const assessable = scores.filter((score): score is number => typeof score === 'number');
  return assessable.length ? Math.round(assessable.reduce((total, score) => total + score, 0) / assessable.length * 10) / 10 : null;
}
export function practiceRating(score: number | null) {
  return score === null ? 'not_assessable' as const : score >= 7 ? 'strong' as const
    : score >= 5 ? 'developing' as const : 'needs_work' as const;
}

export function materializeProviderContent(content: ProviderContentAssessment, transcript: Transcript, names: string[]) {
  const criteria = content.criteria.map(criterion => ({
    ...criterion,
    rating: practiceRating(criterion.score),
    evidence: criterion.evidence.map(evidence => {
      const segment = transcript.segments[evidence.segmentId];
      if (!segment) {
        throw new Error('Assessment contains an unsupported segment identifier.');
      }
      return { timestamp: segment.start, quote: segment.text };
    }),
  }));
  return validateEvidence(contentSchema.parse({ ...content, criteria }), transcript, names);
}

export function validateEvidence(content: ContentAssessment, transcript: Transcript, names: string[]) {
  if (content.criteria.length !== names.length || content.criteria.some(c => !names.includes(c.name)) ||
      new Set(content.criteria.map(c => c.name)).size !== names.length) {
    throw new Error('Assessment criteria do not match the server rubric.');
  }
  for (const criterion of content.criteria) {
    if (criterion.rating !== 'not_assessable' && criterion.evidence.length === 0) {
      throw new Error('Rated criteria require transcript evidence.');
    }
    for (const evidence of criterion.evidence) {
      if (evidence.timestamp > transcript.duration || !transcript.segments.some(segment =>
        evidence.timestamp >= segment.start && evidence.timestamp <= segment.end &&
        normalize(segment.text).includes(normalize(evidence.quote)))) {
        throw new Error('Assessment contains an unsupported quotation or timestamp.');
      }
    }
  }
  return content;
}
