import type { SessionAssessment } from "../lib/session";
import "./SessionReview.css";

type Rating = SessionAssessment["overallRating"];
type Evidence = SessionAssessment["areas"][number]["evidence"][number];

type SessionReviewProps = {
  review: SessionAssessment;
  onEvidence: (answerIndex: number, timestamp: number) => void;
};

const ratingLabels: Record<Rating, string> = {
  strong: "Strong",
  developing: "Developing",
  needs_work: "Needs work",
  not_assessable: "Not enough evidence",
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function EvidenceLink({
  evidence,
  onEvidence,
}: {
  evidence: Evidence;
  onEvidence: SessionReviewProps["onEvidence"];
}) {
  const cameraObservation = evidence.kind === "camera";
  return (
    <button
      className={`session-review__evidence${cameraObservation ? " is-camera" : ""}`}
      type="button"
      onClick={() => onEvidence(evidence.answerIndex, evidence.timestamp)}
      aria-label={`${cameraObservation ? "Camera observation" : "Transcript evidence"}, answer ${evidence.answerIndex + 1} at ${formatTime(evidence.timestamp)}`}
    >
      <span className="session-review__evidence-meta">
        <span>{cameraObservation ? "Camera observation" : `Answer ${evidence.answerIndex + 1}`}</span>
        <time>{formatTime(evidence.timestamp)}</time>
      </span>
      <span className="session-review__evidence-text">
        {cameraObservation ? evidence.quote : `“${evidence.quote}”`}
      </span>
      <span className="session-review__evidence-action">View moment</span>
    </button>
  );
}

export default function SessionReview({
  review,
  onEvidence,
}: SessionReviewProps) {
  const isCameraArea = (area: SessionAssessment["areas"][number]) =>
    area.name.toLowerCase().includes("camera") ||
    (area.evidence.length > 0 && area.evidence.every((e) => e.kind === "camera"));
  const orderedAreas = [
    ...review.areas.filter((area) => !isCameraArea(area)),
    ...review.areas.filter(isCameraArea),
  ];

  return (
    <section className="session-review" aria-labelledby="session-review-title">
      <div className="session-review__overview">
        <div className="session-review__overview-heading">
          <div>
            <span className="eyebrow">ACROSS YOUR THREE ANSWERS</span>
            <h2 id="session-review-title">Your overall grade</h2>
          </div>
          <div className={`session-review__score is-${review.overallRating}`}>
            <span>Answer quality</span>
            <strong>
              {review.overallScore == null ? "—" : review.overallScore}
              <small>/10</small>
            </strong>
            <span className="session-review__score-label">
              {ratingLabels[review.overallRating]}
            </span>
          </div>
        </div>
        <p className="session-review__summary">{review.summary}</p>
        <p className="session-review__rating-note">
          Average of relevance, examples and reasoning, and structure. Camera presentation is graded separately.
        </p>
      </div>

      <section className="session-review__priorities" aria-labelledby="session-review-priorities">
        <span className="eyebrow">WHAT TO TRY NEXT</span>
        <h3 id="session-review-priorities">Three useful next steps</h3>
        <ol>
          {review.priorities.map((priority, index) => (
            <li key={`${index}-${priority}`}>
              <span className="session-review__priority-number">0{index + 1}</span>
              <p>{priority}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="session-review__areas" aria-labelledby="session-review-areas">
        <div className="session-review__section-heading">
          <div>
            <span className="eyebrow">THE REASONS</span>
            <h3 id="session-review-areas">What worked and what to build</h3>
          </div>
          <p>Open a note to see its evidence.</p>
        </div>
        <div className="session-review__area-list">
          {orderedAreas.map((area, index) => (
            <details
              className={`session-review__area${isCameraArea(area) ? " is-camera" : ""}`}
              key={`${index}-${area.name}`}
            >
              <summary>
                <span className="session-review__area-title">
                  <span className="session-review__area-name">{area.name}</span>
                  {isCameraArea(area) && (
                    <span className="session-review__camera-label">Camera note</span>
                  )}
                  <span className={`session-review__area-rating is-${area.rating}`}>
                    {area.score == null ? ratingLabels[area.rating] : `${area.score}/10`}
                  </span>
                </span>
                <span className="session-review__area-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="session-review__area-content">
                <div className="session-review__area-feedback">
                  {area.whatWorked && (
                    <section>
                      <h4>What worked</h4>
                      <p>{area.whatWorked}</p>
                    </section>
                  )}
                  {area.whatToImprove && (
                    <section>
                      <h4>What needs work & how to improve</h4>
                      <p>{area.whatToImprove}</p>
                    </section>
                  )}
                  <section>
                    <h4>Why</h4>
                    <p>{area.feedback}</p>
                  </section>
                </div>
                {area.evidence.length > 0 ? (
                  <div className="session-review__evidence-list">
                    {area.evidence.map((evidence, evidenceIndex) => (
                      <EvidenceLink
                        key={`${evidence.answerIndex}-${evidence.timestamp}-${evidenceIndex}`}
                        evidence={evidence}
                        onEvidence={onEvidence}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="session-review__no-evidence">
                    No specific moment could be linked to this note.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>


    </section>
  );
}
