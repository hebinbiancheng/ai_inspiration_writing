import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ProjectManifest } from "@domain";
import { PROFILE_ID, desktopHint, isDesktop } from "./desktop";
import { buildContinuePrompt } from "./continuePrompt";
import type { Project } from "./project";

type Props = {
  project: Project;
  modelLabel: string;
  configured: boolean;
  glass: boolean;
  onToggleGlass: () => void;
  onOpenSettings: () => void;
  onBackHome: () => void;
  onProjectChange: (project: Project) => void;
};

const emptyChapterHtml = (title: string) => `<h2>${title}</h2><p>从这里开始写作……</p>`;

export function WorkbenchView({ project, modelLabel, configured, glass, onToggleGlass, onOpenSettings, onBackHome, onProjectChange }: Props) {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState(project.root ? "已打开作品" : desktopHint());
  const [candidate, setCandidate] = useState("");
  const [candidateMode, setCandidateMode] = useState("尚无候选");
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const chapters = project.manifest.chapters;
  const currentChapter = chapters[chapterIndex] ?? chapters[0];

  const editor = useEditor({
    extensions: [StarterKit],
    content: emptyChapterHtml(currentChapter?.title ?? "第 01 章"),
    onUpdate: ({ editor: current }) => {
      setSaveState("有未保存修改 · 刚刚");
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveCurrent(current.getJSON()), 900);
    },
  });

  useEffect(() => {
    if (editor && currentChapter) void loadChapter();
  }, [project.root, chapterIndex, editor, currentChapter?.id]);

  async function persistManifest(manifest: ProjectManifest) {
    if (!project.root) return;
    const saved = await invoke<ProjectManifest>("save_manifest", { root: project.root, manifest });
    onProjectChange({ ...project, manifest: saved });
  }

  async function addChapter() {
    const title = window.prompt("新章节名称", `第 ${String(chapters.length + 1).padStart(2, "0")} 章`)?.trim();
    if (!title) return;
    const chapter = { id: `chapter-${Date.now()}`, title, goal: "" };
    await persistManifest({ ...project.manifest, chapters: [...chapters, chapter] });
    setChapterIndex(chapters.length);
  }

  async function renameChapter() {
    if (!currentChapter) return;
    const title = window.prompt("重命名章节", currentChapter.title)?.trim();
    if (!title) return;
    await persistManifest({ ...project.manifest, chapters: chapters.map((chapter) => chapter.id === currentChapter.id ? { ...chapter, title } : chapter) });
  }

  async function removeChapter() {
    if (!currentChapter || chapters.length <= 1 || !window.confirm(`删除“${currentChapter.title}”？此操作不可撤销。`)) return;
    if (project.root) await invoke("delete_chapter", { root: project.root, chapterId: currentChapter.id });
    await persistManifest({ ...project.manifest, chapters: chapters.filter((chapter) => chapter.id !== currentChapter.id) });
    setChapterIndex(Math.max(0, chapterIndex - 1));
  }

  async function loadChapter() {
    if (!editor || !currentChapter) return;
    if (!project.root) {
      editor.commands.setContent(emptyChapterHtml(currentChapter.title), { emitUpdate: false });
      setSaveState(desktopHint());
      return;
    }
    try {
      const doc = await invoke<{ content?: object } | null>("read_document", { root: project.root, relativePath: `manuscript/${currentChapter.id}.json` });
      editor.commands.setContent(doc?.content ?? emptyChapterHtml(currentChapter.title), { emitUpdate: false });
      setSaveState("已载入 · 刚刚");
    } catch (error) {
      setSaveState(`载入失败 · ${String(error)}`);
    }
  }

  async function saveCurrent(content = editor?.getJSON()) {
    if (!content || !currentChapter) return;
    if (!project.root) { setSaveState("浏览器预览 · 内容仅保留在当前页面"); return; }
    setSaveState("正在保存…");
    try {
      await invoke("save_document", {
        root: project.root,
        relativePath: `manuscript/${currentChapter.id}.json`,
        document: { schemaVersion: 1, chapterId: currentChapter.id, savedAt: new Date().toISOString(), content },
      });
      setSaveState("已自动保存 · 刚刚");
    } catch (error) {
      setSaveState(`保存失败 · ${String(error)}`);
    }
  }

  async function snapshot() {
    if (!editor || !currentChapter || !project.root) { setSaveState(project.root ? "没有可快照的正文" : desktopHint()); return; }
    try {
      await invoke("snapshot_document", {
        root: project.root,
        chapterId: currentChapter.id,
        document: { schemaVersion: 1, chapterId: currentChapter.id, savedAt: new Date().toISOString(), content: editor.getJSON() },
      });
      setSaveState("已创建快照 · 刚刚");
    } catch (error) {
      setSaveState(`快照失败 · ${String(error)}`);
    }
  }

  async function generate() {
    if (!isDesktop()) { setCandidateMode("需要桌面应用"); setCandidate(desktopHint()); return; }
    if (!configured) { setCandidateMode("未配置模型"); setCandidate("请先在设置中配置 OpenAI 兼容接口。"); onOpenSettings(); return; }
    setBusy(true);
    setCandidateMode("续写 · 生成中");
    try {
      const text = await invoke<string>("ai_complete", { profileId: PROFILE_ID, prompt: buildContinuePrompt(draft, editor?.getText() ?? "") });
      setCandidate(text);
      setCandidateMode("续写候选");
    } catch (error) {
      setCandidate(String(error));
      setCandidateMode("连接失败");
    } finally {
      setBusy(false);
    }
  }

  async function acceptCandidate() {
    if (!editor || !candidate || !currentChapter) return;
    if (project.root) {
      await invoke("snapshot_document", {
        root: project.root,
        chapterId: currentChapter.id,
        document: { schemaVersion: 1, chapterId: currentChapter.id, savedAt: new Date().toISOString(), content: editor.getJSON() },
      });
    }
    editor.chain().focus().insertContent(`<p>${candidate.replace(/\n+/g, "</p><p>")}</p>`).run();
    setCandidate("");
    setCandidateMode("已写入正文");
  }

  async function openAnother() {
    if (!isDesktop()) { setSaveState(desktopHint()); return; }
    const selected = await open({ directory: true, multiple: false, title: "打开或新建作品文件夹" });
    if (typeof selected !== "string") return;
    let manifest: ProjectManifest;
    try { manifest = await invoke("read_manifest", { root: selected }); }
    catch {
      const title = window.prompt("作品名称", "未命名故事")?.trim();
      if (!title) return;
      manifest = await invoke("create_project", { root: selected, title, kind: "serial-novel" });
    }
    await invoke("remember_project", { root: selected });
    onProjectChange({ root: selected, manifest });
    setChapterIndex(0);
  }

  return (
    <main className={glass ? "app desktop-glass" : "app"}>
      <header className="topbar">
        <div className="brand">
          <button className="back-home" onClick={onBackHome}>‹</button>
          <span className="brand-mark">✦</span>
          <span>灵感</span>
        </div>
        <div className="top-actions">
          <button className="button" onClick={onToggleGlass}>◐ {glass ? "桌面玻璃" : "标准窗口"}</button>
          <button className="icon-button" aria-label="设置" onClick={onOpenSettings}>⚙</button>
        </div>
      </header>
      <section className="workspace">
        <aside className="panel sidebar">
          <div className="panel-heading"><strong>我的作品</strong><button className="icon-button" title="打开或新建作品" onClick={() => void openAnother()}>＋</button></div>
          <button className="project active"><span className="dot blue" />{project.manifest.title}</button>
          <div className="section-heading"><p className="eyebrow">作品结构</p><button onClick={() => void addChapter()}>＋ 章节</button></div>
          {chapters.map((chapter, index) => (
            <button className={`chapter ${index === chapterIndex ? "selected" : ""}`} key={chapter.id} onClick={() => setChapterIndex(index)}>{chapter.title}</button>
          ))}
          <div className="chapter-actions">
            <button onClick={() => void renameChapter()}>重命名</button>
            <button onClick={() => void removeChapter()}>删除</button>
          </div>
        </aside>
        <section className="panel editor">
          <div className="editor-head">
            <div className="breadcrumbs">{project.manifest.title}</div>
            <div className="title-row">
              <div><h1>{currentChapter?.title}</h1><p>{currentChapter?.goal || "填写本章目标"}</p></div>
              <button className="button" onClick={() => void snapshot()}>创建快照</button>
            </div>
            <div className="toolbar">
              <button onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive("bold") ? "active" : ""}><b>B</b></button>
              <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={editor?.isActive("italic") ? "active" : ""}><i>I</i></button>
              <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H</button>
              <button onClick={() => editor?.chain().focus().setParagraph().run()}>Aa</button>
              <button onClick={() => editor?.chain().focus().toggleBulletList().run()}>≡</button>
              <span className="toolbar-spacer" />
              <button onClick={() => (window as unknown as { find: (text: string) => boolean }).find(window.prompt("查找正文") || "")}>⌕</button>
            </div>
          </div>
          <div className="editor-scroll"><EditorContent className="manuscript" editor={editor} /></div>
          <footer className="editor-footer"><span>{saveState}</span><span>{editor?.getText().length ?? 0} 字　· 作者创作</span></footer>
        </section>
        <aside className="panel assistant">
          <div className="panel-heading"><strong>AI 协作</strong><span className="model-chip">{modelLabel || "未配置"}</span></div>
          <p className="context">当前上下文：{currentChapter?.title}</p>
          <div className="quick-actions"><button className="button" onClick={() => void generate()}>继续写</button></div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="告诉 AI 你想怎么续写…" />
          <button className="generate" disabled={busy} onClick={() => void generate()}>{busy ? "生成中…" : "生成候选　↗"}</button>
          <div className="suggestion">
            <strong>{candidateMode}</strong>
            <p>{candidate || "生成后会在这里一次显示完整候选。"}</p>
            <div>
              <button className="button" disabled={!candidate} onClick={() => window.alert(candidate)}>预览全文</button>
              <button className="button" disabled={!candidate} onClick={() => void acceptCandidate()}>接受写入</button>
              <button className="button" disabled={!candidate} onClick={() => { setCandidate(""); setCandidateMode("已拒绝"); }}>拒绝</button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
