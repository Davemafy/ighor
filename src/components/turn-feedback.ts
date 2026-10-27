import type { Task, TaskAction, Event } from "@/core/contracts";

export type TurnFeedback = {
  input: string;
  action: TaskAction;
  startedAt: number;
  messageCount: number;
  state: "running" | "complete" | "error";
  steps: string[];
  error?: string;
  activity?: Extract<Event, { type: "action" }>["activity"];
  activities?: Array<{
    message: string;
    activity: NonNullable<Extract<Event, { type: "action" }>["activity"]>;
  }>;
};

// Match only messages added by this turn. A repeated input from an earlier
// conversation turn is not an acknowledgement, and server clocks can differ.
export function hasPendingInput(
  messages: Task["messages"],
  feedback: TurnFeedback | null,
) {
  return (
    !!feedback?.input &&
    feedback.state !== "complete" &&
    !messages
      .slice(feedback.messageCount)
      .some(
        (message) => message.role === "user" && message.text === feedback.input,
      )
  );
}
