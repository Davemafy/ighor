/** One turn: bounded routing/repair + requirements + decisions + synthesis.
 * Budget exhaustion is terminal, never a reason to buy calls from a backup.
 */
export function agentStepLimit() {
  const value = Number(process.env.IGOR_AGENT_MAX_STEPS);

  return Number.isInteger(value) && value >= 1 ? Math.min(12, value) : 8;
}

export function modelCallLimit() {
  return agentStepLimit() + 6;
}

export class ModelRequestBudgetError extends Error {
  constructor() {
    super("Model request budget reached.");
    this.name = "ModelRequestBudgetError";
  }
}
