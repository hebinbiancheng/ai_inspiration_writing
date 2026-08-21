import type { KnowledgeKind } from "./knowledge";
import { KNOWLEDGE_PAGES } from "./knowledge";

export type ContinueContext = {
  instruction: string;
  chapterTitle: string;
  chapterGoal: string;
  chapterText: string;
  knowledge: Partial<Record<KnowledgeKind, string>>;
};

export function buildContinuePrompt(context: ContinueContext): string {
  const requirement = context.instruction.trim() || "（无额外要求）";
  const goal = context.chapterGoal.trim() || "（未填写）";
  const filled = KNOWLEDGE_PAGES
    .map((page) => ({ title: page.title, content: context.knowledge[page.id]?.trim() ?? "" }))
    .filter((item) => item.content);
  const lore = filled.length
    ? filled.map((item) => `【${item.title}】\n${item.content}`).join("\n\n")
    : "（作者尚未填写大纲、细纲、世界观、世界线或人物。不要擅自发明复杂设定、金手指体系或未出现的势力，保持克制，优先写人物行动与现场。）";

  return [
    "你是小说续写助手。必须遵守已确认的作品资料，不得自由改写设定、时间线或人物关系。",
    "直接输出可插入的续写段落，不要前言、不要条目列表、不要解释。",
    "",
    "作品资料：",
    lore,
    "",
    `当前章节：${context.chapterTitle}`,
    `本章目标：${goal}`,
    `作者要求：${requirement}`,
    "",
    "当前章节正文：",
    context.chapterText,
  ].join("\n");
}
