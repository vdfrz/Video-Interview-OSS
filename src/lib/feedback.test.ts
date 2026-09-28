import { describe, expect, it } from 'vitest';
import { assessmentComplete, mergeAssessment } from './feedback';
import type { Assessment } from './session';
const complete: Assessment = {
  summary: 'Saved content', strengths: ['Specific example'], improvements: ['Explain result'], criteria: [],
  visualObservations: [{ timestamp: 2, observation: 'Head turned left', suggestion: 'Return toward the lens', why: 'Keeps your face visible' }],
  delivery: { summary: 'Measured pace', wordsPerMinute: 100, pauseCount: 1 }, limitations: ['Sampled frames'],
  contentStatus: 'complete', visualStatus: 'complete',
};
describe('partial review recovery', () => {
  it('keeps successful content when retry only recovers camera feedback', () => {
    const old = { ...complete, visualStatus: 'failed' as const, visualObservations: [], visualError: 'Timeout', limitations: ['Visual feedback is unavailable: Timeout', 'Sampled frames'] };
    const fresh = { ...complete, contentStatus: 'failed' as const, contentError: 'Timeout', summary: 'Unavailable', criteria: [], strengths: [], improvements: [] };
    const merged = mergeAssessment(old, fresh);
    expect(merged.summary).toBe('Saved content');
    expect(merged.visualObservations).toHaveLength(1);
    expect(merged.contentError).toBeUndefined();
    expect(merged.limitations).not.toContain('Visual feedback is unavailable: Timeout');
    expect(assessmentComplete(merged)).toBe(true);
  });
  it('keeps camera evidence when retry only recovers content', () => {
    const old = { ...complete, contentStatus: 'failed' as const };
    const fresh = { ...complete, visualStatus: 'failed' as const, visualObservations: [], visualError: 'Timeout', limitations: ['Visual feedback is unavailable: Timeout', 'Sampled frames'] };
    const merged = mergeAssessment(old, fresh);
    expect(merged.visualObservations[0].timestamp).toBe(2);
    expect(merged.visualError).toBeUndefined();
    expect(assessmentComplete(merged)).toBe(true);
    expect(assessmentComplete(fresh)).toBe(false);
    expect(assessmentComplete(undefined)).toBe(false);
  });
});
