import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assess, ApiError } from './assessment.ts';
import { APPROVED_MODELS, DEFAULT_MODEL, ANALYSIS_MODELS } from './schema.ts';
import { COACHING_RUBRIC_METADATA } from './coaching.ts';
import { assessSession } from './session-assessment.ts';
import { transcriptionAvailability, transcribeRecording } from './transcription.ts';

export function createApp(dependencies: {
  assess?: typeof assess;
  transcribe?: typeof transcribeRecording;
  availability?: typeof transcriptionAvailability;
  sessionAssess?: typeof assessSession;
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Browser requests must originate from this local app. No permissive CORS.
  app.use((req, res, next) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(req.headers.host ?? '')) {
      return next(new ApiError(421, 'HOST_DENIED', 'Access this service through localhost or 127.0.0.1.'));
    }
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):(4310|4311|5173)$/.test(origin)) {
      return next(new ApiError(403, 'ORIGIN_DENIED', 'Only the local practice app may access this service.'));
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '14mb' }));
  app.get('/api/health', async (_req, res, next) => {
    try { res.json({ ok: true, transcription: await (dependencies.availability ?? transcriptionAvailability)(),
      models: APPROVED_MODELS, defaultModel: DEFAULT_MODEL,
      analysisModels: ANALYSIS_MODELS, rubric: COACHING_RUBRIC_METADATA }); } catch (error) { next(error); }
  });
  let transcriptions = 0;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024,
    files: 1, fields: 0, parts: 1 } }).single('recording');
  app.post('/api/transcribe', (req, res, next) => {
    if (transcriptions >= 3) return next(new ApiError(429, 'TRANSCRIPTION_BUSY', 'Three recordings are already processing. Retry when one finishes.'));
    transcriptions++;
    upload(req, res, async error => {
      try {
        if (error) throw error;
        if (!req.file?.buffer?.length) throw new ApiError(400, 'RECORDING_REQUIRED', 'Upload the recording using multipart field recording.');
        const transcript = await (dependencies.transcribe ?? transcribeRecording)(req.file.buffer);
        res.json(transcript);
      } catch (error) { next(error); }
      finally { transcriptions--; }
    });
  });
  let assessments = 0;
  app.post('/api/assess', async (req, res, next) => {
    if (assessments >= 3) return next(new ApiError(429, 'ASSESSMENT_BUSY', 'Three assessments are already running. Retry when one finishes.'));
    assessments++;
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
      const result = await (dependencies.assess ?? assess)(req.body, { signal: controller.signal });
      if (!controller.signal.aborted) res.json(result);
    }
    catch (error) { if (!controller.signal.aborted) next(error); }
    finally { res.off('close', onClose); assessments--; }
  });
  app.post('/api/session-assess', async (req, res, next) => {
    if (assessments >= 3) return next(new ApiError(429, 'ASSESSMENT_BUSY', 'Three assessments are already running. Retry when one finishes.'));
    assessments++;
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
      const result = await (dependencies.sessionAssess ?? assessSession)(req.body, { signal: controller.signal });
      if (!controller.signal.aborted) res.json(result);
    } catch (error) { if (!controller.signal.aborted) next(error); }
    finally { res.off('close', onClose); assessments--; }
  });
  if (process.env.NODE_ENV === 'production') {
    const dist = fileURLToPath(new URL('../dist', import.meta.url));
    if (existsSync(join(dist, 'index.html'))) {
      app.use(express.static(dist));
      app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
    }
  }
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'API route not found.')));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) return res.status(error.status).json({ error: {
      code: error.code, message: error.message,
      ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
    } });
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: {
        code: 'INVALID_UPLOAD', message: 'Upload one recording, at most 100 MB, in the recording field.' } });
    }
    const parserError = error as { type?: string };
    if (parserError?.type === 'entity.too.large' || parserError?.type === 'entity.parse.failed') {
      return res.status(parserError.type === 'entity.too.large' ? 413 : 400).json({ error: {
        code: 'INVALID_JSON', message: 'The request JSON is malformed or too large.' } });
    }
    // Deliberately do not print errors: they could contain API keys or recordings.
    return res.status(500).json({ error: { code: 'ANALYSIS_FAILED', message: 'Analysis failed. Your recording is preserved; retry when ready.' } });
  });
  return app;
}
export const app = createApp();
