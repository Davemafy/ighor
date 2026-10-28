import { z } from "zod";
import type { Event, Task } from "./contracts";

/** Additive metadata on existing action packets; old clients keep rendering message. */
export const AgentActivitySchema = z.object({
  eventId: z.string(),
  threadId: z.string(),
  taskId: z.string(),
  sequence: z.number().int().nonnegative(),
  kind: z.enum([
    "task-started",
    "task-progress",
    "message-added",
    "tool-invocation",
    "tool-result",
    "evidence-added",
    "artifact-created",
    "artifact-revised",
    "state-changed",
    "approval-required",
    "action-failed",
    "task-completed",
  ]),
  actionStatus: z.enum([
    "proposed",
    "awaiting-approval",
    "executing",
    "completed",
    "failed",
    "blocked",
  ]),
  messageId: z.string().optional(),
  artifactId: z.string().optional(),
  artifactRevision: z.number().int().optional(),
  rendererType: z
    .enum([
      "document",
      "decision",
      "cultural-evidence",
      "conversation",
      "execution",
    ])
    .optional(),
  evidenceIds: z.array(z.string()).optional(),
  statePatch: z
    .object({ version: z.number().int(), changedPaths: z.array(z.string()) })
    .optional(),
});

export function messageIds(task: Task) {
  task.messages.forEach((message, index) => {
    message.id ??= `${task.id}:message:${index}`;
  });
}

export function agentEmitter(initial: Task, send: (event: Event) => void) {
  let sequence = 0;
  const startedVersion = initial.brief.version;

  const packet = (
    kind: z.infer<typeof AgentActivitySchema>["kind"],
    message: string,
    extra: Partial<z.infer<typeof AgentActivitySchema>> = {},
  ) => {
    const activity = AgentActivitySchema.parse({
      eventId: `${initial.id}:${startedVersion}:${sequence}`,
      threadId: initial.id,
      taskId: initial.id,
      sequence: sequence++,
      kind,
      actionStatus: "completed",
      ...extra,
    });
    send({ type: "action", message, activity });
  };

  packet("task-started", "Processing this turn.", {
    actionStatus: "executing",
    rendererType: "execution",
  });

  return (event: Event) => {
    if (event.type === "action" && !event.activity) {
      packet("task-progress", event.message, {
        actionStatus: "executing",
        rendererType: "execution",
      });

      return;
    }

    if (event.type === "action" && event.activity) {
      send({ ...event, activity: { ...event.activity, sequence: sequence++ } });

      return;
    }

    if (event.type === "done") {
      const task = event.task;
      messageIds(task);

      for (const message of task.messages.slice(initial.messages.length)) {
        packet(
          "message-added",
          message.role === "user"
            ? "User message saved."
            : "Assistant message saved.",
          {
            messageId: message.id,
            rendererType: "conversation",
            evidenceIds: message.evidenceIds,
          },
        );
      }

      for (const e of task.evidence.filter(
        (e) => !initial.evidence.some((old) => old.id === e.id),
      )) {
        packet("evidence-added", "Evidence saved.", {
          evidenceIds: [e.id],
          rendererType: "cultural-evidence",
        });
      }

      const previous = [
        ...initial.artifacts,
        ...(initial.work?.documents ?? []),
      ];

      for (const doc of [...task.artifacts, ...(task.work?.documents ?? [])]) {
        const old = previous.find((a) => a.id === doc.id);

        if (!old || old.version !== doc.version) {
          packet(
            old ? "artifact-revised" : "artifact-created",
            `${doc.title} saved.`,
            {
              artifactId: doc.id,
              artifactRevision: doc.version,
              rendererType: "document",
              actionStatus:
                doc.freshness === "stale" ? "awaiting-approval" : "completed",
              evidenceIds: doc.evidenceIds,
            },
          );
        }

        if ("conflict" in doc && doc.conflict) {
          packet("approval-required", `${doc.title} needs review.`, {
            artifactId: doc.id,
            artifactRevision: doc.version,
            rendererType: "document",
            actionStatus: "awaiting-approval",
          });
        }
      }

      for (const decision of task.work?.decisions ?? []) {
        if (decision.conflict) {
          packet("approval-required", decision.conflict, {
            artifactId: decision.id,
            artifactRevision: decision.version,
            rendererType: "decision",
            actionStatus: "awaiting-approval",
          });
        }
      }

      for (const action of task.work?.externalActions ?? []) {
        if (!initial.work?.externalActions.some((a) => a.id === action.id)) {
          packet("action-failed", action.reason, {
            actionStatus: "blocked",
            rendererType: "execution",
          });
        }
      }

      packet("state-changed", "Saved state is available for restoration.", {
        statePatch: {
          version: task.brief.version,
          changedPaths: ["messages", "brief", "work", "artifacts", "evidence"],
        },
      });
      packet(
        task.status === "error" ? "action-failed" : "task-completed",
        task.status === "error"
          ? (task.error ?? "Turn failed.")
          : "Turn completed; inspect state for pending decisions.",
        { actionStatus: task.status === "error" ? "failed" : "completed" },
      );
    }

    send(event);
  };
}
