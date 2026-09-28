# Recorder reuse and attribution

This recorder adapts the recording lifecycle used by the supplied
[`one-way-interview-practice`](https://github.com/Dinesh-Kalamegam/one-way-interview-practice)
project. Its `src/components/QuestionPage.js` imports `react-video-recorder`, passes
the selected countdown and answer time limit to that component, and shows the
preview/replay controls. The project is MIT licensed (copyright Dinesh Kalamegam,
2021); its original license remains in that repository.

The actual recorder implementation is the MIT-licensed
[`react-video-recorder` 3.17.1](https://github.com/fbaiodias/react-video-recorder),
which the supplied project lists as a dependency. This app adapts these exact
implementation areas from its published `lib/video-recorder.js`:

- MIME selection in `getMimeType` (lines 217–222): choose a browser-supported
  recording format before constructing `MediaRecorder`.
- `handleStartRecording` and `startRecording` (lines 319–380): transition from
  the countdown into recording, attach data/stop/error handlers, start with a
  timeslice, and schedule the answer time limit.
- `handleStop` (lines 389–420): assemble the collected chunks into a `Blob` and
  report the measured recording duration after the recorder stops.

The adaptation is in `src/lib/capture.ts` and `src/components/Recorder.tsx`.
It receives the already-open `MediaStream` from its parent, uses a 1-second
timeslice, and keeps the parent responsible for stopping shared tracks. The
React component adds preparation and recording controls, periodic JPEG frame
capture, a muted mirrored preview, and cleanup for timers and recorder state.
Frame capture starts at the beginning and includes a final sample. It uses a
two-second cadence for shorter answers, stretches the cadence across longer
answers to keep the first and final moments within the 32-frame cap, and saves
frames at their natural unmirrored orientation. Result duration and frame
timestamps are seconds. An ended camera or microphone track reports an error;
the component does not stop parent-owned tracks.

This is an adaptation, not a verbatim copy of the package component. The package
itself is not installed as an app dependency because it acquires and stops its
own camera stream, while this app's parent owns the stream lifecycle.

The adapted implementation is distributed under the package's MIT terms:

> MIT License
>
> Copyright (c) 2019 Francisco Baio Dias
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

Current timing: reading is untimed. Answer now begins a five-second visual countdown without capturing an answer. The recorder then starts a fixed 60-second timer and stops automatically, or the user may finish earlier. Timing choices from old saved sessions cannot override these constants.
