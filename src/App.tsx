import { ANSWER_SECONDS } from './lib/timing';
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Camera,
  Mic,
  Settings2,
  ShieldCheck,
  BookOpen,
  CircleHelp,
  X,
  LoaderCircle,
  Video,
  Sparkles,
  Clock3,
  Search,
} from "lucide-react";
import Recorder from "./components/Recorder";
import AnswerReview from "./components/AnswerReview";
import SessionReview from "./components/SessionReview";
import { assessmentComplete, mergeAssessment } from "./lib/feedback";
import { questions, selectSessionQuestions } from "./data/questions";
import {
  loadSession,
  saveSession,
  deleteSavedSession,
  clockTime,
  jsonResponse,
  type Session,
  type Transcript,
  type Assessment,
  type SessionAssessment,
} from "./lib/session";

type Screen = "home" | "setup" | "interview" | "review" | "library";
const testCamera = import.meta.env.DEV && new URLSearchParams(location.search).get('testCamera') === '1';
type Health = {
  transcription: { available: boolean; reason?: string };
  defaultModel: string;
};
const labels: Record<string, string> = {
  "Motivation for Commercial Law": "Your motivation",
  "Competency Interview Questions": "Your experience",
  "Character and Personality": "About you",
};
const shortCategory = (c: string) => labels[c] || c;

function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      className="camera-preview"
      aria-label="Camera preview"
    />
  );
}
function AudioMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    const timer = setInterval(() => {
      analyser.getByteFrequencyData(values);
      setLevel(
        Math.min(1, values.reduce((a, b) => a + b, 0) / values.length / 55),
      );
    }, 100);
    return () => {
      clearInterval(timer);
      source.disconnect();
      void context.close();
    };
  }, [stream]);
  return (
    <span
      className="audio-meter"
      aria-label={`Microphone input ${Math.round(level * 100)} percent`}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} className={i / 12 < level ? "lit" : ""} />
      ))}
    </span>
  );
}


export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState(0);
  const [evidenceTarget, setEvidenceTarget] = useState<{answerIndex: number; timestamp: number; nonce: number} | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const busy = useRef(false);
  const analysisAbort = useRef<AbortController | null>(null);
  const pendingReview = useRef<{ kind: 'session' } | { kind: 'answers'; onlyIndex?: number; refreshAll: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    loadSession()
      .then((s) => {
        if (active && s) {
          setSession(s);
        }
      })
      .catch(() => {
        if (active)
          setStorageWarning(
            "Browser storage is unavailable. Keep this tab open and download recordings before leaving.",
          );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    fetch("/api/health")
      .then(jsonResponse<Health>)
      .then((h) => {
        if (active) setHealth(h);
      })
      .catch(() => {
        if (active) setHealthError(true);
      });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      analysisAbort.current?.abort();
    };
  }, []);
  const persist = async (s: Session) => {
    setSession(s);
    try {
      await saveSession(s);
    } catch {
      setStorageWarning(
        "This session could not be saved to browser storage. Keep this tab open and download your recordings.",
      );
    }
  };
  const deleteCurrentSession = async () => {
    if (!session || working || screen === "interview" || deletingSession) return;
    setDeletingSession(true);
    setStorageWarning("");
    try {
      await deleteSavedSession();
      release();
      setSession(null);
      setScreen("home");
      setSelectedAnswer(0);
      setError("");
      setConfirmDelete(false);
      setSettingsOpen(false);
    } catch {
      setStorageWarning("The saved session could not be deleted from this browser.");
    } finally {
      setDeletingSession(false);
    }
  };
  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  };
  const setup = async (resume = false) => {
    if (busy.current) return;
    busy.current = true;
    setConnecting(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera recording needs a supported browser on localhost or HTTPS.",
        );
      const media = import.meta.env.DEV && testCamera ? await (await import('./lib/test-camera')).createTestCamera() : await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = media;
      setStream(media);
      if (!resume) {
        const next: Session = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          questions: selectSessionQuestions(),
          answers: [],
          prepSeconds: 0,
          answerSeconds: ANSWER_SECONDS,
        };
        await persist(next);
      }
      setScreen("setup");
    } catch (e) {
      release();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera or microphone access was declined. Allow access in your browser, then try again."
          : e instanceof Error
            ? e.message
            : "Could not start the camera.",
      );
    } finally {
      busy.current = false;
      setConnecting(false);
    }
  };
  const recorded = async (result: {
    blob: Blob;
    duration: number;
    frames: { timestamp: number; dataUrl: string }[];
  }) => {
    if (!session || busy.current) return;
    busy.current = true;
    const next = {
      ...session,
      answers: [
        ...session.answers,
        { ...result, question: session.questions[session.answers.length] },
      ],
    };
    // Switch views before publishing the third answer; there is no question 4.
    if (next.answers.length === 3) {
      setScreen("review");
      setSelectedAnswer(0);
      release();
    }
    await persist(next);
    busy.current = false;
    if (next.answers.length === 3) {
      if (apiKey.trim()) void analyse(next);
    }
  };
  const reviewWholeSession = async (current: Session, signal: AbortSignal): Promise<Session> => {
    setProgress("Putting your whole-session feedback together");
    try {
      const sessionAssessment = await fetch('/api/session-assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ apiKey: apiKey.trim(), answers: current.answers.map(a => ({
          question: { id: a.question.id, text: a.question.text, category: a.question.category },
          assessment: a.assessment, transcript: a.transcript,
        })) }),
      }).then(jsonResponse<SessionAssessment>);
      return { ...current, sessionAssessment, sessionReviewError: undefined };
    } catch (e) {
      if (signal.aborted) throw e;
      return { ...current, sessionReviewError: e instanceof Error ? e.message : 'The session review could not be completed.' };
    }
  };
  const gradeSession = async () => {
    if (!session || busy.current) return;
    if (!apiKey.trim()) { pendingReview.current = { kind: 'session' }; setSettingsOpen(true); return; }
    busy.current = true; setWorking(true); setError('');
    const controller = new AbortController(); analysisAbort.current = controller;
    try { await persist(await reviewWholeSession(session, controller.signal)); }
    catch { setError('Session review stopped. Your individual answer feedback is saved.'); }
    finally { busy.current = false; setWorking(false); setProgress(''); analysisAbort.current = null; }
  };
  const analyse = async (current: Session, onlyIndex?: number, refreshAll = false) => {
    if (busy.current || current.answers.length !== 3) return;
    if (!apiKey.trim()) {
      pendingReview.current = { kind: 'answers', onlyIndex, refreshAll };
      setSettingsOpen(true);
      return;
    }
    busy.current = true;
    setWorking(true);
    setError("");
    const controller = new AbortController();
    analysisAbort.current = controller;
    let next: Session = {
      ...current,
      answers: current.answers.map((a, i) => ({ ...a, error: (onlyIndex !== undefined ? i === onlyIndex : refreshAll || !assessmentComplete(a.assessment)) ? undefined : a.error })),
    };
    try {
      await persist(next);
      for (let i = 0; i < next.answers.length; i++) {
        const answer = next.answers[i];
        if (onlyIndex !== undefined ? i !== onlyIndex : !refreshAll && assessmentComplete(answer.assessment)) continue;
        try {
          if (!answer.transcript) {
            setProgress(`Transcribing answer ${i + 1} of 3`);
            const body = new FormData();
            body.append(
              "recording",
              answer.blob,
              `answer-${i + 1}.${answer.blob.type.includes("mp4") ? "mp4" : "webm"}`,
            );
            answer.transcript = await fetch("/api/transcribe", {
              method: "POST",
              body,
              signal: controller.signal,
            }).then(jsonResponse<Transcript>);
            await persist({ ...next, answers: [...next.answers] });
          }
          setProgress(`Reviewing answer ${i + 1} of 3`);
          const reviewed = await fetch("/api/assess", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey: apiKey.trim(),
              model: "qwen/qwen3-vl-32b-instruct",
              question: {
                id: answer.question.id,
                text: answer.question.text,
                category: answer.question.category,
              },
              transcript: answer.transcript,
              // Capture uses a browser clock; decoded media is authoritative.
              // Omit any trailing still outside the playable audio timeline.
              frames: answer.frames.filter((frame) => frame.timestamp <= answer.transcript!.duration),
            }),
            signal: controller.signal,
          }).then(jsonResponse<Assessment>);
          answer.assessment = mergeAssessment(answer.assessment, reviewed);
          answer.error = [reviewed.contentError, reviewed.visualError].filter(Boolean).join(' ') || undefined;
          next.sessionAssessment = undefined;
          next.sessionReviewError = undefined;
        } catch (e) {
          if (controller.signal.aborted) throw e;
          answer.error =
            e instanceof Error
              ? e.message
              : "This answer could not be reviewed.";
        }
        await persist({ ...next, answers: [...next.answers] });
      }
      if (next.answers.every(a => assessmentComplete(a.assessment))) {
        next = await reviewWholeSession(next, controller.signal);
        await persist(next);
      }
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Review stopped. Your recordings and completed feedback are saved."
          : e instanceof Error
            ? e.message
            : "Review failed.",
      );
    } finally {
      busy.current = false;
      setWorking(false);
      setProgress("");
      analysisAbort.current = null;
    }
  };
  const completed = session?.answers.filter((a) => assessmentComplete(a.assessment)).length || 0;
  const unfinished =
    !!session && session.answers.length > 0 && session.answers.length < 3;
  const nav = (next: Screen) => {
    if (working || screen === "interview") return;
    release();
    setScreen(next);
    setError("");
  };
  const filtered = questions.filter(
    (q) =>
      (category === "All categories" || q.category === category) &&
      q.text.toLowerCase().includes(query.toLowerCase()),
  );
  const categories = [...new Set(questions.map((q) => q.category))];
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="wordmark"
          onClick={() => nav("home")}
          disabled={screen === "interview" || working}
          aria-label="Video - Interview OSS home"
        >
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          <span>Video - Interview OSS</span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={screen !== "library" ? "active" : ""}
            disabled={screen === "interview" || working}
            onClick={() => nav("home")}
          >
            Practice
          </button>
          <button
            className={screen === "library" ? "active" : ""}
            disabled={screen === "interview" || working}
            onClick={() => nav("library")}
          >
            Question bank <span>201</span>
          </button>
        </nav>
        <button
          className="settings-button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Practice settings"
          disabled={screen === "interview" || working}
        >
          <Settings2 size={17} />
          <span>Settings</span>
        </button>
      </header>
      <main>
        {testCamera && <div className="notice warning" role="status">Development test camera: generated video and synthetic speech. No real camera or microphone. Separate test storage.</div>}
        {storageWarning && (
          <div className="notice warning" role="status">
            {storageWarning}
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {screen === "home" && (
          <>
            <div className="home-heading">
              <div className="eyebrow">
                <span className="tiny-dot" /> SOLICITOR INTERVIEW PRACTICE
              </div>
              <h1>
                Find your words.
                <br />
                <em>Make them yours.</em>
              </h1>
              <p>
                Three questions for your next training contract or vacation scheme interview,
                <br className="desktop-break" /> a moment to think, and feedback
                you can actually use.
              </p>
            </div>
            <div className="home-grid">
              <section className="session-card">
                <div className="card-topline">
                  <span className="eyebrow">YOUR PRACTICE SESSION</span>
                  <span className="soft-badge">
                    <Clock3 size={13} />
                    {ANSWER_SECONDS} seconds per answer
                  </span>
                </div>
                <h2>
                  A little practice.
                  <br />A stronger next step.
                </h2>
                <div className="question-plan">
                  {[
                    [
                      "01",
                      "Your motivation",
                      "What brings you to commercial law",
                    ],
                    ["02", "Your experience", "A real example of how you work"],
                    ["03", "About you", "The person behind the application"],
                  ].map(([n, title, desc]) => (
                    <div className="plan-row" key={n}>
                      <span className="number">{n}</span>
                      <div>
                        <h3>{title}</h3>
                        <p>{desc}</p>
                      </div>
                      <ChevronRight size={17} />
                    </div>
                  ))}
                </div>
                <button
                  className="primary start-button"
                  disabled={!loaded || connecting}
                  onClick={() => setup(unfinished)}
                >
                  {connecting ? (
                    <>
                      <LoaderCircle className="spin" size={18} />
                      Connecting camera…
                    </>
                  ) : (
                    <>
                      {unfinished ? "Continue your session" : "Start practice"}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p className="small centered">
                  {unfinished
                    ? `${session!.answers.length} of 3 answers saved on this device.`
                    : `Read at your pace · 5-second countdown · ${ANSWER_SECONDS}-second answers`}
                </p>
                {session?.answers.length === 3 && (
                  <>
                  <button
                    className="text-button previous-session"
                    onClick={() => {
                      setScreen("review");
                      setSelectedAnswer(0);
                    }}
                  >
                    Open your last session <ArrowUpRight size={15} />
                  </button>
                  <p className="small centered">Starting again replaces this saved session. Download recordings you want to keep.</p>
                  </>
                )}
              </section>
              <aside className="coaching-card">
                <div className="coaching-top">
                  <span className="eyebrow">A NOTE BEFORE YOU BEGIN</span>
                  <span className="line-star">✳</span>
                </div>
                <blockquote>
                  Sound like
                  <br />a person.
                  <br />
                  <em>
                    Not an
                    <br />
                    interviewee.
                  </em>
                </blockquote>
                <div className="coaching-bottom">
                  <span className="quote-rule" />
                  <p>
                    Bring a real example. Tell us why it matters.
                    <br />
                    You don’t need a perfect script.
                  </p>
                  <span className="source-note">
                    Clear reasons. Concrete examples. Your own words.
                  </span>
                </div>
              </aside>
            </div>
            <section className="how-it-works" aria-label="How practice works">
              <div>
                <span className="feature-icon">
                  <Video size={20} />
                </span>
                <h3>Three questions. One session.</h3>
                <p>
                  Prepare, record, and move to the next.
                  <br />
                  Stay in the rhythm of a real interview.
                </p>
              </div>
              <div>
                <span className="feature-icon">
                  <BookOpen size={20} />
                </span>
                <h3>Feedback with a reason.</h3>
                <p>
                  Understand what worked, what to change,
                  <br />
                  and where it happened in your answer.
                </p>
              </div>
              <div>
                <span className="feature-icon">
                  <ShieldCheck size={20} />
                </span>
                <h3>Your practice, your space.</h3>
                <p>
                  Recordings stay in this browser.
                  <br />
                  AI review shares transcripts and selected frames.
                </p>
              </div>
            </section>
          </>
        )}
        {screen === "setup" && session && (
          <section className="setup-screen">
            <button className="text-button" onClick={() => nav("home")}>
              ← Back to practice
            </button>
            <div className="page-heading">
              <span className="eyebrow">A QUICK CHECK</span>
              <h1>Make yourself comfortable.</h1>
              <p>Find your frame, check your microphone, and take a breath.</p>
            </div>
            <div className="setup-grid">
              <div className="preview-wrap">
                <Preview stream={stream} />
                <span className="preview-caption">
                  <Camera size={14} /> Camera preview · mirrored
                </span>
              </div>
              <div className="setup-details">
                <div className="check-row">
                  <Check size={18} />
                  <div>
                    <strong>Your camera is connected</strong>
                    <p>Keep your face comfortably in the frame.</p>
                  </div>
                </div>
                <div className="check-row">
                  <Mic size={18} />
                  <div>
                    <strong>Say a few words</strong>
                    <p>The bars should move when you speak.</p>
                    <AudioMeter stream={stream} />
                  </div>
                </div>
                <div className="setup-divider" />
                <h3>Here’s what happens next</h3>
                <p>
                  You’ll answer three questions, one at a time. You have{" "}
                  as much time as you need to read. Press Answer now for a 5-second countdown, then answer for up to {ANSWER_SECONDS} seconds. Recording stops automatically at the limit.
                </p>
                <p>You’ll see your feedback after all three.</p>
                <button
                  className="primary"
                  onClick={() => {
                    setScreen("interview");
                    setError("");
                  }}
                >
                  Begin question {session.answers.length + 1}
                  <ArrowRight size={18} />
                </button>
                <p className="small">
                  {apiKey
                    ? "AI review is ready after your third answer."
                    : "You can add an OpenRouter key after recording."}
                </p>
              </div>
            </div>
          </section>
        )}
        {screen === "interview" && session && stream && (
          <section className="interview-screen">
            <div className="session-progress">
              <span className="eyebrow">YOUR PRACTICE SESSION</span>
              <div>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={
                      i < session.answers.length
                        ? "done"
                        : i === session.answers.length
                          ? "current"
                          : ""
                    }
                  >
                    {i < session.answers.length ? <Check size={13} /> : i + 1}
                  </span>
                ))}
              </div>
              <button
                className="text-button"
                onClick={() => {
                  release();
                  setScreen("home");
                }}
              >
                Leave session
              </button>
            </div>
            <div className="question-heading">
              <span className="eyebrow">
                QUESTION {session.answers.length + 1} OF 3 ·{" "}
                {shortCategory(
                  session.questions[session.answers.length].category,
                )}
              </span>
              <h1>{session.questions[session.answers.length].text}</h1>
            </div>
            <Recorder
              key={`${session.id}-${session.answers.length}`}
              stream={stream}
              onComplete={recorded}
              onError={(message) => {
                setError(message);
                release();
                setScreen("home");
              }}
            />
            <p className="interview-footnote">
              <ShieldCheck size={14} /> No feedback between questions. Take this
              one at a time. Leaving keeps completed answers and discards the current recording.
            </p>
          </section>
        )}
        {screen === "review" && session && (
          <section className="review-screen">
            <div className="page-heading review-heading">
              <div>
                <span className="eyebrow">
                  YOUR SESSION ·{" "}
                  {new Date(session.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <h1>
                  {working
                    ? "A moment for reflection."
                    : completed === 3
                      ? "Your next step, a little clearer."
                      : "Three answers. A good start."}
                </h1>
                <p>
                  {working
                    ? "We’re reviewing the content and presentation of each answer."
                    : completed === 3
                      ? "Here’s what to keep, what to work on, and where to begin."
                      : completed > 0 ? `${completed} of 3 answers reviewed. The remaining answers need another review; your recordings are saved.` : "Your recordings are saved. Get a detailed review when you’re ready."}
                </p>
              </div>
              {!working && (
                <button
                  className="secondary"
                  onClick={() => {
                    nav("home");
                  }}
                >
                  Back to practice
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
            {working ? (
              <div className="review-status" role="status" aria-live="polite">
                <LoaderCircle className="spin" size={22} />
                <div>
                  <strong>{progress}</strong>
                  <p>Your recordings stay available if you need to retry.</p>
                </div>
                <span>{completed} / 3 reviewed</span>
                <button
                  className="text-button"
                  onClick={() => analysisAbort.current?.abort()}
                >
                  Stop review
                </button>
              </div>
            ) : (
              completed < 3 && (
                <div className="review-status">
                  <Sparkles size={24} />
                  <div>
                    <strong>
                      {completed
                        ? "Finish your session review"
                        : "Ready for a closer look?"}
                    </strong>
                    <p>
                      {healthError
                        ? "The local review service is not connected."
                        : !health
                          ? "Checking local transcription availability."
                          : !health.transcription.available
                            ? health.transcription.reason ||
                              "Local transcription is unavailable, so review cannot start."
                            : "AI review sends your transcript and selected frames to OpenRouter and its model provider. Your key stays in memory."}
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={
                      healthError || health?.transcription.available === false
                    }
                    onClick={() => analyse(session)}
                  >
                    {apiKey
                      ? completed
                        ? "Retry remaining answers"
                        : "Review my answers"
                      : "Add key & review"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )
            )}
            {!working && completed === 3 && session.answers.some(a => a.assessment?.score === undefined) && <div className="review-status">
              <div><strong>Your saved feedback can now include grades.</strong><p>Update all three answers for a clear grade, what worked, what needs work and how to improve.</p></div>
              <button className="primary" onClick={() => void analyse(session, undefined, true)}>Update all feedback <ArrowRight size={16} /></button>
            </div>}
            {!working && completed === 3 && session.sessionAssessment && <button className="text-button rereview-session" onClick={() => void analyse(session, undefined, true)}>Review all answers again</button>}
            {session.sessionAssessment && <SessionReview review={session.sessionAssessment} onEvidence={(answerIndex, timestamp) => {
              setSelectedAnswer(answerIndex);
              setEvidenceTarget({ answerIndex, timestamp, nonce: Date.now() });
            }} />}
            {completed === 3 && !working && !session.sessionAssessment && <div className="review-status">
              <div><strong>How did the whole session go?</strong><p>Get your overall answer grade, strengths and three priorities for your next solicitor interview practice.</p>
              {session.sessionReviewError && <p className="status-warning">{session.sessionReviewError}</p>}</div>
              <button className="primary" onClick={() => void gradeSession()}>Review whole session <ArrowRight size={16} /></button>
            </div>}
            <div className="session-overview" aria-label="Session feedback status">
              {session.answers.map((answer, i) => (
                <button key={i} onClick={() => { setSelectedAnswer(i); setEvidenceTarget(null); }} className={selectedAnswer === i ? "active" : ""}>
                  <span className="eyebrow">ANSWER {i + 1}</span>
                  <strong>{shortCategory(answer.question.category)}</strong>
                  <span className={answer.error || answer.assessment?.contentStatus === 'failed' || answer.assessment?.visualStatus === 'failed' ? 'status-warning' : 'muted'}>
                    {assessmentComplete(answer.assessment) ? "Feedback ready" : answer.assessment ? "Partial feedback · retry available" : answer.error ? "Review failed · recording saved" : "Waiting for review"}
                  </span>
                </button>
              ))}
            </div>
            <div
              className="answer-tabs"
              role="tablist"
              aria-label="Review an answer"
            >
              {session.answers.map((a, i) => (
                <button
                  role="tab"
                  aria-selected={selectedAnswer === i}
                  className={selectedAnswer === i ? "selected" : ""}
                  key={i}
                  onClick={() => { setSelectedAnswer(i); setEvidenceTarget(null); }}
                >
                  Answer {i + 1}
                  <span>{shortCategory(a.question.category)}</span>
                  {assessmentComplete(a.assessment) ? <Check size={14} /> : a.error ? <CircleHelp size={14} /> : null}
                </button>
              ))}
            </div>
            {session.answers[selectedAnswer] && (
              <AnswerReview
                key={selectedAnswer}
                seekTarget={evidenceTarget?.answerIndex === selectedAnswer ? evidenceTarget : undefined}
                reviewing={working}
                onReview={() => analyse(session, selectedAnswer)}
                answer={session.answers[selectedAnswer]}
                index={selectedAnswer}
              />
            )}
            <p className="review-disclaimer">
              Practice feedback, not a hiring prediction. Review the evidence
              and decide what helps you.
            </p>
          </section>
        )}
        {screen === "library" && (
          <section className="library-screen">
            <div className="page-heading">
              <span className="eyebrow">THE QUESTION BANK</span>
              <h1>A little less unexpected.</h1>
              <p>
                shout out to TCLA for these :)
              </p>
            </div>
            <div className="library-filters">
              <label className="search-box">
                <Search size={18} />
                <input
                  placeholder="Search questions…"
                  aria-label="Search questions"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Question category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="library-count">
              {filtered.length} questions · Original source numbering preserved
            </div>
            <div className="question-list">
              {filtered.map((q) => (
                <article key={q.id}>
                  <span className="library-number">
                    {q.id.padStart(2, "0")}
                  </span>
                  <div>
                    <span className="eyebrow">{q.category}</span>
                    <h3>{q.text}</h3>
                    <p>
                      Source page {q.sourcePage}
                      {!q.defaultEligible
                        ? " · Explore independently; not in the default session pool"
                        : ""}
                    </p>
                  </div>
                </article>
              ))}
              {filtered.length === 0 && (
                <p className="empty-search">
                  No questions match that search. Try a shorter phrase.
                </p>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>Small steps. Better answers.</span>
        <span>
          Built on open source{" "}
          <a
            href="/credits.html"
            target="_blank"
            rel="noreferrer"
          >
            Credits <ArrowUpRight size={12} />
          </a>
        </span>
      </footer>
      <Dialog.Root
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) { setConfirmDelete(false); pendingReview.current = null; }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="settings-dialog">
            <Dialog.Title>Make practice your own.</Dialog.Title>
            <Dialog.Description>
              Check your session format and connect feedback when you’re ready.
            </Dialog.Description>
            <Dialog.Close className="close-modal" aria-label="Close settings">
              <X size={20} />
            </Dialog.Close>
            <p className="small">Each question has a fixed {ANSWER_SECONDS}-second answer limit. Read at your own pace, then press Answer now for a 5-second countdown.</p>
            <p className="small">
              Only your latest session is saved on this device. Starting a new
              session replaces the previous one.
            </p>
            <div className="setup-divider" />
            <label>
              OpenRouter API key
              <input
                type="password"
                value={apiKey}
                placeholder="sk-or-…"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
            <p className="small">
              Used only for your review. Kept in this tab’s memory, never saved
              with recordings. Transcripts and selected frames are sent to
              OpenRouter and its model provider; usage is billed to your key.
            </p>
            <a
              className="inline-link"
              href="https://openrouter.ai/settings/keys"
              target="_blank"
              rel="noreferrer"
            >
              Get an OpenRouter key <ArrowUpRight size={14} />
            </a>
            <div
              className={`service-status ${health?.transcription.available ? "ready" : ""}`}
            >
              <span className="tiny-dot" />
              {health?.transcription.available
                ? "Local transcription ready"
                : healthError
                  ? "Review service unavailable"
                  : health
                    ? "Local transcription unavailable"
                    : "Checking local transcription…"}
            </div>
            {health && !health.transcription.available && (
              <p className="small">
                {health.transcription.reason ||
                  "Local transcription is unavailable, so answer review is disabled."}
              </p>
            )}
            {session && (
              <>
                <div className="setup-divider" />
                {confirmDelete ? (
                  <div role="group" aria-label="Confirm session deletion">
                    <p className="small">
                      Delete the saved recordings, camera frames, transcripts,
                      and feedback from this browser? This cannot be undone.
                    </p>
                    <button
                      className="secondary"
                      type="button"
                      disabled={working || screen === "interview" || deletingSession}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Keep session
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={working || screen === "interview" || deletingSession}
                      onClick={() => void deleteCurrentSession()}
                    >
                      {deletingSession ? "Deleting…" : "Delete permanently"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="secondary"
                    type="button"
                    disabled={working || screen === "interview" || deletingSession}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete saved session
                  </button>
                )}
              </>
            )}
            <button
              className="primary"
              onClick={() => {
                const pending = pendingReview.current;
                pendingReview.current = null;
                setSettingsOpen(false);
                if (screen === "review" && session && apiKey.trim() && pending) {
                  if (pending.kind === 'session') void gradeSession();
                  else void analyse(session, pending.onlyIndex, pending.refreshAll);
                }
              }}
            >
              {pendingReview.current ? "Save & review answers" : "Done"}
              <Check size={17} />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
