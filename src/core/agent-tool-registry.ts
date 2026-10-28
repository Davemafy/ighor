import { z } from "zod";
import type { Task } from "./contracts";
import type { CulturalProvider } from "../tools/interfaces";
import type { ResearchProvider, ResearchSource } from "../tools/live-research";
import type { GooglePlacesProvider } from "../tools/google-maps";
import { publicResearchUrl } from "../tools/live-research";

export type AgentToolPermission = "read" | "internal";
export interface AgentToolOutcome {
  status: "ok" | "partial" | "blocked" | "error";
  summary: string;
  requests: number;
  sources?: ResearchSource[];
}
export interface AgentToolContext {
  task: Task;
  research: ResearchProvider;
  cultural?: CulturalProvider;
  places?: Pick<GooglePlacesProvider, "search">;
  sources: ResearchSource[];
  runId: string;
}
export interface AgentToolDefinition {
  name: string;
  description: string;
  permission: AgentToolPermission;
  version: number;
  available: boolean;
  schema: z.ZodType;
  execute: (argumentsValue: unknown, context: AgentToolContext) => Promise<AgentToolOutcome>;
}

const normalized = (source: ResearchSource) => source.url.trim().toLowerCase();

function saveSources(context: AgentToolContext, incoming: ResearchSource[]): number {
  const existing = new Set(context.sources.map(normalized));
  let added = 0;
  let id = Math.max(0, ...context.sources.map((s) => Number(s.id.match(/^web-(\d+)$/)?.[1] || 0))) + 1;
  for (const source of incoming) {
    const url = publicResearchUrl(source.url);
    if (!url || existing.has(url.toLowerCase()) || context.sources.length >= 12) continue;
    const next = { ...source, id: `web-${id++}`, url };
    context.sources.push(next);
    existing.add(url.toLowerCase());
    added++;
  }
  return added;
}

const searchArguments = z.strictObject({ query: z.string().trim().min(3).max(200) });
const readArguments = z.strictObject({ sourceId: z.string().trim().min(1).max(80) });
const resolveArguments = z.strictObject({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["movie", "tv_show", "artist", "book", "place"]).optional(),
});
const discoverArguments = z.strictObject({
  entityId: z.string().min(1).max(120),
  targetType: z.enum(["movie", "tv_show", "artist", "place"]),
});
const localityArguments = z.strictObject({
  city: z.string().trim().min(2).max(100),
  interest: z.string().trim().min(3).max(200),
});
const documentArguments = z.strictObject({
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(30).max(10000),
  sourceIds: z.array(z.string()).max(12),
});
const empty = z.strictObject({});

/** Bounded verified capability set. No model-supplied URL or privileged write. */
export function createAgentToolRegistry(context: AgentToolContext): AgentToolDefinition[] {
  const tool = (
    name: string,
    description: string,
    schema: z.ZodType,
    permission: AgentToolPermission,
    available: boolean,
    execute: (args: unknown, ctx: AgentToolContext) => Promise<AgentToolOutcome>,
  ): AgentToolDefinition => ({ name, description, schema, permission, available, version: 1, execute });

  return [
    tool("web.search", "Search current public webpages; use a targeted query with explicit location when relevant.", searchArguments, "read", true,
      async (args, ctx) => {
        const { query } = searchArguments.parse(args);
        const result = ctx.research.searchOnce
          ? await ctx.research.searchOnce(query)
          : await ctx.research.research(query);
        const added = saveSources(ctx, result.sources);
        return {
          status: result.status === "blocked" ? "blocked" : result.status === "error" ? "error" : added ? "ok" : "partial",
          requests: result.requests,
          summary: `Web search returned ${result.sources.length} leads, ${added} new unique sources. ${result.warning ?? ""}`.trim(),
          sources: ctx.sources.slice(-added || undefined),
        };
      }),
    tool("web.read", "Read the actual page behind a previously observed web source ID; requires a page reader.", readArguments, "read", Boolean(context.research.readSource),
      async (args, ctx) => {
        const { sourceId } = readArguments.parse(args);
        const source = ctx.sources.find((s) => s.id === sourceId);
        if (!source || source.excerpt || !ctx.research.readSource) {
          return { status: "blocked", summary: "Unknown, already opened or unavailable source.", requests: 0 };
        }
        const result = await ctx.research.readSource(source.url);
        if (result.status === "ok" && result.excerpt) source.excerpt = result.excerpt.slice(0, 6000);
        return { status: result.status, summary: source.excerpt
          ? `Opened ${source.title}. Actual excerpt: ${source.excerpt.slice(0, 1000)}`
          : result.warning ?? "Page could not be opened.", requests: result.requests };
      }),
    tool("places.search", "Resolve real place names, addresses, coordinates and Google Maps URLs.", searchArguments, "read", Boolean(context.places),
      async (args, ctx) => {
        const { query } = searchArguments.parse(args);
        if (!ctx.places) return { status: "blocked", requests: 0, summary: "Places not configured." };
        const result = await ctx.places.search(query);
        if (result.status !== "ok") return { status: result.status, requests: result.requests, summary: result.warning };
        const now = new Date().toISOString();
        const added = saveSources(ctx, result.places.flatMap((p): ResearchSource[] =>
          p.url && publicResearchUrl(p.url) ? [{
            id: "web-placeholder", title: p.name, url: p.url,
            snippet: `Google Places (New): ${p.name}; address ${p.address}; coordinates ${p.latitude ?? "unknown"}, ${p.longitude ?? "unknown"}. No hours, pricing or availability verified.`,
            retrievedAt: now,
          }] : []));
        return { status: result.places.length ? "ok" : "partial", requests: result.requests,
          summary: `Google Places returned ${result.places.length} places; ${added} sourced map links.`,
          sources: ctx.sources.slice(-added || undefined) };
      }),
    tool("qloo.resolve_entity", "Resolve a specific user-mentioned film, artist, TV, book or place with Qloo. Do not guess identifiers.", resolveArguments, "read", Boolean(context.cultural),
      async (args, ctx) => {
        const { name, type } = resolveArguments.parse(args);
        if (!ctx.cultural) return { status: "blocked", requests: 0, summary: "Qloo unavailable." };
        const result = await ctx.cultural.resolve(name, type);
        const entity = result.data;
        if (entity.status === "resolved" && !ctx.task.entities.some((e) => e.id === entity.id)) {
          ctx.task.entities.push(entity);
        }
        return { status: result.status === "ok" ? "ok" : "partial", requests: result.requestCount,
          summary: entity.status === "resolved" ? `Qloo resolved ${entity.name} as ${entity.type}: ${entity.providerId}; this identifies an entity, not a preference score.`
            : `Qloo identity ${name} is ${entity.status}; do not invent a match. ${result.warnings.join(" ")}` };
      }),
    tool("qloo.discover", "Discover Qloo cultural relationships from an already resolved entity, with a specified supported output domain.", discoverArguments, "read", Boolean(context.cultural),
      async (args, ctx) => {
        const { entityId, targetType } = discoverArguments.parse(args);
        const entity = ctx.task.entities.find((e) => e.id === entityId && e.status === "resolved" && e.providerId);
        if (!entity || !ctx.cultural) return { status: "blocked", requests: 0, summary: "No resolved Qloo seed in this task." };
        const result = await ctx.cultural.discover({
          anchor: { providerId: entity.providerId!, name: entity.name, type: entity.type },
          targetTypes: [targetType], participants: ctx.task.brief.participants,
          entities: ctx.task.entities, catalogue: [], location: ctx.task.brief.constraints.location,
          version: ctx.task.brief.version, mode: ctx.task.mode,
        });
        if (result.data.options.length) {
          const seen = new Set(ctx.task.catalogue.map((c) => c.id));
          for (const candidate of result.data.options) {
            if (!seen.has(candidate.id) && ctx.task.catalogue.length < 30) {
              ctx.task.catalogue.push(candidate);
              seen.add(candidate.id);
            }
          }
        }
        const evidenceIds = new Set(ctx.task.evidence.map((e) => e.id));
        for (const evidence of result.data.evidence) {
          if (!evidenceIds.has(evidence.id)) ctx.task.evidence.push(evidence);
        }
        return { status: result.status === "ok" ? "ok" : result.status === "blocked" ? "blocked" : "partial",
          requests: result.requestCount,
          summary: `Qloo ${targetType} discovery returned ${result.data.options.length} actual candidates: ${result.data.options.slice(0,5).map((x) => x.name).join(", ")}. ${result.warnings.join(" ")}`.slice(0,580) };
      }),
    tool("qloo.explore_location", "Retrieve Qloo restaurant-category leads for a user-supplied city, not verified openings or personal affinities.", localityArguments, "read", Boolean(context.cultural?.exploreLocality),
      async (args, ctx) => {
        const { city, interest } = localityArguments.parse(args);
        if (!ctx.cultural?.exploreLocality) return { status: "blocked", requests: 0, summary: "Qloo local exploration unavailable." };
        const result = await ctx.cultural.exploreLocality(city, interest);
        const seen = new Set(ctx.task.evidence.map((e) => e.id));
        for (const evidence of result.data.evidence) if (!seen.has(evidence.id)) ctx.task.evidence.push(evidence);
        const now = new Date().toISOString();
        saveSources(ctx, result.data.places.flatMap((p): ResearchSource[] =>
          p.website && publicResearchUrl(p.website) ? [{
            id: "web-placeholder", title: p.name, url: p.website,
            snippet: `Qloo locality/category lead: ${p.name}; ${p.address}. Prices, game inventory and availability are not verified.`,
            retrievedAt: now,
          }] : []));
        return { status: result.status === "ok" ? "ok" : "partial", requests: result.requestCount,
          summary: `Qloo returned ${result.data.places.length} category/location leads: ${result.data.places.slice(0,5).map((p) => p.name).join(", ")}. This is not verified personal affinity.`.slice(0,580) };
      }),
    tool("task.inspect", "Read current saved goal, relevant artifacts and prior evidence without modifying work.", empty, "read", true,
      async (_args, ctx) => ({ status: "ok", requests: 0,
        summary: JSON.stringify({ goal: ctx.task.brief.goal.slice(0,140),
          artifacts: ctx.task.artifacts.slice(-3).map((a) => ({id:a.id,title:a.title,edited:a.edited,locked:a.locked})),
          evidence: ctx.task.evidence.length }).slice(0,580) })),
    tool("document.create", "Create a new editable internal report from observed evidence. Never overwrite approved or manually edited work.", documentArguments, "internal", true,
      async (args, ctx) => {
        const { title, content, sourceIds } = documentArguments.parse(args);
        const observed = new Set(ctx.sources.map((s) => s.id));
        if (sourceIds.some((id) => !observed.has(id))) {
          return { status: "blocked", requests: 0, summary: "Document cited an unobserved source." };
        }
        const evidenceIds = sourceIds.map((id) => `${ctx.task.id}:agent:${ctx.runId}:${id}`);
        ctx.task.artifacts.push({
          id: `agent-doc-${ctx.runId}`, kind: "research-report",
          title, content, version: ctx.task.brief.version, dependencies: ["evidence:research"],
          evidenceIds, assumptions: ["This document distinguishes confirmed source observations from remaining uncertainties."],
          freshness: "current", edited: false,
        });
        return { status: "ok", requests: 0, summary: `Saved editable document ${title} with ${sourceIds.length} observed source IDs.` };
      }),
    tool("agent.finish", "Stop when the available evidence suffices or remaining actions would not help.", empty, "read", true,
      async () => ({ status: "ok", requests: 0, summary: "Agent stopped further tool calls." })),
  ];
}
