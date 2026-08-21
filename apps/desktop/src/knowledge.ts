export type KnowledgeKind = "outline" | "detailed-outline" | "worldview" | "timeline" | "characters" | "foreshadowing";

export type KnowledgePage = {
  id: KnowledgeKind;
  title: string;
  hint: string;
  placeholder: string;
};

export const KNOWLEDGE_PAGES: KnowledgePage[] = [
  { id: "outline", title: "大纲", hint: "卷、章、主线冲突。续写时作为结构约束。", placeholder: "第一卷主线：\n第 01 章：\n第 02 章：" },
  { id: "detailed-outline", title: "细纲", hint: "每章场景、节拍、信息投放。", placeholder: "第 01 章细纲：\n- 开场\n- 冲突\n- 章末钩子" },
  { id: "worldview", title: "世界观", hint: "规则、力量体系、时代与地理。", placeholder: "世界规则：\n力量体系：\n禁忌：" },
  { id: "timeline", title: "世界线", hint: "时间线、重大事件、因果顺序。", placeholder: "时间线：\n- 事件 A\n- 事件 B" },
  { id: "characters", title: "人物", hint: "人物卡、关系、动机与口吻。", placeholder: "主角：\n能力：\n关系：" },
  { id: "foreshadowing", title: "伏笔", hint: "已埋设与待回收，避免续写踩线。", placeholder: "已埋：\n待回收：" },
];

export type KnowledgeDocument = {
  schema_version: number;
  kind: KnowledgeKind;
  saved_at: string;
  content: string;
};

export function knowledgePath(kind: KnowledgeKind): string {
  return `knowledge/${kind}.json`;
}

export function emptyKnowledge(kind: KnowledgeKind): KnowledgeDocument {
  return { schema_version: 1, kind, saved_at: "", content: "" };
}

export function knowledgeFilled(pages: Record<KnowledgeKind, string>): number {
  return KNOWLEDGE_PAGES.filter((page) => pages[page.id]?.trim()).length;
}
