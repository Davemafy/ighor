import {
  EventSchema,
  TaskSchema,
  type Event,
  type Task,
  type TaskAction,
} from "@/core/contracts";

export type WorkspaceSummary = {
  id: string;
  goal: string;
  title?: string;
  preview?: string;
  updatedAt?: string | null;
};

export class TurnRequestError extends Error {
  constructor(
    message: string,
    readonly needsRefresh: boolean,
  ) {
    super(message);
  }
}

export async function createWorkspace(): Promise<Task> {
  const response = await fetch("/api/tasks", { method: "POST" });

  if (!response.ok) {
    throw new Error("Could not create workspace.");
  }

  return TaskSchema.parse(await response.json());
}

export async function fetchWorkspace(id: string): Promise<Task | null> {
  const response = await fetch(`/api/tasks/${id}`);

  if (response.status === 401 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not load workspace.");
  }

  return TaskSchema.parse(await response.json());
}

export async function fetchWorkspaceHistory(): Promise<
  WorkspaceSummary[] | null
> {
  const response = await fetch("/api/tasks");

  if (!response.ok) {
    return null;
  }

  const { tasks } = await response.json();

  return tasks;
}

export async function submitTurn(
  task: Task,
  action: TaskAction,
): Promise<Response> {
  const response = await fetch(`/api/tasks/${task.id}/turn`, {
    method: "POST",
    signal: AbortSignal.timeout(150000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...action, version: task.brief.version }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new TurnRequestError(
      body.error ?? "Could not save the turn.",
      response.status === 409,
    );
  }

  return response;
}

export async function* readTurnEvents(
  response: Response,
  idleTimeoutMs = 45000,
): AsyncGenerator<Event> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("No execution stream received.");
  }

  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;

  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "The connection stopped responding. Your saved conversation will be checked before you retry.",
                ),
              ),
            idleTimeoutMs,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      const { value, done } = chunk;
      pending += decoder.decode(value, { stream: !done });
      pending = pending.replace(/\r\n/g, "\n");
      let boundary = pending.indexOf("\n\n");

      while (boundary >= 0) {
        const packet = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);

        if (packet.startsWith("data: ")) {
          const event = EventSchema.parse(JSON.parse(packet.slice(6)));
          completed = event.type === "done" || event.type === "error";
          yield event;

          if (completed) {
            return;
          }
        }

        boundary = pending.indexOf("\n\n");
      }

      if (done) {
        throw new Error(
          "Execution stream ended before completion. Reload the workspace to check its saved state.",
        );
      }
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}

/** A dropped connection must not offer to replay an already completed turn. */
export function completedTurnAfter(
  task: Task,
  version: number,
  messageCount: number,
) {
  return (
    task.brief.version > version &&
    ["ready", "partial", "draft", "clarification"].includes(task.status) &&
    task.messages
      .slice(messageCount)
      .some((message) => message.role === "assistant")
  );
}

