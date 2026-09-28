# Contributing

Start with the [README](README.md), [architecture](architecture.md), and [agent onboarding guide](docs/AI_AGENT_ONBOARDING.md). Keep changes focused and explain the user-visible behavior they address.

## Local checks

Use Node.js 24 and install dependencies with `npm ci`. Python and ffmpeg are needed for actual transcription, but the unit tests use controlled dependencies/provider responses.

```bash
npm test
npm run build
# Stage only the source/docs you intend to publish, then:
npm run check:publish
```

For UI changes, inspect the affected flow in a real browser using empty screens or synthetic inputs. For provider changes, explain which model calls were actually tested and which responses were fixtures. Preserve explicit errors rather than introducing fake success.

## A safe contribution

- Never include API keys, environment files, recordings, camera frames, transcripts, saved session exports, or personal QA screenshots in an issue or pull request.
- Use invented examples when reproducing a bug. Describe failures using safe error codes rather than raw provider request/response dumps.
- New screenshot files need explicit review and an update to the allowlist. Existing screenshot names are not permission to replace them with private content.
- Inspect `git diff --cached` before committing. The publish script examines Git's index, including force-added files; it is a guard, not a complete secret scanner.
- Keep code attribution and licenses intact. The TCLA question bank is third-party reference content, separate from the application code license.

A useful pull request states the problem, the change, how it was verified, and any remaining limitations. Include only safe product screenshots when they help explain a UI change.

## Dependency status

At initial publication, `npm audit` reports a moderate-severity path-traversal advisory in the development-only Vitest / `@vitest/mocker` toolchain. The app does not serve Vitest as part of its runtime. Updating the test runner to a patched major version remains separate maintenance work; the lockfile has not been force-upgraded.
