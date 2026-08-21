import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectManifest } from "@domain";
import { desktopHint, isDesktop } from "./desktop";
import { AppPrompt } from "./AppPrompt";
import { TitleBar } from "./TitleBar";
import type { Project } from "./project";

type OpenedProject = { root: string; manifest: ProjectManifest };

type Props = {
  recents: Project[];
  modelLabel: string;
  configured: boolean;
  worksDir: string;
  onOpenSettings: () => void;
  onOpenProject: (project: Project) => void;
  onRecentsChange: (projects: Project[]) => void;
};

type PromptKind = "name" | "need-dir" | "browser" | "open-empty" | "error" | null;

export function HomeView({ recents, modelLabel, configured, worksDir, onOpenSettings, onOpenProject, onRecentsChange }: Props) {
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [title, setTitle] = useState("未命名故事");
  const [pendingRoot, setPendingRoot] = useState("");
  const [errorText, setErrorText] = useState("");

  async function rememberAndOpen(root: string, manifest: ProjectManifest) {
    await invoke("remember_project", { root });
    const project = { root, manifest };
    onRecentsChange([project, ...recents.filter((item) => item.root !== root)]);
    onOpenProject(project);
  }

  async function startNew() {
    if (!isDesktop()) { setPrompt("browser"); return; }
    if (!worksDir) { setPrompt("need-dir"); return; }
    setTitle("未命名故事");
    setPrompt("name");
  }

  async function confirmNew() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    try {
      const created = await invoke<OpenedProject>("create_project_in_library", { title: nextTitle, kind: "serial-novel" });
      setPrompt(null);
      await rememberAndOpen(created.root, created.manifest);
    } catch (error) {
      setErrorText(String(error));
      setPrompt("error");
    }
  }

  async function openExisting() {
    if (!isDesktop()) { setPrompt("browser"); return; }
    const selected = await open({ directory: true, multiple: false, title: "打开已有作品文件夹" });
    if (typeof selected !== "string") return;
    try {
      const manifest = await invoke<ProjectManifest>("read_manifest", { root: selected });
      await rememberAndOpen(selected, manifest);
    } catch {
      setPendingRoot(selected);
      setTitle("未命名故事");
      setPrompt("open-empty");
    }
  }

  async function confirmCreateInFolder() {
    const nextTitle = title.trim();
    if (!nextTitle || !pendingRoot) return;
    try {
      const manifest = await invoke<ProjectManifest>("create_project", { root: pendingRoot, title: nextTitle, kind: "serial-novel" });
      setPrompt(null);
      await rememberAndOpen(pendingRoot, manifest);
    } catch (error) {
      setErrorText(String(error));
      setPrompt("error");
    }
  }

  return (
    <main className="home app">
      <TitleBar
        onOpenSettings={onOpenSettings}
        trailing={
          <span className={`model-chip ${configured ? "" : "warn"}`}>
            {configured ? modelLabel : "未配置模型"}
          </span>
        }
      />
      <section className="home-content">
        <div className="home-library">
          <div className="home-recent">
            <h2>最近作品</h2>
            {recents.length === 0 ? (
              <p className="home-empty">还没有作品。新建或打开一个文件夹即可出现在这里。</p>
            ) : recents.map((project) => (
              <button className="recent-item" key={project.root} onClick={() => onOpenProject(project)}>
                <span className="dot blue" />
                <span>
                  <strong>{project.manifest.title}</strong>
                  <small>{project.root}</small>
                </span>
                <span className="chevron"><CaretRight size={16} weight="bold" /></span>
              </button>
            ))}
          </div>
          <aside className="home-actions">
            <button className="generate" onClick={() => void startNew()}>新建作品</button>
            <button className="button" onClick={() => void openExisting()}>打开文件夹</button>
            <p>{worksDir ? `会在「${worksDir}」下自动创建作品文件夹。` : "先在设置中选择保存位置，之后新建时会自动创建文件夹。"}</p>
          </aside>
        </div>
      </section>

      <AppPrompt
        open={prompt === "name"}
        title="作品名称"
        hint="将在你设置的保存位置下自动创建同名文件夹。"
        value={title}
        confirmLabel="创建"
        onChange={setTitle}
        onCancel={() => setPrompt(null)}
        onConfirm={() => void confirmNew()}
      />
      <AppPrompt
        open={prompt === "need-dir"}
        title="先选择保存位置"
        hint="新建作品会自动创建文件夹，请先在设置中指定默认保存位置。"
        showInput={false}
        confirmLabel="去设置"
        onCancel={() => setPrompt(null)}
        onConfirm={() => { setPrompt(null); onOpenSettings(); }}
      />
      <AppPrompt
        open={prompt === "browser"}
        title="需要桌面应用"
        hint={desktopHint()}
        showInput={false}
        confirmLabel="知道了"
        onCancel={() => setPrompt(null)}
        onConfirm={() => setPrompt(null)}
      />
      <AppPrompt
        open={prompt === "open-empty"}
        title="作品名称"
        hint="这个文件夹还没有作品，创建后会作为新作品打开。"
        value={title}
        confirmLabel="创建"
        onChange={setTitle}
        onCancel={() => setPrompt(null)}
        onConfirm={() => void confirmCreateInFolder()}
      />
      <AppPrompt
        open={prompt === "error"}
        title="无法创建作品"
        hint={errorText}
        showInput={false}
        confirmLabel="知道了"
        onCancel={() => setPrompt(null)}
        onConfirm={() => setPrompt(null)}
      />
    </main>
  );
}
