import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\w:. -]+$/);
const copy = z.string().max(12000);
const base = { id, title: z.string().max(160).optional() };
const refs = z.array(z.string().min(1).max(150)).max(30);
const row = z.strictObject({
  id,
  cells: z.array(z.string().max(1000)).min(1).max(12),
  evidenceIds: refs.default([]),
});
export const PresentationNodeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.enum(["stack", "columns", "tabs"]),
    children: z.array(id).min(1).max(12),
  }),
  z.strictObject({ ...base, type: z.literal("text"), text: copy }),
  z.strictObject({
    ...base,
    type: z.literal("findings"),
    items: z
      .array(
        z.strictObject({
          text: z.string().max(2000),
          evidenceIds: refs.default([]),
        }),
      )
      .max(20),
  }),
  z.strictObject({ ...base, type: z.literal("sources"), evidenceIds: refs }),
  z.strictObject({
    ...base,
    type: z.literal("table"),
    columns: z.array(z.string().max(80)).min(1).max(12),
    rows: z.array(row).max(100),
  }),
  z.strictObject({
    ...base,
    type: z.literal("chart"),
    tableId: id,
    labelColumn: z.number().int().min(0).max(11),
    valueColumn: z.number().int().min(0).max(11),
    unit: z.string().max(30).default(""),
  }),
  z.strictObject({
    ...base,
    type: z.literal("document"),
    artifactId: z.string().max(100).optional(),
    content: copy.optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("timeline"),
    items: z
      .array(
        z.strictObject({
          id,
          label: z.string().max(160),
          detail: z.string().max(2000),
          candidateId: z.string().max(150).optional(),
        }),
      )
      .max(30),
  }),
  z.strictObject({
    ...base,
    type: z.enum(["discovery", "spatial"]),
    candidateIds: refs,
  }),
  z.strictObject({ ...base, type: z.literal("activity") }),
]);
export type PresentationNode = z.infer<typeof PresentationNodeSchema>;

/** A finite, application-owned vocabulary. No HTML, CSS, URLs, event handlers or executable code. */
export const PresentationSchema = z
  .strictObject({
    id,
    title: z.string().min(1).max(160),
    basis: z.enum([
      "general-knowledge",
      "user-supplied",
      "retrieved-evidence",
      "draft",
    ]),
    root: id,
    nodes: z.array(PresentationNodeSchema).min(1).max(32),
  })
  .superRefine((surface, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(surface)).length > 60000) {
      ctx.addIssue({
        code: "custom",
        message: "Composition exceeds the shared-state size budget.",
      });
    }

    const byId = new Map(surface.nodes.map((n) => [n.id, n]));
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    if (byId.size !== surface.nodes.length) {
      fail("Component IDs must be unique.");
    }

    const seen = new Set<string>();

    function visit(key: string, ancestors: Set<string>) {
      const node = byId.get(key);

      if (!node || ancestors.has(key) || ancestors.size > 5) {
        fail("Invalid, cyclic or excessive component nesting.");

        return;
      }

      if (seen.has(key)) {
        fail("A component must have one parent.");

        return;
      }

      seen.add(key);

      if ("children" in node) {
        node.children.forEach((child) =>
          visit(child, new Set([...ancestors, key])),
        );
      }

      if (
        node.type === "document" &&
        Boolean(node.artifactId) === (node.content !== undefined)
      ) {
        fail(
          "Document must bind an artifact or supply draft content, exclusively.",
        );
      }

      if (
        node.type === "table" &&
        node.rows.some((r) => r.cells.length !== node.columns.length)
      ) {
        fail("Table cells must match columns.");
      }

      if (
        node.type === "table" &&
        new Set(node.rows.map((r) => r.id)).size !== node.rows.length
      ) {
        fail("Row IDs must be unique.");
      }

      if (
        node.type === "timeline" &&
        new Set(node.items.map((r) => r.id)).size !== node.items.length
      ) {
        fail("Step IDs must be unique.");
      }

      if (node.type === "chart") {
        const table = byId.get(node.tableId);

        if (
          table?.type !== "table" ||
          Math.max(node.labelColumn, node.valueColumn) >=
            table.columns.length ||
          table.rows.some(
            (r) =>
              !r.cells[node.valueColumn].trim() ||
              !Number.isFinite(Number(r.cells[node.valueColumn])),
          )
        ) {
          fail(
            "Chart requires an existing table with a finite numeric column.",
          );
        }
      }
    }

    visit(surface.root, new Set());

    if (seen.size !== surface.nodes.length) {
      fail("Every component must be reachable from root.");
    }
  });
export type Presentation = z.infer<typeof PresentationSchema>;
export const CanvasStateSchema = z.object({
  source: z.enum(["agent", "adapter"]).default("agent"),
  surface: PresentationSchema,
  previous: z.array(PresentationSchema).max(4).default([]),
  selectedCandidateId: z.string().nullable().default(null),
  itineraryIds: refs.default([]),
  filters: z.record(z.string(), z.string().max(200)).default({}),
  chartAxes: z.record(z.string(), z.number().int().min(0).max(11)).default({}),
  itineraryDays: z.record(z.string(), z.number().int().min(1).max(14)).default({}),
  completed: z.array(z.string().max(180)).max(100).default([]),
});
export type CanvasState = z.infer<typeof CanvasStateSchema>;
export const CanvasMutationSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("edit"),
    nodeId: id,
    content: z.string().min(1).max(12000),
  }),
  z.strictObject({
    operation: z.literal("filter"),
    nodeId: id,
    value: z.string().max(200),
  }),
  z.strictObject({
    operation: z.literal("chart-axis"),
    nodeId: id,
    valueColumn: z.number().int().min(0).max(11),
  }),
  z.strictObject({
    operation: z.literal("select"),
    nodeId: id,
    candidateId: z.string(),
  }),
  z.strictObject({
    operation: z.literal("itinerary"),
    nodeId: id,
    candidateIds: refs,
  }),
  z.strictObject({
    operation: z.literal("reorder"),
    nodeId: id,
    itemIds: refs,
  }),
  z.strictObject({
    operation: z.literal("itinerary-day"),
    nodeId: id,
    candidateId: z.string().min(1).max(150),
    day: z.number().int().min(0).max(14),
  }),
  z.strictObject({ operation: z.literal("toggle"), nodeId: id, itemId: id }),
]);
export type CanvasMutation = z.infer<typeof CanvasMutationSchema>;

type GroundingContext = {
  candidates: { id: string; freshness: string }[];
  evidence: { id: string }[];
  artifacts: { id: string }[];
};

export function validatePresentation(
  value: unknown,
  context: GroundingContext,
): Presentation {
  const surface = PresentationSchema.parse(value);
  const evidence = new Set(context.evidence.map((e) => e.id));
  const candidates = new Set(context.candidates.map((c) => c.id));

  for (const node of surface.nodes) {
    const ids =
      node.type === "sources"
        ? node.evidenceIds
        : node.type === "findings"
          ? node.items.flatMap((i) => i.evidenceIds)
          : node.type === "table"
            ? node.rows.flatMap((i) => i.evidenceIds)
            : [];

    if (ids.some((key) => !evidence.has(key))) {
      throw new Error("Presentation references unavailable evidence.");
    }

    const places =
      "candidateIds" in node
        ? node.candidateIds
        : node.type === "timeline"
          ? node.items.flatMap((i) => (i.candidateId ? [i.candidateId] : []))
          : [];

    if (places.some((key) => !candidates.has(key))) {
      throw new Error("Presentation references unavailable objects.");
    }

    if (
      node.type === "document" &&
      node.artifactId &&
      !context.artifacts.some((a) => a.id === node.artifactId)
    ) {
      throw new Error("Presentation references unavailable artifact.");
    }
  }

  return surface;
}

export function installPresentation(
  previous: CanvasState | undefined,
  surface: Presentation,
): CanvasState {
  return CanvasStateSchema.parse({
    ...previous,
    source: "agent",
    surface,
    previous: previous
      ? [previous.surface, ...previous.previous]
          .filter((s) => s.id !== surface.id)
          .slice(0, 4)
      : [],
  });
}

/** Runs inside the existing optimistic task transaction. It never calls inference or Qloo. */
export function mutateCanvas(
  canvas: CanvasState,
  surfaceId: string,
  mutation: CanvasMutation,
  context: GroundingContext,
) {
  if (canvas.surface.id !== surfaceId) {
    throw new Error("This canvas was replaced. Reload before editing.");
  }

  const node = canvas.surface.nodes.find((n) => n.id === mutation.nodeId);

  if (!node) {
    throw new Error("Component not found.");
  }

  switch (mutation.operation) {
    case "edit":
      if (node.type !== "document" || node.artifactId) {
        throw new Error("Only an authored draft can be edited here.");
      }

      node.content = mutation.content;
      break;
    case "filter":
      if (node.type !== "table" && node.type !== "discovery") {
        throw new Error("This component does not support filters.");
      }

      canvas.filters[node.id] = mutation.value;
      break;
    case "chart-axis": {
      if (node.type !== "chart") {
        throw new Error("Only a chart can change its measure.");
      }

      const table = canvas.surface.nodes.find((n) => n.id === node.tableId);
      if (
        table?.type !== "table" ||
        mutation.valueColumn >= table.columns.length ||
        mutation.valueColumn === node.labelColumn ||
        table.rows.length === 0 ||
        table.rows.some((row) =>
          !row.cells[mutation.valueColumn]?.trim() ||
          !Number.isFinite(Number(row.cells[mutation.valueColumn])),
        )
      ) {
        throw new Error("Choose an existing numeric comparison column.");
      }

      canvas.chartAxes[node.id] = mutation.valueColumn;
      break;
    }
    case "select":
      if (!(
        (node.type === "spatial" || node.type === "discovery") &&
        node.candidateIds.includes(mutation.candidateId)
      )) {
        throw new Error("Select an offered object.");
      }

      if (
        !context.candidates.some(
          (c) => c.id === mutation.candidateId && c.freshness === "current",
        )
      ) {
        throw new Error("Select a current object.");
      }

      canvas.selectedCandidateId = mutation.candidateId;
      break;

    case "itinerary": {
      if (node.type !== "spatial" && node.type !== "discovery") {
        throw new Error("This component cannot edit the itinerary.");
      }

      const allowed = new Set([...canvas.itineraryIds, ...node.candidateIds]);

      if (
        new Set(mutation.candidateIds).size !== mutation.candidateIds.length ||
        mutation.candidateIds.some(
          (key) =>
            !allowed.has(key) ||
            !context.candidates.some(
              (c) => c.id === key && c.freshness === "current",
            ),
        )
      ) {
        throw new Error("Itinerary requires unique, current objects.");
      }

      canvas.itineraryIds = mutation.candidateIds;
      for (const key of Object.keys(canvas.itineraryDays)) {
        if (!mutation.candidateIds.includes(key)) {
          delete canvas.itineraryDays[key];
        }
      }
      break;
    }

    case "itinerary-day": {
      if (
        (node.type !== "spatial" && node.type !== "discovery") ||
        !canvas.itineraryIds.includes(mutation.candidateId) ||
        !context.candidates.some(
          (candidate) =>
            candidate.id === mutation.candidateId &&
            candidate.freshness === "current",
        )
      ) {
        throw new Error("Assign days only to current itinerary stops.");
      }

      if (mutation.day === 0) {
        delete canvas.itineraryDays[mutation.candidateId];
      } else {
        canvas.itineraryDays[mutation.candidateId] = mutation.day;
      }
      break;
    }

    case "reorder":
      if (
        node.type !== "timeline" ||
        mutation.itemIds.length !== node.items.length ||
        new Set(mutation.itemIds).size !== node.items.length ||
        mutation.itemIds.some((key) => !node.items.some((i) => i.id === key))
      ) {
        throw new Error("Reorder requires the exact existing steps.");
      }

      node.items = mutation.itemIds.map((key) =>
        node.items.find((i) => i.id === key)!,
      );
      break;

    case "toggle": {
      if (
        node.type !== "timeline" ||
        !node.items.some((i) => i.id === mutation.itemId)
      ) {
        throw new Error("Step not found.");
      }

      const key = `${node.id}:${mutation.itemId}`;
      canvas.completed = canvas.completed.includes(key)
        ? canvas.completed.filter((i) => i !== key)
        : [...canvas.completed, key];
      break;
    }
  }

  return CanvasStateSchema.parse(canvas);
}
