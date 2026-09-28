import { useEffect, useRef, useState } from 'react';
import { Camera, CircleHelp, Download, Play, RotateCcw } from 'lucide-react';
import { clockTime, type Answer } from '../lib/session';

export default function AnswerReview({ answer, index, reviewing, onReview, seekTarget }: {
  answer: Answer; index: number; reviewing: boolean; onReview: () => void; seekTarget?: { timestamp: number; nonce: number };
}) {
  const [url, setUrl] = useState('');
  const [section, setSection] = useState<'content' | 'camera'>('content');
  const [moment, setMoment] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const a = answer.assessment;
  const strengths = a?.strengths.length ? a.strengths : [...new Set(a?.criteria.map(c => c.whatWorked).filter((text): text is string => !!text) || [])].slice(0, 2);
  useEffect(() => {
    const next = URL.createObjectURL(answer.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [answer.blob]);
  const seek = (timestamp: number) => {
    if (!video.current) return;
    video.current.currentTime = timestamp;
    video.current.pause();
    setMoment(timestamp);
    video.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };
  useEffect(() => {
    if (seekTarget && video.current?.readyState) seek(seekTarget.timestamp);
  }, [seekTarget?.nonce, url]);
  return <div className="answer-review">
    <div className="answer-heading">
      <span className="eyebrow">QUESTION {index + 1} · {answer.question.category}</span>
      <h2>{answer.question.text}</h2>
    </div>
    <div className="review-columns">
      <div className="replay-column">
        <video aria-label={`Answer ${index + 1} recording`} controls playsInline onLoadedMetadata={() => { if (seekTarget) seek(seekTarget.timestamp); }} src={url || undefined} ref={video} className="replay" />
        <div className="replay-meta"><span>{clockTime(answer.duration)} recorded</span><a href={url} download={`answer-${index + 1}.${answer.blob.type.includes('mp4') ? 'mp4' : 'webm'}`}><Download size={14} /> Save recording</a></div>
        {moment !== null && <p className="moment-status" role="status">Paused at {clockTime(moment)}. Press play to see what happens around this moment.</p>}
        {answer.transcript && <details className="transcript"><summary>Read your transcript</summary>
          <p className="muted">Automatic transcript. Check the recording if a word looks wrong.</p>
          {answer.transcript.segments.map((s, i) => <p key={i}><button onClick={() => seek(s.start)}>{clockTime(s.start)}</button> {s.text}</p>)}
        </details>}
      </div>
      <div className="feedback-column">
        <div className="feedback-switch" role="tablist" aria-label="Feedback type">
          <button role="tab" aria-selected={section === 'camera'} onClick={() => setSection('camera')}><Camera size={16} /> On camera</button>
          <button role="tab" aria-selected={section === 'content'} onClick={() => setSection('content')}>Answer content</button>
        </div>
        {a && answer.error && <p className="feedback-error" role="status">Some feedback could not be updated: {answer.error} Previous feedback has been kept.</p>}
        {!a ? <div className="empty-feedback"><CircleHelp /><h3>{answer.error ? 'Review failed; your recording is safe' : reviewing ? 'Awaiting feedback' : 'Your answer is ready for review'}</h3><p>{answer.error || (reviewing ? 'Completed feedback will appear here.' : 'Use Review my answers above to begin.')}</p></div>
        : section === 'camera' ? <section aria-label="Camera feedback">
          <h3 className="section-title">See the moment. Know what to change.</h3>
          <p className="sampling-note">Select a moment to see it in your recording. These observations use sampled frames, so replay the clip to check the surrounding movement.</p>
          {a.visualStatus === 'failed' && <p className="feedback-error" role="status">Camera review failed: {a.visualError} Your content feedback is still available.</p>}
          {a.visualObservations.map((v, i) => {
            const frame = answer.frames.find(f => Math.abs(f.timestamp - v.timestamp) < 0.05);
            return <article className="camera-moment" key={i}>
              <button className="moment-link" onClick={() => seek(v.timestamp)} aria-label={`Show camera moment at ${clockTime(v.timestamp)}`}>
                {frame && <img src={frame.dataUrl} alt={`Sampled recording frame at ${clockTime(v.timestamp)}`} />}
                <span><Play size={13} /> {clockTime(v.timestamp)} · Show in clip</span>
              </button>
              <div className="moment-copy"><span className="note-label">What’s visible</span><p>{v.observation}</p>
                {v.why && <><span className="note-label">Why it matters</span><p>{v.why}</p></>}
                <span className="note-label good">Try this</span><p>{v.suggestion}</p>
              </div>
            </article>;
          })}
          {!a.visualObservations.length && a.visualStatus !== 'failed' && <p className="empty-feedback">{a.visualStatus === 'not_requested' ? 'No camera frames were available for this recording.' : 'No specific visual observations were supported by these frames. This does not mean every moment was reviewed or that your presentation was perfect.'}</p>}
          {a.visualObservations.some(v => !v.why) && <p className="sampling-note">This saved review uses the older feedback format. Review this answer again for explanations alongside each observation.</p>}
        </section> : <section aria-label="Content feedback">
          {a.contentStatus === 'failed' ? <p className="feedback-error" role="status">Content review failed: {a.contentError} Camera feedback is still available.</p> : <>
            <div className="answer-grade"><div><span className="eyebrow">ANSWER {index + 1} · PRACTICE GRADE</span><h3>{typeof a.score === 'number' ? <>{a.score}<small> / 10</small></> : a.score === null ? 'Not enough evidence' : 'Grade available on re-review'}</h3></div><p>Quality of this answer, not a hiring prediction.</p></div>
            <p className="answer-summary">{a.summary}</p>
            <div className="priority-actions"><h3>Try in your next answer</h3><ol>{a.improvements.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
            <div className="answer-strengths"><h3>What worked</h3>{strengths.length > 0 ? <ul>{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p>No clear content strength was supported in this attempt. Focus on the next steps above.</p>}</div>
            <section className="criteria-breakdown"><h3>How your answer was graded</h3>
              {a.criteria.map((c, i) => <div className="criterion" key={i}><div className="criterion-header"><h4>{c.name}</h4><span className={`rating ${c.rating}`}>{typeof c.score === 'number' ? `${c.score}/10 · ` : ''}{c.rating.replaceAll('_', ' ')}</span></div>
                {c.whatWorked && <div className="criterion-explained"><strong>What worked</strong><p>{c.whatWorked}</p></div>}
                {c.whatToImprove && <div className="criterion-explained"><strong>What needs work & how to improve</strong><p>{c.whatToImprove}</p></div>}
                <div className="criterion-explained"><strong>Why</strong><p>{c.feedback}</p></div>
                {c.evidence.map((e, j) => <button className="evidence" onClick={() => seek(e.timestamp)} key={j}><Play size={12} /><strong>{clockTime(e.timestamp)}</strong><span>“{e.quote}”</span></button>)}
              </div>)}
            </section>
            <details className="feedback-detail"><summary>Speaking pace & transcript notes</summary><p>{a.delivery.summary}</p><div className="delivery-metrics"><span><strong>{Math.round(a.delivery.wordsPerMinute)}</strong> words / minute</span><span><strong>{a.delivery.pauseCount}</strong> pauses detected</span></div><p className="sampling-note">Estimated from transcription and timing, not a judgement of your voice or tone.</p></details>
          </>}
        </section>}

        {!reviewing && <button className="text-button review-again" onClick={onReview}><RotateCcw size={14} /> {a ? 'Review this answer again' : answer.error ? 'Retry this answer' : 'Review this answer'}</button>}
      </div>
    </div>
  </div>;
}
