export type ProjectKind = "serial-novel" | "long-form" | "short-story" | "script" | "interactive";

export interface Chapter {
  id: string;
  title: string;
  goal: string;
}

export interface ProjectManifest {
  schema_version: number;
  id: string;
  title: string;
  kind: ProjectKind;
  created_at: string;
  updated_at: string;
  chapters: Chapter[];
}

export interface RichTextDocument {
  schemaVersion: number;
  chapterId: string;
  savedAt: string;
  content: Record<string, unknown>;
}
