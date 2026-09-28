// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectSessionQuestions } from "./data/questions";
import type { Assessment, Session, Transcript } from "./lib/session";

const { loadSessionMock, saveSessionMock, deleteSavedSessionMock } = vi.hoisted(() => ({
  loadSessionMock: vi.fn(),
  saveSessionMock: vi.fn(),
  deleteSavedSessionMock: vi.fn(),
}));

vi.mock("./lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/session")>();
  return {
    ...actual,
    loadSession: loadSessionMock,
    saveSession: saveSessionMock,
    deleteSavedSession: deleteSavedSessionMock,
  };
});

vi.mock("./components/Recorder", async () => {
  const ReactModule = await import("react");
  return {
    default: ({
      onComplete,
    }: {
      onComplete: (result: {
        blob: Blob;
        duration: number;
        frames: { timestamp: number; dataUrl: string }[];
      }) => void;
    }) =>
      ReactModule.createElement(
        "button",
        {
          type: "button",
          onClick: () =>
            onComplete({
              blob: new Blob(["test recording"], { type: "video/webm" }),
              duration: 30,
              frames: [
                { timestamp: 0, dataUrl: 'data:image/jpeg;base64,AAAA' },
                { timestamp: 30.02, dataUrl: 'data:image/jpeg;base64,AAAA' },
              ],
            }),
        },
        "Complete mock recording",
      ),
  };
});

import App from "./App";

const transcript: Transcript = {
  text: "I am interested in commercial law.",
  segments: [{ start: 0, end: 3, text: "I am interested in commercial law." }],
  duration: 30,
  metrics: { wordsPerMinute: 7, pauseCount: 0 },
};

const assessment: Assessment = {
  summary: "A clear answer.",
  strengths: ["You answered the prompt directly."],
  improvements: ["Add one specific example."],
  criteria: [
    {
      name: "Relevance",
      rating: "strong",
      feedback: "The answer stays on topic.",
      evidence: [{ timestamp: 0, quote: "interested in commercial law" }],
    },
  ],
  visualObservations: [],
  delivery: { summary: "The transcript is concise.", wordsPerMinute: 7, pauseCount: 0 },
  limitations: ["Practice feedback only."],
};

const health = {
  ok: true,
  transcription: { available: true },
  defaultModel: "qwen/qwen3-vl-32b-instruct",
};

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let mediaStream: MediaStream;

function makeSavedSession(answerCount: number): Session {
  const questions = selectSessionQuestions();
  const answers = questions.slice(0, answerCount).map((question) => ({
    question,
    blob: new Blob([`saved answer ${question.id}`], { type: "video/webm" }),
    duration: 30,
    frames: [],
  }));
  return {
    id: "saved-session",
    createdAt: "2026-09-28T10:00:00.000Z",
    questions,
    answers,
    prepSeconds: 30,
    answerSeconds: 90,
  };
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Could not find button containing: ${text}`);
  return button;
}

async function click(button: HTMLButtonElement) {
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function completeAnswer() {
  expect(container.textContent).toContain("Complete mock recording");
  await click(buttonByText("Complete mock recording"));
  await flush();
}

async function enterApiKey() {
  await click(container.querySelector<HTMLButtonElement>(
    'button[aria-label="Practice settings"]',
  )!);
  await flush();
  const input = document.body.querySelector<HTMLInputElement>('input[type="password"]');
  if (!input) throw new Error("API key input was not rendered");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "sk-or-v1-test-key");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  await click(buttonByText("Done"));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  loadSessionMock.mockReset().mockResolvedValue(undefined);
  saveSessionMock.mockReset().mockResolvedValue(undefined);
  deleteSavedSessionMock.mockReset().mockResolvedValue(undefined);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/health") return Response.json(health);
    if (url === "/api/transcribe") return Response.json(transcript);
    if (url === "/api/assess") return Response.json(assessment);
    if (url === "/api/session-assess") return Response.json({ summary: 'Practise more specific examples.', overallRating: 'developing', overallScore: 6, areas: [], priorities: ['Explain your actions'], limitations: [] });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("AudioContext", class {
    createAnalyser() {
      return {
        fftSize: 0,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
      };
    }
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
    close() { return Promise.resolve(); }
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test-recording"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: vi.fn(() => "new-session-id"),
  });
  const track = { stop: vi.fn() };
  mediaStream = { getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(mediaStream) },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App session flow", () => {
  it("records three answers before opening review and persists all three", async () => {
    act(() => root.render(<App />));
    await flush();
    await click(buttonByText("Start practice"));
    await flush();
    await click(buttonByText("Begin question 1"));

    await completeAnswer();
    expect(container.textContent).toContain("QUESTION 2 OF 3");
    expect(container.textContent).not.toContain("Your answer is ready for review");
    await completeAnswer();
    expect(container.textContent).toContain("QUESTION 3 OF 3");
    expect(container.textContent).not.toContain("Your answer is ready for review");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/health"]);

    await completeAnswer();
    expect(container.textContent).toContain("Three answers. A good start.");
    expect(container.textContent).toContain("Answer 1");
    expect(container.textContent).toContain("Answer 2");
    expect(container.textContent).toContain("Answer 3");
    const lastSaved = saveSessionMock.mock.calls.at(-1)?.[0] as Session;
    expect(lastSaved.answers).toHaveLength(3);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/health"]);
  });

  it("resumes after answer two, waits until answer three to call APIs, and sends only selected question fields", async () => {
    const restored = makeSavedSession(2);
    loadSessionMock.mockResolvedValue(restored);
    act(() => root.render(<App />));
    await flush();
    expect(container.textContent).toContain("2 of 3 answers saved on this device.");

    await enterApiKey();
    await click(buttonByText("Continue your session"));
    await flush();
    await click(buttonByText("Begin question 3"));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/health"]);

    await completeAnswer();
    await flush();
    expect(container.textContent).toContain("Your next step, a little clearer.");
    const requestCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url) === "/api/assess",
    );
    expect(requestCalls).toHaveLength(3);
    const payloads = requestCalls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(payloads.every((payload) =>
      Object.keys(payload.question).sort().join(",") === "category,id,text",
    )).toBe(true);
    expect(payloads[2].frames).toEqual([
      { timestamp: 0, dataUrl: 'data:image/jpeg;base64,AAAA' },
    ]);

    const lastSaved = saveSessionMock.mock.calls.at(-1)?.[0] as Session;
    expect(lastSaved.answers).toHaveLength(3);
    expect(lastSaved.sessionAssessment?.overallScore).toBe(6);
    const sessionCalls = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/session-assess');
    expect(sessionCalls).toHaveLength(1);
    const sessionPayload = JSON.parse(String((sessionCalls[0][1] as RequestInit).body));
    expect(sessionPayload.answers).toHaveLength(3);
    expect(sessionPayload.answers.every((a: Record<string, unknown>) => !('blob' in a) && !('frames' in a))).toBe(true);
    expect(JSON.stringify(lastSaved)).not.toContain("sk-or-v1-test-key");
  });

  it("deletes the saved session only after confirmation and returns to practice", async () => {
    loadSessionMock.mockResolvedValue(makeSavedSession(1));
    act(() => root.render(<App />));
    await flush();
    await click(container.querySelector<HTMLButtonElement>(
      'button[aria-label="Practice settings"]',
    )!);
    await flush();

    await click(buttonByText("Delete saved session"));
    expect(deleteSavedSessionMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("This cannot be undone.");
    await click(buttonByText("Delete permanently"));

    expect(deleteSavedSessionMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Start practice");
    expect(document.body.textContent).not.toContain("Delete saved session");
  });

  it("shows pending feedback during review and preserves recordings after cancellation", async () => {
    loadSessionMock.mockResolvedValue(makeSavedSession(3));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/health') return Response.json(health);
      if (String(input) === '/api/transcribe') return Response.json(transcript);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
      });
    });
    act(() => root.render(<App />));
    await flush();
    await enterApiKey();
    await click(buttonByText('Open your last session'));
    await click(buttonByText('Review my answers'));
    await flush();
    expect(container.textContent).toContain('Awaiting feedback');
    expect(container.textContent).not.toContain('Add your OpenRouter key above');
    await click(buttonByText('Stop review'));
    await flush();
    expect(container.textContent).toContain('Review stopped. Your recordings and completed feedback are saved.');
    expect((saveSessionMock.mock.calls.at(-1)?.[0] as Session).answers).toHaveLength(3);
  });
  it('retrying one answer preserves errors and recordings on untouched answers', async () => {
    const saved = makeSavedSession(3);
    saved.answers = saved.answers.map(a => ({ ...a, transcript, error: 'Original failed review' }));
    loadSessionMock.mockResolvedValue(saved);
    act(() => root.render(<App />)); await flush();
    await enterApiKey();
    await click(buttonByText('Open your last session'));
    await click(buttonByText('Retry this answer')); await flush();
    const persisted = saveSessionMock.mock.calls.at(-1)?.[0] as Session;
    expect(persisted.answers[0].assessment).toEqual(assessment);
    expect(persisted.answers[1].error).toBe('Original failed review');
    expect(persisted.answers[2].error).toBe('Original failed review');
    expect(persisted.answers[1].blob).toBe(saved.answers[1].blob);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/assess')).toHaveLength(1);
  });

});
