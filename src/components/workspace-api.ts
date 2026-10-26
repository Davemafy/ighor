import {
  EventSchema,
  TaskSchema,
  type Event,
  type Task,
  type TaskAction,
} from "@/core/contracts";

export type WorkspaceSummary = { id: string; goal: string };

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...action, version: task.brief.version }),
  });

  if (!response.ok) {
    const body = await response.json();
    throw new TurnRequestError(
      body.error ?? "Could not save the turn.",
      response.status === 409,
    );
  }

  return response;
}

export async function* readTurnEvents(
  response: Response,
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
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
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
