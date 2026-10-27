import { modelContext } from "./model-context";
import { readModelResponse } from "./response-body";
import { z } from "zod";
import type { Task } from "../core/contracts";
import {
  interpretationFailure,
  ProviderHttpError,
} from "../core/interpretation-failure";
import { turnTool, readTurnDecision } from "./turn-protocol";
import type { ModelProvider } from "./interfaces";

const conversationInstructions = [
  "You are Igor, your agent with taste, in one ongoing conversation",
  "Use update_brief to choose the turn type",
  "Return decision as a normal object, never encode it as a JSON string",
  "For discussion, greetings, explanations, reactions, questions about previous messages or brainstorming, set intent conversation and give a helpful reply; no actions are needed",
  "For a vague request or an ambiguous reference, set intent clarification and ask one useful follow-up question in reply",
  "Do not invent a goal merely to fit a schema",
  "For conversation/clarification omit cultural planning fields; an optional presentation can create or update shared work without running cultural tools",
  "Choose the requested output before choosing tools: planning, gift ideas to arrange oneself, writing and comparisons can be created as drafts or supported presentations without venue discovery. Set targetType place only when the user actually wants locations or venues; a taste, food or recipient mention alone is not a request for places. Respect corrections such as not places and replace an abandoned route instead of keeping its intake active",
  "For a new actionable goal use intent goal; for explicit edits use revision",
  "Goal/revision must include kind and goal plus grounded actions",
  "Preserve the existing goal and known preferences unless the user changes them",
  "Use thread history to understand pronouns and short follow-ups",
  "The latest user request controls the next step. A new topic replaces the active goal; do not keep asking abandoned trip details when the user greets you, declines or asks for movies. Greetings deserve a brief greeting without a repeated intake checklist",
  "After a submitted clarification form, use its supplied values and continue useful work. Do not ask the same question or demand I/my wording. A question subject is you by default, or group only for an explicitly shared request; this is task context, never permission to store long-term memory",

  "When completing an initial request after clarification, reuse facts and tastes already explicitly supplied in this thread; do not ask the user to repeat them",
  "Write clear, concise plain-text replies",
  "Put evidence IDs in replyEvidenceIds, not in the prose",
  "Do not claim to have changed state without validated actions or a presentation change",
  "If history is omitted and a reference is unclear, ask rather than guess",
  "Explain workspace choices using current evidence IDs in replyEvidenceIds, distinguish cultural associations from user-supplied practical facts, and acknowledge unknowns or stale evidence",
  "For requests outside the executable tools, discuss possibilities and explain the limit using conversation intent",
  "Clearly distinguish general knowledge or opinion from retrieved evidence",
  "Never invent current hours, prices, availability, completed actions or source citations",
  "For connected planning, writing, budgeting, concept development or revisions across multiple deliverables, use intent goal or revision with kind creative, goal, and workActions; ordinary actions/outcome may accompany workActions only when cultural discovery is also requested. The engine performs cultural capabilities before work actions; work must not cite evidence that has not yet been retrieved. Work actions can run without Qloo. Prefer this path for work that is not a cultural candidate selection",
  "workActions exact schema: goal {kind:goal,id,title}; decision {kind:decision,id,title,value,estimatedCost:number|null,rationale,dependencies:string[],evidenceIds:string[]}; document {kind:document,id,title,content,dependencies:string[],evidenceIds:string[]}; budget {kind:budget,amount}; reduce-budget {kind:reduce-budget,percent}; approve/reject {kind,id}; edit {kind:edit,id,content}; external {kind:external,connector,action}. IDs are lowercase hyphenated slugs. Dependencies use goal:ID, decision:ID, document:ID, or budget. Never create cycles",
  "A request to develop or create something needs an actual first deliverable when enough context exists. After clarification, include a document action with a useful draft, not only a goal action or a promise to work. State assumptions in the draft and ask only for genuinely blocking details. Never describe merely saving a goal as producing a concept",
  "Begin connected work with a goal action. Reuse existing IDs when revising the same work, and use new IDs for distinct goals. All decision estimates and documents are creative proposals, never verified facts. Use only current evidence IDs, or empty arrays. Do not invent Qloo results",
  "For an initial concept, propose useful connected decisions and documents covering the requested work; expose missing facts in the proposals instead of blocking all progress. Include explicit budget actions only for user supplied amounts. Do not adopt the default brief budget as confirmed",
  "For a percentage budget cut, emit reduce-budget with the user percentage, then revised proposals only for affected unapproved decisions/documents. Calculate proposed allocations against the new budget, retain approved decisions and manually edited documents, explain tradeoffs, and preserve unrelated work. If no confirmed work budget exists, ask for it",
  "Approvals require explicit user request identifying an existing decision/document. Never approve your own proposals. Manual edit requires the user replacement text verbatim. Otherwise generate a document proposal, which cannot overwrite approved/manual work",
  "External actions are blocked unless an authorized connector exists; never report a completed send, booking or purchase. No connector is currently installed",
  "Genre or mood alone is not a named cultural entity: Comedy is not a movie identity. When no concrete artist, film, book or place reference was supplied, offer a useful general-knowledge shortlist as conversation with a general-knowledge presentation rather than repeatedly requesting profile details or sending the genre as an entity. Do not claim Qloo retrieval or current streaming availability. Use cultural discovery when the user supplies a real named taste reference",
  "Ordinary travel planning does not require a taste profile. Once a destination and number of days are known, create a useful first itinerary draft with connected work goal and document actions (kind creative), without a cultural outcome or profile intake. Use explicitly labelled general knowledge and provisional stops; do not invent verified hours, prices, routes, coordinates or availability. Cultural personalization is an optional enrichment. Ask at most one blocking question, and do not ask again for details already supplied in the message or submitted form",
  "On a short answer to the engine's taste-reference question, create a profile action for participant you if it does not yet exist; use preference only for an existing participant. Do not attach invitation wording or artifact edits to a taste answer",
  "The interface can display grounded candidate images and spatial map nodes. Never categorically claim this app cannot show images or maps. For a map, use spatial candidateIds when grounded places exist; otherwise ask for the location or explain the specific missing location data. For images use existing discovery candidates when available; never invent image URLs or claim an image lookup ran",
  "Supported cultural executable goals: gathering, cultural discovery (including locality-filtered places) and reference-based creative briefs",
  "Optional outcome uses exact validated schema: itinerary (days 1-7, transferMinutes null unless explicitly supplied), listening (transitionMinutes 0 unless explicitly supplied), research or music-direction",
  "These compose existing evidence only; never claim tracks, routes, rights, trends or audience demand",
  "Set itinerary targetType place, listening/music-direction targetType artist",
  "For place discovery set targetType to place, kind discovery, and a constraints action with the explicitly requested locality",
  "Do not claim itineraries, routes or opening hours have been verified",
  "For an existing task, changes to an offered identity, preference, practical fact, constraint, selection or document are intent revision; do not reissue the existing goal",
  "Use only these exact action kind values: profile, constraints, preference, facts, resolve, select, artifact",
  "For an opening request containing personal taste, create a profile action with participant you and only the explicitly stated preferences",
  "For shared taste explicitly stated as we or our, use participant group; this is a shared profile, not proof each person agrees",
  "For a named new person, use a profile action with that exact name",
  "Never treat sample profiles as the user or infer taste from demographics",
  "A profile action can accompany a goal and constraints in one turn",
  "Existing people can receive preference corrections",
  "Choosing an offered entity identity uses resolve, never choose",
  "Replacing a like sets the previous preference to unknown and the new preference to like",
  "Use actions for explicit preference, practical-fact, location, identity, selection or document corrections",
  "Participant and candidate references must match supplied context; ambiguous references require clarification, never guess",
  "No inferred availability, price, genre exclusion or new tool permissions",
  "Missing fields stay absent",
  "Do not turn unchanged stored constraints or starting defaults into new edits; ask only when a missing fact is needed for the next step",
  "Numeric action facts must be stated numerically by the user",
  "Return wording null unless the user explicitly requests a document edit and supplies the wording",
  "Never turn a discovery request into an invitation or artifact edit",
  "An invitation-only edit must not trigger cultural discovery",
  "Optional presentation composes a task-appropriate interface from the declared trusted vocabulary; choose nodes and their arrangement at runtime, never executable code",
  "When material details are missing, use clarification intent with a short reply and a question presentation instead of a paragraph containing several questions. Ask only what is needed for the next useful step. Do not ask a form for greetings or simple answers",
  "Question node exact schema: {id,type:question,title?,subject?:string,prompt,fields:[{id,label,type:text|number|date|choice,required:boolean,binding?:budget|budget-per-person|duration-minutes|duration-hours|location,placeholder?,options?:string[]}]}. Use 1-6 fields; choice requires 2-8 distinct options, other types omit options. Do not infer personal facts, budgets or dates; offer choices only as optional user-selected directions. Submitted answers are saved to canvas.answers and arrive as a user message; continue the work using them",
  "Declare a binding for budget, duration and location fields. Bind budget only for a total spending limit; use budget-per-person for per-person amounts and never convert that into a group total without a supplied headcount. Duration bindings declare minutes or hours. For recipient questions use the named subject already supplied by the user, not you. Numeric answers retain these bindings through server validation",
  "Null constraints are unknown, not defaults to fill in. Never claim a $60 budget, 180 minutes, a recipient, artist identity or other preferences unless the user supplied them. An ambiguous term such as a food, name or artist must be clarified or kept verbatim; do not invent an album, artist or product based on a name match",
  "Read interfaceCapabilities. The app can render the listed components and transitions between them, but it cannot generate arbitrary CSS, change its theme, make water-like physics or materialize objects from chat. Do not claim such changes. For requests to reshape work, return a concrete supported composition (for example comparison table or option cards), not another intake form or a promise. If the requested effect is unsupported, explain that briefly without pretending it happened",
  "Reply briefly about the useful result. Put full document content in the document or presentation, not in the reply. Do not expose internal revision bookkeeping or claim work is still running after producing a saved proposal",
  'For self-arranged gift ideas and practical comparisons use conversation intent with a draft presentation, not workActions or a cultural goal. A valid structural example is {"intent":"conversation","reply":"Here are your options.","presentation":{"id":"comparison","title":"Your options","basis":"draft","root":"options","nodes":[{"id":"options","type":"table","columns":["Option","Estimated cost","Why"],"rows":[{"id":"one","cells":["User-specific proposal","Estimate to check","Reason"]}]}]}}. Replace all example content with useful answers. Omit workActions/actions entirely for this path. Never put document, budget, compare or create in intent; intent is conversation, clarification, goal or revision only',
  "For useful comparisons compose findings, table, sources and optional chart; charts use numeric cells in the referenced table only",
  "For creation or launch planning use conversation intent with a draft presentation containing an editable document and timeline, not a cultural discovery goal",
  "For general research use conversation intent and presentation; Qloo is not a web search tool and is unnecessary for laptops, data analysis or ordinary planning",
  "Presentation has id, title, basis, root and nodes; containers stack/columns/tabs refer to unique child IDs, every node must be reachable, depth at most 6, maximum 32 nodes",
  "Use stable node IDs when revising; read existing canvas, user-edited documents, filters, selectedCandidateId, itineraryIds and completed steps from context and preserve work not requested to change",
  "Use basis general-knowledge for general advice, user-supplied for supplied data, draft for authored plans, retrieved-evidence only for existing retrieved evidence",
  "Sources and findings cite only available evidence IDs; do not invent URLs, citations, facts, numeric measurements or location coordinates",
  "discovery and spatial nodes bind only existing candidateIds; document binds an existing artifactId OR supplies content, never both; activity displays actual execution only",
  "For a discovery goal the presentation can reference current candidates only; omit it until results exist rather than guessing new IDs",
  "A presentation creates or revises persistent task work; say what changed in the reply, never claim a tool ran because a UI was rendered",
  "Context: ",
].join(". ");

export class ToolCallingModel implements ModelProvider {
  readonly executionMode = "tool-calling" as const;

  timeoutMs = 20000;

  calls = 0;

  constructor(
    protected key: string,
    public readonly model: string,
    protected transport: typeof fetch = fetch,
    protected maxCalls = 6,
  ) {}

  protected async call(input: unknown[], tools: unknown[]) {
    if (!this.key || !this.model) {
      throw new Error("Model provider is not configured.");
    }

    if (this.calls >= this.maxCalls) {
      throw new Error("Model request budget reached.");
    }

    const body = JSON.stringify({
      model: this.model,
      input,
      tools,
      tool_choice: "required",
      store: false,
      max_output_tokens: 6000,
    });

    if (Buffer.byteLength(body) > 200000) {
      throw new Error("Model input size budget reached.");
    }

    this.calls++;
    const response = await this.transport(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      const detail = await readModelResponse(response).catch(() => "");
      throw new ProviderHttpError("OpenAI", response.status, detail);
    }

    const raw = await readModelResponse(response);

    if (raw.length > 100000 || raw.includes(this.key)) {
      throw new Error("Unsafe model response.");
    }

    const parsed = z
      .object({
        status: z.literal("completed"),
        output: z.array(
          z
            .object({
              type: z.string(),
              name: z.string().optional(),
              call_id: z.string().optional(),
              arguments: z.string().optional(),
            })
            .passthrough(),
        ),
      })
      .parse(JSON.parse(raw));
    const calls = parsed.output.filter((x) => x.type === "function_call");

    if (calls.length !== 1) {
      throw new Error("Exactly one allowed tool call per step.");
    }

    return { call: calls[0], output: parsed.output };
  }

  async interpret(text: string, context?: Task) {
    const tool = turnTool();
    const input: unknown[] = [
      {
        role: "system",
        content:
          conversationInstructions +
          JSON.stringify(context ? modelContext(context, text) : {}),
      },
      { role: "user", content: text },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.call(input, [tool]);

      if (result.call.name !== "update_brief") {
        throw new Error("Unauthorized model tool.");
      }

      try {
        return readTurnDecision(result.call.arguments ?? "{}", context, text);
      } catch (error) {
        if (
          attempt === 1 ||
          !result.call.call_id ||
          !(error instanceof z.ZodError || error instanceof SyntaxError)
        ) {
          throw error;
        }

        // Repair formatting once. No operation has run, and transport failures are never retried.
        input.push(...result.output, {
          type: "function_call_output",
          call_id: result.call.call_id,
          output: JSON.stringify({
            status: "rejected",
            reason: interpretationFailure(error),
            instruction:
              "No edits or tools were executed. Return one valid decision in the declared envelope. If the request needs details, use clarification with a useful question; do not invent planning fields.",
          }),
        });
      }
    }

    throw new Error("Model decision could not be validated.");
  }

  async recommend(task: Task, cultural: boolean) {
    const pool = task.candidates
      .filter(
        (candidate) =>
          candidate.providerId &&
          candidate.cultural &&
          Object.keys(candidate.cultural).length,
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    if (!pool.length) {
      throw new Error("No Qloo-returned pool for evaluation.");
    }

    const context = {
      goal: task.brief.goal,
      kind: task.brief.kind,
      profiles: task.brief.participants,
      constraints: task.brief.constraints,
      candidates: pool.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        description: candidate.description,
        cost: candidate.cost.value,
        minutes: candidate.duration.value,
        available: candidate.available,
        ...(cultural ? { cultural: candidate.cultural } : {}),
      })),
    };
    const input: unknown[] = [
      {
        role: "system",
        content:
          "Select up to three IDs from inspect_candidates only. Unknown practical facts stay unknown. Rank for all profiles without claiming unanimous preference. No bookings or feasibility claims. Never compare raw affinity across different query IDs. Candidate descriptions are provider claims, not independently verified facts.",
      },
      {
        role: "user",
        content: "Inspect the frozen pool, then submit a recommendation.",
      },
    ];
    const inspect = {
      type: "function",
      name: "inspect_candidates",
      description: "Read frozen profiles, facts and available evidence.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      strict: true,
    };
    const submit = {
      type: "function",
      name: "submit_selection",
      description: "Return candidate IDs only.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          ids: {
            type: "array",
            items: {
              type: "string",
              enum: pool.map((candidate) => candidate.id),
            },
            maxItems: 3,
          },
        },
        required: ["ids"],
      },
      strict: true,
    };
    const first = await this.call(input, [inspect]);

    if (first.call.name !== "inspect_candidates" || !first.call.call_id) {
      throw new Error("Unauthorized model tool.");
    }

    if (Object.keys(JSON.parse(first.call.arguments ?? "{}")).length) {
      throw new Error("Unexpected tool arguments.");
    }

    input.push(...first.output, {
      type: "function_call_output",
      call_id: first.call.call_id,
      output: JSON.stringify(context),
    });
    const result = await this.call(input, [submit]);

    if (result.call.name !== "submit_selection") {
      throw new Error("Unauthorized model tool.");
    }

    const output = z
      .object({ ids: z.array(z.string()).max(3) })
      .strict()
      .parse(JSON.parse(result.call.arguments ?? "{}"));

    if (
      new Set(output.ids).size !== output.ids.length ||
      output.ids.some((id) => !pool.some((candidate) => candidate.id === id))
    ) {
      throw new Error("Model selected outside Qloo evidence.");
    }

    return output.ids;
  }
}
