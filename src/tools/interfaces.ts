import type { ResearchSource } from "./live-research";
import type {
  CandidateInput,
  Entity,
  Evidence,
  Participant,
  ToolResult,
  Task,
  ModelInterpretation,
} from "../core/contracts";

export interface DiscoveryInput {
  anchor?: { providerId: string; name: string; type: Entity["type"] };
  targetTypes?: ("movie" | "tv_show" | "artist" | "place")[];
  entities?: Entity[];
  participants: Participant[];
  catalogue: CandidateInput[];
  location: string;
  version: number;
  mode: string;
}

/** Local Qloo results are candidate *leads*, never verified game availability,
 * prices, reservations or personalized taste affinity without a taste signal. */
export interface LocalPlaceLead {
  providerId: string;
  name: string;
  description: string;
  website: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
}
export interface LocalPlaceResult {
  places: LocalPlaceLead[];
  evidence: Evidence[];
}

export interface CulturalProvider {
  readonly calls?: number;
  timeoutMs?: number;
  exploreLocality?(
    location: string,
    interests: string,
  ): Promise<ToolResult<LocalPlaceResult>>;
  resolve(text: string, type?: Entity["type"]): Promise<ToolResult<Entity>>;
  discover(
    input: DiscoveryInput,
  ): Promise<ToolResult<{ options: CandidateInput[]; evidence: Evidence[] }>>;
  rank?(input: DiscoveryInput): Promise<ToolResult<{ ids: string[] }>>;
}

export interface PracticalFactsProvider {
  check(
    options: CandidateInput[],
    location: string,
  ): Promise<ToolResult<CandidateInput[]>>;
}

export interface ResearchRoute {
  intent: "research";
  query: string;
}

export interface DraftRoute {
  intent: "draft";
}

export interface DraftAnswer {
  title: string;
  content: string;
}

export interface ResearchAnswer {
  text: string;
  sourceIds: string[];
}

/** Read-only agent actions; the runtime validates the tool and every argument. */
export type ResearchStep =
  | { action: "finish" }
  | { action: "search"; query: string }
  | { action: "read"; sourceId: string };

export interface ModelProvider {
  readonly failures?: readonly {
    provider: string;
    status: number;
    category: string | null;
  }[];
  readonly executionMode?: "scripted" | "tool-calling";
  readonly model?: string;
  readonly calls?: number;
  timeoutMs?: number;
  recommend?(task: Task, cultural: boolean): Promise<string[]>;
  /** Optional read-only conversation route; null delegates to the full interpreter. */
  routeConversation?(
    text: string,
    context?: Task,
  ): Promise<ModelInterpretation | ResearchRoute | DraftRoute | null>;
  /** Recovery after a rejected full planner: may only produce a read-only reply. */
  recoverConversation?(
    text: string,
    context?: Task,
  ): Promise<ModelInterpretation | null>;
  /** Decide the next read-only tool after observing actual research responses. */
  chooseResearchStep?(
    question: string,
    sources: ResearchSource[],
    context: Task,
    remainingActions: number,
  ): Promise<ResearchStep>;
  synthesizeResearch?(
    question: string,
    sources: ResearchSource[],
    context: Task,
  ): Promise<ResearchAnswer>;
  composeDraft?(text: string, context: Task): Promise<DraftAnswer>;
  interpret(text: string, context?: Task): Promise<ModelInterpretation>;
}
