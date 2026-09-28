import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcriptSchema } from './schema.ts';
import { ApiError } from './assessment.ts';

const execute = promisify(execFile);
const localPython = fileURLToPath(new URL('../.venv/bin/python', import.meta.url));
const watchPython = join(homedir(), '.local/share/uv/tools/watch-skill/bin/python');
let cachedHealth: { expires: number; result: Awaited<ReturnType<typeof checkAvailability>> } | undefined;
async function checkAvailability() {
  let python: string | undefined;
  const candidates = process.env.TRANSCRIBE_PYTHON ? [process.env.TRANSCRIBE_PYTHON] : [localPython, 'python3', watchPython];
  for (const candidate of candidates) {
    try {
      await execute(candidate, ['-c', 'import faster_whisper; print("ready")'], { timeout: 10_000, maxBuffer: 1024 });
      python = candidate;
      break;
    } catch { /* Availability reports dependencies, never substitutes a cloud service. */ }
  }
  let ffmpeg: string | undefined;
  try {
    const candidate = process.env.FFMPEG_PATH ?? 'ffmpeg';
    await execute(candidate, ['-version'], { timeout: 5000, maxBuffer: 16_384 });
    ffmpeg = candidate;
  } catch { /* Missing dependencies remain explicit. */ }
  return { available: Boolean(python && ffmpeg), python: python ?? null, ffmpeg: ffmpeg ?? null,
    model: 'base', localOnly: true,
    ...(!python || !ffmpeg ? { reason: 'Local faster-whisper Python and ffmpeg are required. Set TRANSCRIBE_PYTHON if needed.' } : {}),
    note: 'The first use may download the base model weights. Recordings are processed locally.' };
}
export async function transcriptionAvailability() {
  if (cachedHealth && cachedHealth.expires > Date.now()) return cachedHealth.result;
  const result = await checkAvailability();
  cachedHealth = { expires: Date.now() + 30_000, result };
  return result;
}

// Process only one local ASR model at a time. The endpoint bounds waiting requests.
let queue = Promise.resolve();
export async function transcribeRecording(recording: Buffer) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  let directory: string | undefined;
  try {
    const health = await transcriptionAvailability();
    if (!health.available || !health.python) throw new ApiError(503, 'TRANSCRIPTION_UNAVAILABLE', health.reason ?? 'Local transcription is unavailable.');
    directory = await mkdtemp(join(tmpdir(), 'tcla-recording-'));
    const recordingPath = join(directory, 'recording');
    await writeFile(recordingPath, recording, { mode: 0o600 });
    const script = fileURLToPath(new URL('../scripts/transcribe.py', import.meta.url));
    await access(script);
    const { stdout } = await execute(health.python, [script, recordingPath], {
      timeout: 300_000, maxBuffer: 2_000_000, env: { ...process.env, FFMPEG_PATH: health.ffmpeg ?? 'ffmpeg' },
    });
    return transcriptSchema.parse(JSON.parse(stdout));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, 'TRANSCRIPTION_FAILED', 'Local transcription failed. Check that the recording contains audible speech and the base model is available. Your browser recording is preserved.');
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }); }
    finally { release(); }
  }
}
