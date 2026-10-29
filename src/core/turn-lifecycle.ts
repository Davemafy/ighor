import type { Event } from "./contracts";

export type TurnPhase =
  | "accepted"
  | "understanding"
  | "responding"
  | "awaiting_input"
  | "retrieving"
  | "evaluating"
  | "composing"
  | "awaiting_approval"
  | "completed"
  | "partial"
  | "failed"
  | "superseded"
  | "interrupted";
export type TurnStatus =
  | "accepted"
  | "running"
  | "completed"
  | "partial"
  | "awaiting_input"
  | "awaiting_approval"
  | "failed"
  | "superseded"
  | "interrupted";
export const isActiveTurn = (status: string) =>
  status === "accepted" || status === "running";

export function turnPhase(event: Event): TurnPhase {
  if (event.type === "error") {
    return event.code === "conflict"
      ? "superseded"
      : event.code === "interrupted"
        ? "interrupted"
        : "failed";
  }

  if (event.type === "done") {
    if (event.task.status === "error") {
      return "failed";
    }

    if (event.task.status === "partial") {
      return "partial";
    }

    if (event.task.status === "clarification") {
      return "awaiting_input";
    }

    return "completed";
  }

  if (event.type === "action" && event.phase) {
    return event.phase;
  }

  const action =
    event.type === "state"
      ? (event.task.agentRun?.steps.at(-1)?.tool ?? "")
      : "";

  return phaseForAction(action);
}

export function phaseForAction(action: string): TurnPhase {
  if (/compose|document\.(?:create|revise)|artifact/.test(action)) {
    return "composing";
  }

  if (/evaluate|critique|integrity|acceptance/.test(action)) {
    return "evaluating";
  }

  if (
    /discover|resolve|retrieve|qloo|web\.|places|browser|trueforge/.test(action)
  ) {
    return "retrieving";
  }

  return "understanding";
}
