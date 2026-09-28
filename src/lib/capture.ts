/** One JPEG still captured from the unmirrored camera stream. */
export type CapturedFrame = {
  /** Seconds since answer recording began. */
  timestamp: number;
  dataUrl: string;
};

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4',
];

/** Pick a format supported by the current browser, including Safari's MP4 option. */
export function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Construct a recorder using an explicitly supported MIME type when available. */
export function createStreamRecorder(stream: MediaStream): MediaRecorder {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video recording is not supported by this browser.');
  }

  const mimeType = getSupportedRecordingMimeType();
  return mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
}

/**
 * Capture a compact JPEG from the raw video pixels. CSS mirroring on the preview
 * does not affect drawImage, so saved frames keep the camera's natural orientation.
 */
export function captureFrame(
  video: HTMLVideoElement,
  timestamp: number,
): CapturedFrame | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const maxDimension = 640;
  const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare a camera frame for capture.');

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    timestamp,
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
  };
}
