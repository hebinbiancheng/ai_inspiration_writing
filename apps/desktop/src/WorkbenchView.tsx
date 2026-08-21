import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ProjectManifest } from "@domain";
import { desktopHint, isDesktop } from "./desktop";
import { buildContinuePrompt } from "./continuePrompt";
import { AppPrompt } from "./AppPrompt";
import { DashboardPane } from "./DashboardPane";
import { KnowledgePane } from "./KnowledgePane";
import { TitleBar } from "./TitleBar";
import { KNOWLEDGE_PAGES, knowledgePath, type KnowledgeDocument, type KnowledgeKind } from "./knowledge";
import type { Project } from "./project";

type Props = {
  project: Project;
  profileId: string;
  modelLabel: string;
  configured: boolean;
  onOpenSettings: () => void;
  onBackHome: () => void;
  onProjectChange: (project: Project) => void;
};

type Pane = "dashboard" | "chapter" | KnowledgeKind;

const emptyChapterHtml = (title: string) => `<h2>${title}</h2><p>从这里开始写作……</p>`;

function emptyKnowledge(): Record<KnowledgeKind, string> {
  return Object.fromEntries(KNOWLEDGE_PAGES.map((page) => [page.id, ""])) as Record<KnowledgeKind, string>;
}

export function WorkbenchView({ project, profileId, modelLabel, configured, onOpenSettings, onBackHome, onProjectChange }: Props) {
  const [pane, setPane] = useState<Pane>("dashboard");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState(project.root ? "已打开作品" : desktopHint());
  const [candidate, setCandidate] = useState("");
  const [candidateMode, setCandidateMode] = useState("尚无候选");
  const [busy, setBusy] = useState(false);
  const [knowledge, setKnowledge] = useState<Record<KnowledgeKind, string>>(emptyKnowledge);
  const [goalDraft, setGoalDraft] = useState("");
  const [prompt, setPrompt] = useState<"add-chapter" | "rename-chapter" | "delete-chapter" | "new-title" | "preview" | "find" | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [pendingOpenRoot, setPendingOpenRoot] = useState("");
  const saveTimer = useRef<number | undefined>(undefined);
  const knowledgeTimer = useRef<number | undefined>(undefined);
  const chapters = project.manifest.chapters;
  const currentChapter = chapters[chapterIndex] ?? chapters[0];
  const knowledgePage = KNOWLEDGE_PAGES.find((page) => page.id === pane);

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

  useEffect(() => {
    setGoalDraft(currentChapter?.goal ?? "");
  }, [currentChapter?.id, currentChapter?.goal]);

  useEffect(() => {
    void loadKnowledge();
  }, [project.root]);

  async function loadKnowledge() {
    const next = emptyKnowledge();
    if (!project.root || !isDesktop()) { setKnowledge(next); return; }
    for (const page of KNOWLEDGE_PAGES) {
      try {
        const doc = await invoke<KnowledgeDocument | null>("read_document", { root: project.root, relativePath: knowledgePath(page.id) });
        next[page.id] = doc?.content ?? "";
      } catch {
        next[page.id] = "";
      }
    }
    setKnowledge(next);
  }

  async function persistManifest(manifest: ProjectManifest) {
    if (!project.root) return;
    const saved = await invoke<ProjectManifest>("save_manifest", { root: project.root, manifest });
    onProjectChange({ ...project, manifest: saved });
  }

  async function addChapter(title: string) {
    const chapter = { id: `chapter-${Date.now()}`, title, goal: "" };
    await persistManifest({ ...project.manifest, chapters: [...chapters, chapter] });
    setChapterIndex(chapters.length);
    setPane("chapter");
  }

  async function renameChapter(title: string) {
    if (!currentChapter) return;
    await persistManifest({ ...project.manifest, chapters: chapters.map((chapter) => chapter.id === currentChapter.id ? { ...chapter, title } : chapter) });
  }

  async function saveGoal(goal: string) {
    if (!currentChapter) return;
    await persistManifest({ ...project.manifest, chapters: chapters.map((chapter) => chapter.id === currentChapter.id ? { ...chapter, goal } : chapter) });
  }

  async function removeChapter() {
    if (!currentChapter || chapters.length <= 1) return;
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

  function updateKnowledge(kind: KnowledgeKind, value: string) {
    setKnowledge((current) => ({ ...current, [kind]: value }));
    setSaveState("有未保存修改 · 刚刚");
    window.clearTimeout(knowledgeTimer.current);
    knowledgeTimer.current = window.setTimeout(() => void persistKnowledge(kind, value), 700);
  }

  async function persistKnowledge(kind: KnowledgeKind, content: string) {
    if (!project.root) { setSaveState("浏览器预览 · 内容仅保留在当前页面"); return; }
    try {
      await invoke("save_document", {
        root: project.root,
        relativePath: knowledgePath(kind),
        document: { schema_version: 1, kind, saved_at: new Date().toISOString(), content },
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
      const text = await invoke<string>("ai_complete", {
        profileId,
        prompt: buildContinuePrompt({
          instruction: draft,
          chapterTitle: currentChapter?.title ?? "第 01 章",
          chapterGoal: currentChapter?.goal ?? "",
          chapterText: editor?.getText() ?? "",
          knowledge,
        }),
      });
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
    setPane("chapter");
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
    const selected = await open({ directory: true, multiple: false, title: "打开已有作品文件夹" });
    if (typeof selected !== "string") return;
    try {
      const manifest = await invoke<ProjectManifest>("read_manifest", { root: selected });
      await invoke("remember_project", { root: selected });
      onProjectChange({ root: selected, manifest });
      setChapterIndex(0);
      setPane("dashboard");
    } catch {
      setPendingOpenRoot(selected);
      setPromptValue("未命名故事");
      setPrompt("new-title");
    }
  }

  async function confirmNewInFolder() {
    const title = promptValue.trim();
    if (!title || !pendingOpenRoot) return;
    const manifest = await invoke<ProjectManifest>("create_project", { root: pendingOpenRoot, title, kind: "serial-novel" });
    await invoke("remember_project", { root: pendingOpenRoot });
    onProjectChange({ root: pendingOpenRoot, manifest });
    setChapterIndex(0);
    setPane("dashboard");
    setPrompt(null);
  }

  const contextLabel = pane === "dashboard" ? "作品概览" : knowledgePage ? knowledgePage.title : currentChapter?.title;

  return (
    <main className="app">
      <TitleBar showBack onBack={onBackHome} onOpenSettings={onOpenSettings} />
      <section className="workspace">
        <aside className="panel sidebar">
          <div className="panel-heading"><strong>我的作品</strong><button className="icon-button" title="打开或新建作品" onClick={() => void openAnother()}><Plus size={16} weight="bold" /></button></div>
          <button className="project active" onClick={() => setPane("dashboard")}><span className="dot blue" />{project.manifest.title}</button>
          <button className={`chapter ${pane === "dashboard" ? "selected" : ""}`} onClick={() => setPane("dashboard")}>作品概览</button>
          <div className="section-heading"><p className="eyebrow">作品资料</p></div>
          {KNOWLEDGE_PAGES.map((page) => (
            <button className={`chapter ${pane === page.id ? "selected" : ""}`} key={page.id} onClick={() => setPane(page.id)}>
              {page.title}{knowledge[page.id]?.trim() ? "" : " ·"}
            </button>
          ))}
          <div className="section-heading"><p className="eyebrow">作品结构</p><button onClick={() => { setPromptValue(`第 ${String(chapters.length + 1).padStart(2, "0")} 章`); setPrompt("add-chapter"); }}>＋ 章节</button></div>
          {chapters.map((chapter, index) => (
            <button className={`chapter ${pane === "chapter" && index === chapterIndex ? "selected" : ""}`} key={chapter.id} onClick={() => { setChapterIndex(index); setPane("chapter"); }}>{chapter.title}</button>
          ))}
          {pane === "chapter" ? (
            <div className="chapter-actions">
              <button onClick={() => { if (!currentChapter) return; setPromptValue(currentChapter.title); setPrompt("rename-chapter"); }}>重命名</button>
              <button onClick={() => { if (!currentChapter || chapters.length <= 1) return; setPrompt("delete-chapter"); }}>删除</button>
            </div>
          ) : null}
        </aside>
        <section className="panel editor">
          {pane === "dashboard" ? (
            <DashboardPane
              project={project}
              knowledge={knowledge}
              onOpenChapter={(index) => { setChapterIndex(index); setPane("chapter"); }}
              onOpenKnowledge={(kind) => setPane(kind)}
            />
          ) : knowledgePage ? (
            <KnowledgePane
              page={knowledgePage}
              value={knowledge[knowledgePage.id]}
              saveState={saveState}
              onChange={(value) => updateKnowledge(knowledgePage.id, value)}
            />
          ) : (
            <>
              <div className="editor-head">
                <div className="breadcrumbs">{project.manifest.title} / 写作台</div>
                <div className="title-row">
                  <div>
                    <h1>{currentChapter?.title}</h1>
                    <input
                      className="goal-input"
                      value={goalDraft}
                      placeholder="填写本章目标，续写时会遵守"
                      onChange={(event) => setGoalDraft(event.target.value)}
                      onBlur={() => { if (goalDraft !== (currentChapter?.goal ?? "")) void saveGoal(goalDraft); }}
                    />
                  </div>
                  <button className="button" onClick={() => void snapshot()}>创建快照</button>
                </div>
                <div className="toolbar" role="toolbar" aria-label="正文格式">
                  <button aria-label="加粗" onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive("bold") ? "active" : ""}><b>B</b></button>
                  <button aria-label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()} className={editor?.isActive("italic") ? "active" : ""}><i>I</i></button>
                  <button aria-label="二级标题" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H</button>
                  <button aria-label="正文" onClick={() => editor?.chain().focus().setParagraph().run()}>Aa</button>
                  <button aria-label="项目列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}>≡</button>
                  <span className="toolbar-spacer" />
                  <button onClick={() => { setPromptValue(""); setPrompt("find"); }} aria-label="查找正文"><MagnifyingGlass size={16} weight="regular" /></button>
                </div>
              </div>
              <div className="editor-scroll"><EditorContent className="manuscript" editor={editor} /></div>
              <footer className="editor-footer"><span role="status">{saveState}</span><span>{editor?.getText().length ?? 0} 字</span></footer>
            </>
          )}
        </section>
        <aside className="panel assistant">
          <div className="panel-heading"><strong>AI 协作</strong><span className="model-chip">{modelLabel || "未配置"}</span></div>
          <p className="context">当前上下文：{contextLabel}</p>
          {pane === "chapter" ? (
            <>
              <textarea aria-label="告诉 AI 续写要求" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="告诉 AI 你想怎么续写…" />
              <button className="generate" disabled={busy} onClick={() => void generate()}>{busy ? "生成中…" : "生成候选"}</button>
              <div className="suggestion" aria-live="polite" aria-busy={busy}>
                <strong>{candidateMode}</strong>
                <p>{candidate || "生成会带上大纲、世界观等已填资料。空白资料页不会发明设定。"}</p>
                <div>
                  <button className="button" disabled={!candidate} onClick={() => setPrompt("preview")}>预览全文</button>
                  <button className="button" disabled={!candidate} onClick={() => void acceptCandidate()}>接受写入</button>
                  <button className="button" disabled={!candidate} onClick={() => { setCandidate(""); setCandidateMode("已拒绝"); }}>拒绝</button>
                </div>
              </div>
            </>
          ) : (
            <div className="suggestion">
              <strong>{pane === "dashboard" ? "先资料，后正文" : "本页先手写"}</strong>
              <p>{pane === "dashboard"
                ? "打开作品先到概览。补齐大纲和世界观后，再点章节续写，模型会按资料约束，而不是自由发挥。"
                : "AI 生成大纲/人物卡下一轮再接。现在写在这里的内容会自动保存，并在续写时作为硬约束。"}</p>
              <div>
                <button className="button" onClick={() => setPane("chapter")}>去写作台</button>
              </div>
            </div>
          )}
        </aside>
      </section>
      <AppPrompt
        open={prompt === "add-chapter"}
        title="新章节名称"
        value={promptValue}
        confirmLabel="添加"
        onChange={setPromptValue}
        onCancel={() => setPrompt(null)}
        onConfirm={() => {
          const title = promptValue.trim();
          if (!title) return;
          setPrompt(null);
          void addChapter(title);
        }}
      />
      <AppPrompt
        open={prompt === "rename-chapter"}
        title="重命名章节"
        value={promptValue}
        confirmLabel="保存"
        onChange={setPromptValue}
        onCancel={() => setPrompt(null)}
        onConfirm={() => {
          const title = promptValue.trim();
          if (!title) return;
          setPrompt(null);
          void renameChapter(title);
        }}
      />
      <AppPrompt
        open={prompt === "delete-chapter"}
        title="删除章节"
        hint={`删除「${currentChapter?.title ?? ""}」？此操作不可撤销。`}
        showInput={false}
        confirmLabel="删除"
        danger
        onCancel={() => setPrompt(null)}
        onConfirm={() => { setPrompt(null); void removeChapter(); }}
      />
      <AppPrompt
        open={prompt === "new-title"}
        title="作品名称"
        hint="这个文件夹还没有作品，创建后会作为新作品打开。"
        value={promptValue}
        confirmLabel="创建"
        onChange={setPromptValue}
        onCancel={() => setPrompt(null)}
        onConfirm={() => void confirmNewInFolder()}
      />
      <AppPrompt
        open={prompt === "preview"}
        title="候选预览"
        hint={candidate}
        showInput={false}
        confirmLabel="关闭"
        onCancel={() => setPrompt(null)}
        onConfirm={() => setPrompt(null)}
      />
      <AppPrompt
        open={prompt === "find"}
        title="查找正文"
        value={promptValue}
        confirmLabel="查找"
        onChange={setPromptValue}
        onCancel={() => setPrompt(null)}
        onConfirm={() => {
          (window as unknown as { find: (text: string) => boolean }).find(promptValue);
          setPrompt(null);
        }}
      />
    </main>
  );
}
