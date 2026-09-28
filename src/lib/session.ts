import type { Question } from "../data/questions";

export interface Transcript {
  text: string;
  segments: { start: number; end: number; text: string }[];
  duration: number;
  metrics: { wordsPerMinute: number; pauseCount: number };
  warnings?: string[];
}
export interface Assessment {
  score?: number | null;
  models?: { content?: string; visual?: string };
  rubric?: { version: string; path: string };
  contentStatus?: "complete" | "failed";
  contentError?: string;
  visualStatus?: "complete" | "failed" | "not_requested";
  visualError?: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  criteria: {
    name: string;
    score?: number | null;
    whatWorked?: string;
    whatToImprove?: string;
    rating: "strong" | "developing" | "needs_work" | "not_assessable";
    feedback: string;
    evidence: { timestamp: number; quote: string }[];
  }[];
  visualObservations: {
    timestamp: number;
    observation: string;
    suggestion: string;
    why?: string;
  }[];
  delivery: { summary: string; wordsPerMinute: number; pauseCount: number };
  limitations: string[];
}
export interface Answer {
  question: Question;
  blob: Blob;
  duration: number;
  frames: { timestamp: number; dataUrl: string }[];
  transcript?: Transcript;
  assessment?: Assessment;
  error?: string;
}
export interface SessionAssessment {
  summary: string;
  overallScore?: number | null;
  overallRating: "strong" | "developing" | "needs_work" | "not_assessable";
  areas: { name: string; score?: number | null; whatWorked?: string; whatToImprove?: string; rating: "strong" | "developing" | "needs_work" | "not_assessable"; feedback: string;
    evidence: { answerIndex: number; timestamp: number; quote: string; kind?: "transcript" | "camera" }[] }[];
  priorities: string[];
  limitations: string[];
}
export interface Session {
  sessionAssessment?: SessionAssessment;
  sessionReviewError?: string;
  id: string;
  createdAt: string;
  questions: Question[];
  answers: Answer[];
  prepSeconds: number;
  answerSeconds: number;
}
const DB_NAME = import.meta.env.DEV && new URLSearchParams(location.search).get('testCamera') === '1' ? 'rehearsal-test' : 'rehearsal-local';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("sessions");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
export async function saveSession(session: Session): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").put(session, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteSavedSession(): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sessions", "readwrite");
      tx.objectStore("sessions").delete("current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function loadSession(): Promise<Session | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("sessions")
        .objectStore("sessions")
        .get("current");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export async function jsonResponse<T>(response: Response): Promise<T> {
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The review service returned an unreadable response. Your recordings are still saved.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message ||
            "The review could not be completed. Please retry.",
    );
  return data as T;
}
