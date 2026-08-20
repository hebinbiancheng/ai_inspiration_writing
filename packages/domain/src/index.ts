export type ProjectKind = "serial-novel" | "long-form" | "short-story" | "script" | "interactive";

export interface ProjectManifest {
  schemaVersion: number;
  id: string;
  title: string;
  kind: ProjectKind;
  createdAt: string;
  updatedAt: string;
}

export interface RichTextDocument {
  schemaVersion: number;
  content: Record<string, unknown>;
}

export interface AiCandidate {
  id: string;
  chapterId: string;
  operation: "continue" | "rewrite" | "review";
  status: "draft" | "accepted" | "discarded";
  content: RichTextDocument;
  reason: string;
  model: string;
}
