export function buildContinuePrompt(instruction: string, chapterText: string): string {
  const requirement = instruction.trim() || "（无）";
  return `你是小说续写助手。根据作者要求和当前章节正文，直接输出可插入的续写段落，不要前言、不要条目列表。\n\n作者要求：\n${requirement}\n\n当前章节正文：\n${chapterText}`;
}
