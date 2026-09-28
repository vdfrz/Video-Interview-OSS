// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import AnswerReview from './AnswerReview';
import type { Answer } from '../lib/session';
it('shows why and action beside a sampled frame and seeks the preserved clip to that exact time', () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const div = document.createElement('div'); document.body.appendChild(div);
  const root = createRoot(div);
  const answer = {
    question: { id: '1', category: 'Motivation', text: 'Why law?', sourcePage: 1, defaultEligible: true }, blob: new Blob(['clip']), duration: 30,
    frames: [{ timestamp: 8.25, dataUrl: 'data:image/jpeg;base64,AAAA' }],
    assessment: { summary: 'Answer summary', strengths: [], improvements: [], criteria: [], limitations: [],
      delivery: { summary: '', wordsPerMinute: 20, pauseCount: 1 },
      visualObservations: [{ timestamp: 8.25, observation: 'Head is turned to the side', why: 'Your face is less visible', suggestion: 'Return toward the lens after thinking' }],
    },
  } as Answer;
  act(() => root.render(<AnswerReview answer={answer} index={0} reviewing={false} onReview={() => {}} />));
  const cameraTab = [...div.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b => b.textContent?.includes('On camera'))!;
  act(() => cameraTab.click());
  expect(div.textContent).toContain('Why it matters');
  expect(div.textContent).toContain('Your face is less visible');
  expect(div.textContent).not.toContain('Answer summary');
  const button = div.querySelector<HTMLButtonElement>('[aria-label="Show camera moment at 0:08"]')!;
  act(() => button.click());
  expect(div.querySelector('video')!.currentTime).toBe(8.25);
  expect(pause).toHaveBeenCalled();
  expect(div.textContent).toContain('Paused at 0:08');
  act(() => root.unmount()); div.remove(); vi.restoreAllMocks();
});
