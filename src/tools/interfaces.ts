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

export interface CulturalProvider {
  readonly calls?: number;
  timeoutMs?: number;
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
  interpret(text: string, context?: Task): Promise<ModelInterpretation>;
}
