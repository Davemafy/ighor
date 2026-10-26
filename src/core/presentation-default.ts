import type { Task } from "./contracts";
import {
  installPresentation,
  validatePresentation,
  type PresentationNode,
} from "./presentation";

/** Controlled tool-result adapter for legacy agents. Model-authored compositions take precedence. */
export function ensureBoundPresentation(task: Task) {
  if (task.status === "error") {
    return;
  }

  // Existing canvas remains live through its task bindings. Never reset user-authored work.
  if (task.canvas?.source === "agent") {
    return;
  }

  const nodes: PresentationNode[] = [];
  const children: string[] = [];

  for (const artifact of task.artifacts.filter(
    (a) => a.freshness === "current",
  )) {
    nodes.push({
      id: `draft-${artifact.id}`,
      type: "document",
      title: artifact.title,
      artifactId: artifact.id,
    });
    children.push(`draft-${artifact.id}`);
  }

  const ids = task.candidates
    .filter((c) => c.freshness === "current")
    .map((c) => c.id);

  if (ids.length) {
    nodes.push({
      id: "discoveries",
      type: "discovery",
      title: "Connections for your goal",
      candidateIds: ids,
    });
    children.push("discoveries");

    if (
      task.candidates.some(
        (c) =>
          c.type === "place" &&
          c.place?.latitude != null &&
          c.place?.longitude != null,
      )
    ) {
      nodes.push({
        id: "places",
        type: "spatial",
        title: "See the places together",
        candidateIds: ids.filter(
          (id) => task.candidates.find((c) => c.id === id)?.type === "place",
        ),
      });
      children.push("places");
    }
  }

  if (!children.length) {
    return;
  }

  nodes.push({ id: "activity", type: "activity", title: "Activity" });
  children.push("activity");
  nodes.unshift({ id: "work", type: "stack", children });
  const previous = task.canvas;
  task.canvas = installPresentation(
    undefined,
    validatePresentation(
      {
        id: `work-${task.brief.version}`,
        title: task.brief.goal.slice(0, 160) || "Your work",
        basis: "retrieved-evidence",
        root: "work",
        nodes,
      },
      task,
    ),
  );
  task.canvas.source = "adapter";

  if (previous) {
    task.canvas.surface.id = previous.surface.id;
    task.canvas.previous = previous.previous;
    task.canvas.selectedCandidateId = previous.selectedCandidateId;
    task.canvas.itineraryIds = previous.itineraryIds;
    task.canvas.filters = previous.filters;
    task.canvas.completed = previous.completed;
  }
}
