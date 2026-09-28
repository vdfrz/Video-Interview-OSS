# Onboard your AI agent

Use the first prompt to run the app. Use the second when you want to change it. Both are designed for a coding agent with terminal and local browser access.

## Get the app running

```text
Set up https://github.com/vdfrz/Video-Interview-OSS locally for me.

1. Clone the repo if needed. Read README.md, architecture.md, AGENTS.md,
   CONTRIBUTING.md, and docs/COACHING_RUBRIC.md. Preserve any existing work.
2. Check Node.js 24, Python 3.10 or newer, and ffmpeg. Use npm ci. Create
   .venv and install requirements.txt there. Set TRANSCRIBE_PYTHON to its
   interpreter in the shell that starts the app. Set FFMPEG_PATH if needed.
   The application does not automatically load a .env file.
3. Run npm test and npm run build. Start npm run dev, check the local
   /api/health response, and open http://127.0.0.1:4310. Diagnose missing
   dependencies honestly; a successful build does not prove transcription.
4. Explain the three-question flow: untimed reading, five-second countdown,
   up to 60 seconds per answer, and feedback after the final answer.
5. Let me enter my own OpenRouter key directly in Settings. Never ask for
   it in chat, put it in source, print it, or save it to a config file.
   Explain that transcripts and selected stills go to OpenRouter/providers,
   while raw recordings are sent only to the local transcription service.
6. Do not access my real camera, microphone, saved recordings, transcripts,
   or browser session for automated verification. Use empty screens or
   clearly synthetic fixtures. The optional development audio fixture is
   intentionally absent from the public repo; do not substitute my media.
7. Keep all services bound to loopback. Do not publish or deploy. Finish
   with the local URL, checks that passed, missing dependencies, and the
   next step I should take for a real session. Do not claim live AI feedback
   works unless a real, authorized request has completed successfully.
```

## Make a change

Replace the bracketed sentence with the behavior you want:

```text
Work in my Video Interview OSS checkout. My requested change is:
[Describe the behavior, affected screen, and expected result.]

Read AGENTS.md, architecture.md, and the relevant source/tests first.
Explain the smallest coherent implementation and preserve unrelated work.
Keep the existing product timing and privacy boundaries unless my request
explicitly changes them. Preserve server-owned question/rubric lookup,
strict schemas, evidence IDs, partial-result recovery, and safe errors.
Do not add fabricated feedback, hidden model fallbacks, personality or
hiring scores, or automatic uploads of recordings.

Implement the change and run relevant tests plus the build. For UI work,
inspect the actual browser using an empty or synthetic session. Report
what was verified and distinguish mocked responses from live provider
results. Never commit recordings, keys, private screenshots, transcripts,
local review notes, or the optional audio fixture. Before any authorized
commit, review the exact staged diff and run npm run check:publish.
Do not push, deploy, or spend API credits unless I ask for that work.
```

## Where to start reading

| Task | Start here |
|---|---|
| Setup and operations | `README.md`, `package.json`, `server/transcription.ts` |
| Session flow or settings | `src/App.tsx`, `src/lib/session.ts` |
| Timing and capture | `src/lib/timing.ts`, `src/components/Recorder.tsx`, `src/lib/capture.ts` |
| Feedback UI and playback | `src/components/SessionReview.tsx`, `src/components/AnswerReview.tsx` |
| Analysis or scoring | `server/schema.ts`, `server/assessment.ts`, `server/session-assessment.ts` |
| Question bank or domain | `src/data/questions.ts`, `Practice_Interview_Question_Bank.md`, `server/rubric.ts` |
| Publish hygiene | `.gitignore`, `scripts/check-publish.mjs`, `docs/screenshots/README.md` |

## First-session acceptance

A person should explicitly initiate camera access, record three answers, review their playback, and enter a key only if they want paid external feedback. A full provider review should produce evidence-linked answer feedback and a session report. Missing credentials, unavailable models, and malformed responses should produce clear errors while preserving the recordings.

A unit-test pass, a ready health response, and an empty-screen screenshot each establish different things. None alone proves that a real interview session completed or that the coaching is accurate.
