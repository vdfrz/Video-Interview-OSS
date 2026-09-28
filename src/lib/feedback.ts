import type { Assessment } from './session';

export function assessmentComplete(a?: Assessment): boolean {
  return !!a && a.contentStatus !== 'failed' && a.visualStatus !== 'failed';
}

// A retry must not erase a component that already succeeded.
export function mergeAssessment(previous: Assessment | undefined, next: Assessment): Assessment {
  if (!previous) return next;
  const result = { ...next, models: next.models ? { ...next.models } : undefined };
  if (next.contentStatus === 'failed' && previous.contentStatus !== 'failed') {
    Object.assign(result, {
      summary: previous.summary, score: previous.score, strengths: previous.strengths,
      improvements: previous.improvements, criteria: previous.criteria,
      delivery: previous.delivery, contentStatus: 'complete', contentError: undefined,
      models: { ...result.models, content: previous.models?.content },
    });
  }
  if (next.visualStatus === 'failed' && previous.visualStatus !== 'failed' && previous.visualStatus !== 'not_requested') {
    Object.assign(result, { visualObservations: previous.visualObservations, visualStatus: 'complete', visualError: undefined, models: { ...result.models, visual: previous.models?.visual } });
  }
  if ((next.contentStatus === 'failed' || next.visualStatus === 'failed') && previous.rubric?.version !== next.rubric?.version) result.rubric = undefined;
  result.limitations = [...new Set([...previous.limitations, ...next.limitations])].filter(line =>
    !(result.contentStatus !== 'failed' && line.startsWith('Content feedback is unavailable:')) &&
    !(result.visualStatus === 'complete' && line.startsWith('Visual feedback is unavailable:')),
  );
  return result;
}
