import type { Task } from "@/core/contracts";

/** The saved transcript remains available while an outcome changes around it. */
export function ConversationThread({ task }: { task: Task }) {
  if (!task.messages.length) {
    return null;
  }

  return (
    <details className="ig-conversation">
      <summary>
        Conversation · {task.messages.length}{" "}
        {task.messages.length === 1 ? "message" : "messages"}
      </summary>
      <ol aria-label="Saved conversation">
        {task.messages.map((message, index) => (
          <li key={`${message.at}:${index}`}>
            <strong>{message.role === "user" ? "You" : "Igor"}</strong>
            <p>{message.text}</p>
            {message.evidenceIds?.map((id) => {
              const evidence = task.evidence.find((record) => record.id === id);

              return (
                <details key={id} className="ig-message-source">
                  <summary>
                    {evidence
                      ? `${evidence.source} · ${evidence.freshness}`
                      : "Source no longer available"}
                  </summary>
                  {evidence && (
                    <>
                      <p>{evidence.summary}</p>
                      <small>{evidence.limitations.join(" ")}</small>
                      {evidence.kind === "practical" &&
                        evidence.source === "provider-returned" &&
                        evidence.reference.startsWith("https://") && (
                          <a
                            href={evidence.reference}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open retrieved source
                          </a>
                        )}
                    </>
                  )}
                </details>
              );
            })}
          </li>
        ))}
      </ol>
    </details>
  );
}
