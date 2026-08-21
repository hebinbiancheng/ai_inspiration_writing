import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectManifest } from "@domain";
import { desktopHint, isDesktop } from "./desktop";
import type { Project } from "./project";

type Props = {
  recents: Project[];
  modelLabel: string;
  configured: boolean;
  onOpenSettings: () => void;
  onOpenProject: (project: Project) => void;
  onRecentsChange: (projects: Project[]) => void;
};

export function HomeView({ recents, modelLabel, configured, onOpenSettings, onOpenProject, onRecentsChange }: Props) {
  async function choose(createNew: boolean) {
    if (!isDesktop()) {
      window.alert(desktopHint());
      return;
    }
    const selected = await open({ directory: true, multiple: false, title: createNew ? "选择空文件夹以新建作品" : "打开已有作品文件夹" });
    if (typeof selected !== "string") return;
    let manifest: ProjectManifest;
    try {
      manifest = await invoke<ProjectManifest>("read_manifest", { root: selected });
      if (createNew && !window.confirm(`该文件夹已有作品「${manifest.title}」，要打开它吗？`)) return;
    } catch {
      const title = window.prompt("作品名称", "未命名故事")?.trim();
      if (!title) return;
      manifest = await invoke<ProjectManifest>("create_project", { root: selected, title, kind: "serial-novel" });
    }
    await invoke("remember_project", { root: selected });
    const project = { root: selected, manifest };
    const next = [project, ...recents.filter((item) => item.root !== selected)];
    onRecentsChange(next);
    onOpenProject(project);
  }

  return (
    <main className="home app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><span>灵感</span></div>
        <div className="top-actions">
          <span className="model-chip">{configured ? `已配置 · ${modelLabel}` : "未配置模型"}</span>
          <button className="icon-button" aria-label="设置" onClick={onOpenSettings}>⚙</button>
        </div>
      </header>
      <section className="home-content">
        <div className="home-hero">
          <p className="eyebrow">LOCAL-FIRST</p>
          <h1>工作台</h1>
          <p>新建或打开本地作品，配置你自己的模型 API，然后进入章节写作。</p>
        </div>
        <div className="home-cards">
          <div className="home-card primary">
            <span>✦</span>
            <h3>新建作品</h3>
            <p>选择一个空文件夹，创建可迁移的作品目录。</p>
            <button className="button" onClick={() => void choose(true)}>新建作品　＋</button>
          </div>
          <div className="home-card">
            <span>▣</span>
            <h3>打开已有作品</h3>
            <p>从本地文件夹继续写作。</p>
            <button className="button" onClick={() => void choose(false)}>选择文件夹　→</button>
          </div>
        </div>
        <div className="home-recent">
          <div className="section-heading"><h2>最近作品</h2></div>
          {recents.length === 0 ? <p className="modal-hint">还没有作品。新建或打开一个文件夹即可出现在这里。</p> : recents.map((project) => (
            <button className="recent-item" key={project.root} onClick={() => onOpenProject(project)}>
              <span className="dot blue" />
              <span><strong>{project.manifest.title}</strong><small>{project.root}</small></span>
              <span>→</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
