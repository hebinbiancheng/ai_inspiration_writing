import { ArrowRight } from "@phosphor-icons/react";
import type { KnowledgeKind } from "./knowledge";
import { KNOWLEDGE_PAGES, knowledgeFilled } from "./knowledge";
import type { Project } from "./project";

type Props = {
  project: Project;
  knowledge: Record<KnowledgeKind, string>;
  onOpenChapter: (index: number) => void;
  onOpenKnowledge: (kind: KnowledgeKind) => void;
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "上午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function DashboardPane({ project, knowledge, onOpenChapter, onOpenKnowledge }: Props) {
  const filled = knowledgeFilled(knowledge);
  const chapters = project.manifest.chapters;
  const dateLabel = new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="dash-pane">
      <p className="eyebrow">{dateLabel}</p>
      <h1>{greeting()}。</h1>
      <p className="dash-subtitle">{project.manifest.title}。打开作品后先整理资料，再进入章节写作。</p>
      <div className="stat-row">
        <div className="stat"><span>章节</span><b>{chapters.length}</b><small>可继续写当前章</small></div>
        <div className="stat"><span>已填资料</span><b>{filled} / {KNOWLEDGE_PAGES.length}</b><small>空页不约束续写</small></div>
        <div className="stat"><span>资料状态</span><b>{filled ? "手写中" : "待填写"}</b><small>确认机制下一轮再做</small></div>
      </div>
      <div className="dash-focus">
        <h3>接下来</h3>
        <button className="task primary" onClick={() => onOpenChapter(0)}>
          <span className="check"><ArrowRight size={14} weight="bold" /></span>
          <span>进入第 01 章写作台</span>
          <small>三栏续写</small>
        </button>
        <button className="task" onClick={() => onOpenKnowledge("outline")}>
          <span className="check"><ArrowRight size={14} weight="bold" /></span>
          <span>先写大纲和世界观</span>
          <small>避免自由发挥</small>
        </button>
      </div>
      <h3 className="dash-section">作品资料</h3>
      <div className="knowledge-grid">
        {KNOWLEDGE_PAGES.map((page) => {
          const filledPage = Boolean(knowledge[page.id]?.trim());
          return (
            <button className="knowledge-card" key={page.id} onClick={() => onOpenKnowledge(page.id)}>
              <strong>{page.title}</strong>
              <p>{page.hint}</p>
              <span>{filledPage ? "已填写" : "空白，点此编辑"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
