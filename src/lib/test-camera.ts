/** Development-only fixture. It synthesizes video locally and plays a bundled
 * synthetic answer; it never accesses a real camera or microphone. */
export async function createTestCamera(): Promise<MediaStream> {
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the synthetic test camera.');
  let frame = 0;
  const draw = () => {
    context.fillStyle = '#214f42'; context.fillRect(0, 0, 960, 540);
    context.fillStyle = '#c0d0a6'; context.font = '30px sans-serif';
    context.fillText('GENERATED TEST CAMERA', 260, 220);
    context.font = '18px sans-serif';
    context.fillText('Synthetic spoken interview answer is looping.', 280, 265);
    context.fillText('No real camera or microphone is being used.', 280, 295);
    context.fillStyle = '#f8f9ef'; context.beginPath();
    context.arc(180 + (frame++ % 580), 360, 12, 0, Math.PI * 2); context.fill();
  };
  draw();
  const interval = window.setInterval(draw, 100);
  const stream = canvas.captureStream(10);
  const audioContext = new AudioContext();
  let source: AudioBufferSourceNode | null = null;
  let sourceStarted = false;
  let cleanedUp = false;

  try {
    // Request audio playback before the first network/file await so browsers
    // can associate resume() with the user's click that starts the fixture.
    const resumed = audioContext.resume();
    // Keep this as a development-server URL instead of a static asset import:
    // Vite must not copy the private test fixture into a production build.
    const response = await fetch('/src/lib/dev-assets/synthetic-interview-answer.wav');
    if (!response.ok) throw new Error('The synthetic interview answer audio could not be loaded.');
    const audioBuffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    await resumed;

    const output = audioContext.createMediaStreamDestination();
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(output);
    output.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    source.start();
    sourceStarted = true;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.clearInterval(interval);
      if (source && sourceStarted) {
        try { source.stop(); } catch { /* It may have ended during context shutdown. */ }
      }
      void audioContext.close();
    };

    stream.getTracks().forEach((track) => {
      const originalStop = track.stop.bind(track);
      track.stop = () => {
        cleanup();
        originalStop();
      };
    });
    return stream;
  } catch (error) {
    window.clearInterval(interval);
    if (source && sourceStarted) {
      try { source.stop(); } catch { /* The source may not have started yet. */ }
    }
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext.state !== 'closed') await audioContext.close();
    throw error;
  }
}
