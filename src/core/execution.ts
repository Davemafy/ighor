/** Bound provider waiting independently of the action count. Late promises cannot commit. */
export async function withToolDeadline<T>(
  work: Promise<T>,
  milliseconds = 5000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Tool timed out. Retry the action.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export class ExecutionBudget {
  used = 0;

  constructor(public max = 24) {}

  take(action: string) {
    if (
      ![
        "resolve",
        "discover",
        "facts",
        "evaluate",
        "compose",
        "collaborate",
        "interpret",
      ].includes(action)
    ) {
      throw new Error("Unauthorized capability action");
    }

    if (++this.used > this.max) {
      throw new Error(
        "Execution budget exceeded. Narrow the task and try again.",
      );
    }
  }
}
