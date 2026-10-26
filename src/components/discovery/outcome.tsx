import { ArrowDownToLine, Clock, Users } from "lucide-react";
import type { Task } from "@/core/contracts";

export function DiscoveryOutcome({ task }: { task: Task }) {
  const artifact = task.artifacts.find(
    (item) => item.id === "main" && item.freshness === "current",
  );
  const details = artifact?.details;
  const isProgramme = task.brief.kind === "gathering";

  if (!artifact || (!details && !isProgramme && !artifact.edited)) {
    return null;
  }

  const segments =
    details?.segments.map((segment) => ({
      label:
        task.candidates.find(
          (candidate) => candidate.id === segment.candidateId,
        )?.name || "A selected reference",
      minutes: segment.minutes,
      day: segment.day,
    })) ?? task.schedule.map((segment) => ({ ...segment, day: 1 }));

  return (
    <section
      className={`ig-outcome ig-outcome-${details?.kind || "gathering"}`}
    >
      <div className="ig-outcome-heading">
        <div>
          <span className="ig-eyebrow">
            {details?.kind.replace("-", " ") || "YOUR EVENING, TAKING SHAPE"}
          </span>
          <h2>{artifact.title}</h2>
        </div>
        <a
          href={`/api/tasks/${task.id}/export?format=markdown&version=${task.brief.version}`}
          download
        >
          <ArrowDownToLine size={17} /> Export
        </a>
      </div>
      {isProgramme && (
        <div className="ig-people">
          <Users size={17} />
          {task.brief.participants.map((participant) => (
            <span key={participant.id}>
              {participant.name}
              {participant.sample && <small>sample</small>}
            </span>
          ))}
        </div>
      )}
      {segments.length > 0 && (
        <ol className="ig-timeline">
          {segments.map((segment, index) => (
            <li key={`${index}:${segment.label}`}>
              <span className="ig-timeline-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                {details?.kind === "itinerary" && (
                  <small>Day {segment.day}</small>
                )}
                <h3>{segment.label}</h3>
              </div>
              <span>
                <Clock size={13} /> {segment.minutes} min
              </span>
            </li>
          ))}
        </ol>
      )}
      {details?.openQuestions.length ? (
        <div className="ig-open-questions">
          <strong>Before this becomes a plan</strong>
          {details.openQuestions.map((question) => (
            <p key={question}>{question}</p>
          ))}
        </div>
      ) : null}
      <details className="ig-document">
        <summary>
          {artifact.edited
            ? "Your edited document"
            : "Read the working document"}
        </summary>
        <div>{artifact.content}</div>
      </details>
    </section>
  );
}
