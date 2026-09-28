// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Recorder, { RecorderResult } from './Recorder';
import { ANSWER_SECONDS, COUNTDOWN_SECONDS } from '../lib/timing';

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  stopCalls = 0;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'video/webm';
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
    this.emitData();
  }

  stop() {
    this.stopCalls += 1;
    this.state = 'inactive';
    this.emitData();
    this.onstop?.(new Event('stop'));
  }

  emitData() {
    this.ondataavailable?.({ data: new Blob(['recorded video'], { type: this.mimeType }) } as BlobEvent);
  }
}

type TestTrack = EventTarget & { stop: ReturnType<typeof vi.fn> };

function makeStream() {
  const track = new EventTarget() as TestTrack;
  track.stop = vi.fn();
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function mountRecorder(
  props: Omit<React.ComponentProps<typeof Recorder>, 'stream'> & { stream?: MediaStream },
  strict = false,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const recorder = <Recorder {...props} stream={props.stream!} />;
  act(() => root.render(strict ? <StrictMode>{recorder}</StrictMode> : recorder));
  return {
    container,
    root,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('Recorder', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.isTypeSupported.mockClear();
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 360,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ drawImage: vi.fn() })),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: vi.fn(() => 'data:image/jpeg;base64,frame'),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  async function answerNow(view: ReturnType<typeof mountRecorder>) {
    act(() => view.container.querySelector<HTMLButtonElement>('.tcla-recorder__start')!.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(COUNTDOWN_SECONDS * 1_000); });
  }

  it('waits for the user, counts 5 to 1 without recording, then stops at 60 seconds', async () => {
    expect(COUNTDOWN_SECONDS).toBe(5);
    expect(ANSWER_SECONDS).toBe(60);
    const { stream } = makeStream();
    const onComplete = vi.fn<(result: RecorderResult) => void>();
    const onError = vi.fn();
    const view = mountRecorder({ stream, onComplete, onError });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(view.container.textContent).toContain('Answer now');
    const button = view.container.querySelector<HTMLButtonElement>('.tcla-recorder__start')!;
    act(() => { button.click(); button.click(); });
    for (const count of [5, 4, 3, 2, 1]) {
      expect(view.container.textContent).toContain(`Recording starts in ${count}`);
      expect(FakeMediaRecorder.instances).toHaveLength(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    }
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(view.container.textContent).toContain('Time remaining: 1:00');
    await act(async () => { await vi.advanceTimersByTimeAsync((ANSWER_SECONDS * 1_000) - 1); });
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.duration).toBe(ANSWER_SECONDS);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.frames.length).toBeLessThanOrEqual(32);
    expect(result.frames.length).toBeGreaterThanOrEqual(31);
    expect(result.frames[0].timestamp).toBe(0);
    expect(result.frames.at(-1)!.timestamp).toBe(ANSWER_SECONDS);
    expect(result.frames.every((frame, index, frames) => (
      index === 0 || frame.timestamp - frames[index - 1].timestamp === 2
    ))).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    view.unmount();
  });

  it('allows finishing early and ignores a duplicate stop event', async () => {
    const { stream } = makeStream();
    const onComplete = vi.fn<(result: RecorderResult) => void>();
    const view = mountRecorder({ stream, onComplete, onError: vi.fn() });
    await answerNow(view);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    const recorder = FakeMediaRecorder.instances[0];
    act(() => view.container.querySelector<HTMLButtonElement>('.tcla-recorder__finish')!.click());
    act(() => recorder.onstop?.(new Event('stop')));
    expect(recorder.stopCalls).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].duration).toBe(10);
    view.unmount();
  });

  it('cancels the countdown on unmount without starting a recording', async () => {
    const { stream, track } = makeStream();
    const onComplete = vi.fn();
    const view = mountRecorder({ stream, onComplete, onError: vi.fn() });
    act(() => view.container.querySelector<HTMLButtonElement>('.tcla-recorder__start')!.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(track.stop).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('cancels recording on unmount without stopping the parent stream or completing', async () => {
    const { stream, track } = makeStream();
    const onComplete = vi.fn();
    const view = mountRecorder({ stream, onComplete, onError: vi.fn() });
    await answerNow(view);
    const recorder = FakeMediaRecorder.instances[0];
    view.unmount();
    expect(recorder.stopCalls).toBe(1);
    expect(track.stop).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('survives StrictMode effect replay and records only after the countdown', async () => {
    const { stream, track } = makeStream();
    const onComplete = vi.fn<(result: RecorderResult) => void>();
    const view = mountRecorder({ stream, onComplete, onError: vi.fn() }, true);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    await answerNow(view);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(ANSWER_SECONDS * 1_000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(track.stop).not.toHaveBeenCalled();
    view.unmount();
  });

  it('reports a camera or microphone track ending during the answer', async () => {
    const { stream, track } = makeStream();
    const onError = vi.fn();
    const view = mountRecorder({ stream, onComplete: vi.fn(), onError });
    await answerNow(view);
    act(() => track.dispatchEvent(new Event('ended')));
    expect(onError).toHaveBeenCalledWith('The camera or microphone stream ended before the answer was complete.');
    expect(FakeMediaRecorder.instances[0].stopCalls).toBe(1);
    view.unmount();
  });
});
