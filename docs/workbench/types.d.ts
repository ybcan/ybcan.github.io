export type Direction = "invest" | "ai" | "govern" | "learn" | "life";
export type Adoption = "candidate" | "adopted" | "deferred" | "rejected";
export type Execution =
  | "unknown"
  | "not_started"
  | "active"
  | "paused"
  | "completed";
export type ArchiveStatus =
  | "waiting_answer"
  | "waiting_feedback"
  | "recorded"
  | "verify";
export type Collection =
  | "goals"
  | "projects"
  | "plans"
  | "archives"
  | "sources"
  | "tasks"
  | "notes"
  | "sites"
  | "experiments";
export interface SourceRef {
  sourceId: string;
  messageId: string;
  excerpt: string;
  kind: "intent" | "suggestion" | "evidence" | "preference";
}
export interface ParentRef {
  collection: "goals" | "projects" | "plans";
  id: string;
}
export interface LinkedRecord {
  parentRef?: ParentRef | null;
  parentCustomized?: boolean;
  id: string;
  directionIds: Direction[];
  goalIds: string[];
  itemIds: string[];
  sourceRefs: SourceRef[];
  origin: "user" | "ai" | "mixed" | "legacy" | "example";
  demo: boolean;
  archived: boolean;
}
export interface Goal extends LinkedRecord {
  title: string;
  why: string;
  status: "active" | "paused" | "archived";
  confirmed: boolean;
}
export interface Item extends LinkedRecord {
  title: string;
  kind: "project" | "learning" | "research" | "method" | "idea";
  adoption: Adoption;
  execution: Execution;
  summary: string;
  nextStep: string;
  acceptance: string;
  practiceRule: string;
  steps: { id: string; title: string; done: boolean }[];
  relations: {
    type: "related" | "method" | "research" | "depends";
    targetId: string;
    confirmed: boolean;
  }[];
}
export interface Archive extends LinkedRecord {
  title: string;
  projectId: string;
  sourceId: string;
  messageIds: string[];
  question: string;
  answer: string;
  feedback: string;
  blindSpots: string;
  nextQuestion: string;
  nextAction: string;
  score: string;
  excerpt: string;
  status: ArchiveStatus;
  sourceTime: string | null;
  capturedAt: string | null;
}
export interface Workspace {
  goals: Goal[];
  projects: Item[];
  archives: Archive[];
  plans: any[];
  sources: any[];
  tasks: any[];
  notes: any[];
  sites: any[];
  experiments: any[];
  imports: {
    baselines: Record<string, any>;
    aliases: Record<string, string>;
    batches: { id: string; fingerprint: string }[];
  };
  revisions: any[];
}
export interface UpdatePacket {
  format: "strategy-workbench-update";
  version: 1;
  batchId: string;
  records: Partial<Record<Collection, Record<string, unknown>[]>>;
}
export interface ImportPreview {
  batchId: string;
  fingerprint: string;
  baseToken: string;
  duplicate: boolean;
  aliases: Record<string, string>;
  changes: {
    collection: Collection;
    id: string;
    incomingId: string;
    key: string;
    current: any;
    incoming: any;
    action: "add" | "update" | "conflict" | "noop";
    fields: {
      name: string;
      current: any;
      incoming: any;
      status: "same" | "update" | "conflict";
      protected: boolean;
    }[];
  }[];
}
