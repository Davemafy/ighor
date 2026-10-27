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
    bindGroundedPlaces(task);

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
    task.canvas.comparisonIds = previous.comparisonIds;
    task.canvas.viewModes = previous.viewModes;
    task.canvas.itineraryIds = previous.itineraryIds;
    task.canvas.itineraryDays = previous.itineraryDays;
    task.canvas.filters = previous.filters;
    task.canvas.chartAxes = previous.chartAxes;
    task.canvas.completed = previous.completed;
    task.canvas.answers = previous.answers;
    // The adapter may have received a different candidate pool. Never leave a
    // comparison visually active with fewer than two currently offered items.
    const offered = new Set(
      task.candidates.filter((candidate) => candidate.freshness === "current")
        .map((candidate) => candidate.id),
    );
    task.canvas.comparisonIds = task.canvas.comparisonIds.filter((id) =>
      offered.has(id),
    );
    if (
      task.canvas.viewModes.discoveries === "compare" &&
      task.canvas.comparisonIds.length < 2
    ) {
      task.canvas.viewModes.discoveries = "explore";
    }
  }
}

/** Enrich an authored composition with actual returned places without discarding it. */
function bindGroundedPlaces(task: Task) {
  const canvas = task.canvas;

  if (
    !canvas ||
    canvas.surface.nodes.some((node) => node.type === "spatial") ||
    canvas.surface.nodes.length > 30
  ) {
    return;
  }

  const placeIds = task.candidates
    .filter(
      (candidate) =>
        candidate.type === "place" &&
        candidate.freshness === "current" &&
        Number.isFinite(candidate.place?.latitude) &&
        Number.isFinite(candidate.place?.longitude) &&
        candidate.place?.latitude != null &&
        candidate.place?.longitude != null &&
        Math.abs(candidate.place.latitude) <= 90 &&
        Math.abs(candidate.place.longitude) <= 180,
    )
    .map((candidate) => candidate.id);

  if (!placeIds.length) {
    return;
  }

  const surface = structuredClone(canvas.surface);
  let id = "grounded-places";

  while (surface.nodes.some((node) => node.id === id)) {
    id += "-map";
  }

  const root = surface.nodes.find((node) => node.id === surface.root);

  if (root && "children" in root && root.children.length < 12) {
    root.children.push(id);
  } else {
    let rootId = "grounded-layout";

    while (surface.nodes.some((node) => node.id === rootId)) {
      rootId += "-root";
    }

    surface.nodes.push({
      id: rootId,
      type: "stack",
      children: [surface.root, id],
    });
    surface.root = rootId;
  }

  surface.nodes.push({
    id,
    type: "spatial",
    title: "Places in your plan",
    candidateIds: placeIds,
  });

  try {
    canvas.surface = validatePresentation(surface, task);
  } catch {
    /* Keep the authored surface if its complexity budget is exhausted. */
  }
}
