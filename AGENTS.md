# Working on Video Interview OSS

Read README.md and architecture.md before changing the app. See docs/AI_AGENT_ONBOARDING.md for setup and task prompts.

- Use Node.js 24 and the existing React/TypeScript/Express/Python stack. Preserve unrelated edits.
- Keep the default session at three questions, untimed reading, a five-second countdown, and a 60-second recording cap unless the user explicitly changes the product flow.
- Keep services on loopback. Public hosting requires a separate security and product design.
- Keys belong in the app's in-memory Settings field. Do not ask for keys in chat, store them, log them, or embed them in screenshots.
- Do not inspect, copy, commit, or upload personal recordings, frames, transcripts, saved browser sessions, or private QA notes for automated testing. Use empty screens or clearly synthetic inputs.
- Preserve server-owned rubrics, strict validation, deterministic evidence timestamps/quotes, explicit failures, and successful partial results. Do not add fake feedback, hidden fallbacks, or a model repair pass.
- Maintain the TCLA question-bank credit and existing third-party code licenses. Do not imply official TCLA scoring or endorsement.
- Run relevant tests and npm run build. Distinguish unit-test fixtures from actual local/provider runs in your report.
- Before an authorized commit or push, inspect the exact staged files and run npm run check:publish. Never use git add -f to bypass private-file exclusions. Only the individually reviewed product screenshots under docs/screenshots are approved binary assets, including the existing anonymized feedback views. Do not expand that exception to raw recordings or other personal content.
