# Third-party notices

## TCLA question bank

Thanks to [TCLA, The Corporate Law Academy](https://www.thecorporatelawacademy.com/), for the *Practice Interview Question Bank*. The supplied reference contains 200 numbered questions and one unnumbered prompt. Original numbering and category/page references are retained in `Practice_Interview_Question_Bank.md` and `src/data/questions.ts`.

The question text is third-party reference material and is not covered by this repository's MIT license for original application code. This repository does not grant separate rights to the TCLA material. The original PDF is not included. This project is independent and does not imply TCLA sponsorship, endorsement, or an official marking scheme.

## Recorder

The recorder lifecycle adapts `react-video-recorder` 3.17.1, originally encountered through `one-way-interview-practice`. The full MIT notice and adaptation details are retained in [docs/RECORDER_REUSE.md](docs/RECORDER_REUSE.md). The original practice-app notice is in [public/licenses/one-way-interview-practice.txt](public/licenses/one-way-interview-practice.txt).

## Transcription

The word-gap splitter in `server/vendor/tips/segmentation.py` and adapted transcription settings originate from [Crimson-Genesis/TIPS](https://github.com/Crimson-Genesis/TIPS), commit `6ac7b6b10ae13deb4cec80b9ef334196e3d6f58b`, under its [MIT license](server/vendor/tips/LICENSE). See [docs/ANALYSIS_REUSE.md](docs/ANALYSIS_REUSE.md).

A separate video-analysis project was inspected during development but no code from it was adopted. Its retained inspection notice in `server/vendor/PRVIA-LICENSE` does not mean this app uses its models or hiring/personality analysis.

## Dependencies and services

React, Vite, Express, Radix Dialog, Lucide, Zod, faster-whisper, and other dependencies retain their respective licenses. ffmpeg is installed separately and has its own build-dependent license terms. OpenRouter and its providers are external services with separate terms and costs. Google Fonts are requested by the UI stylesheet. These notices do not replace the licenses shipped with dependencies.
