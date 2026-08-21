import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { ProjectManifest } from "@domain";

type Project = { root: string; manifest: ProjectManifest };
const initialHtml = "<h2>潮声</h2><p>林默在海边醒来时，天还没有亮。</p><p>潮水退到很远的地方，露出一片湿漉漉的黑色礁石。风从小镇背后吹来，带着盐和旧木头的气味。</p><p>他摸了摸自己的口袋，里面只有一枚生锈的钥匙。</p><p>远处忽然传来一声铃响。</p>";
const demoManifest: ProjectManifest = {
  schema_version: 1,
  id: "demo",
  title: "未命名作品",
  kind: "serial-novel",
  created_at: "0",
  updated_at: "0",
  chapters: [{ id: "chapter-001", title: "第 01 章", goal: "" }],
};
const isDesktop = () => "__TAURI_INTERNALS__" in window;

export function App() {
  const [glass, setGlass] = useState(true);
  const [view, setView] = useState<"home" | "workbench">("home");
  const [projects, setProjects] = useState<Project[]>(() => [{ root: "", manifest: demoManifest }]);
  const [projectIndex, setProjectIndex] = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [draft, setDraft] = useState("让海雾里出现一个不属于这个年代的声音");
  const [saveState, setSaveState] = useState("浏览器预览 · 演示作品");
  const [candidate, setCandidate] = useState("潮声忽然停了。林默抬头，看见远处的雾里亮起一盏不存在的煤油灯。");
  const [candidateMode, setCandidateMode] = useState("候选 · 轻微悬疑");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"settings" | "help" | null>(null);
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem("lingan.ai.endpoint") || "http://127.0.0.1:11434");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lingan.ai.apiKey") || "");
  const [model, setModel] = useState(() => localStorage.getItem("lingan.ai.model") || "qwen3");
  const saveTimer = useRef<number | undefined>(undefined);
  const currentProject = projects[projectIndex] ?? projects[0];
  const chapters = currentProject.manifest.chapters;
  const currentChapter = chapters[chapterIndex] ?? chapters[0];

  const editor = useEditor({ extensions: [StarterKit], content: initialHtml, onUpdate: ({ editor }) => {
    setSaveState("有未保存修改 · 刚刚");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveCurrent(editor.getJSON()), 900);
  }});

  useEffect(() => { void restoreProjects(); }, []);
  useEffect(() => { if (editor && currentChapter) void loadChapter(); }, [projectIndex, chapterIndex, editor]);

  async function restoreProjects() {
    if (!isDesktop()) return;
    const roots: string[] = JSON.parse(localStorage.getItem("lingan.projectRoots") || "[]");
    const restored: Project[] = [];
    for (const root of roots) { try { restored.push({ root, manifest: await invoke<ProjectManifest>("read_manifest", { root }) }); } catch { /* moved project */ } }
    if (restored.length) { setProjects(restored); setSaveState("作品已载入"); }
  }

  function remember(items: Project[]) {
    localStorage.setItem("lingan.projectRoots", JSON.stringify(items.filter(item => item.root).map(item => item.root)));
  }

  async function chooseProject() {
    if (!isDesktop()) { setSaveState("文件夹选择需要桌面应用"); return; }
    const selected = await open({ directory: true, multiple: false, title: "打开或新建作品文件夹" });
    if (typeof selected !== "string") return;
    let manifest: ProjectManifest;
    try { manifest = await invoke("read_manifest", { root: selected }); }
    catch {
      const title = window.prompt("作品名称", "未命名故事")?.trim();
      if (!title) return;
      manifest = await invoke("create_project", { root: selected, title, kind: "serial-novel" });
    }
    const next = [...projects.filter(p => p.root !== "" && p.root !== selected), { root: selected, manifest }];
    setProjects(next); setProjectIndex(next.length - 1); setChapterIndex(0); remember(next); setSaveState("作品已打开"); setView("workbench");
  }

  async function persistManifest(manifest: ProjectManifest) {
    if (!currentProject.root) return;
    const saved = await invoke<ProjectManifest>("save_manifest", { root: currentProject.root, manifest });
    const next = projects.map((p, i) => i === projectIndex ? { ...p, manifest: saved } : p);
    setProjects(next); remember(next);
  }

  async function addChapter() {
    const title = window.prompt("新章节名称", `第 ${String(chapters.length + 1).padStart(2, "0")} 章`)?.trim();
    if (!title) return;
    const chapter = { id: `chapter-${Date.now()}`, title, goal: "点击编辑章节目标" };
    await persistManifest({ ...currentProject.manifest, chapters: [...chapters, chapter] });
    setChapterIndex(chapters.length);
  }

  async function renameChapter() {
    const title = window.prompt("重命名章节", currentChapter.title)?.trim(); if (!title) return;
    await persistManifest({ ...currentProject.manifest, chapters: chapters.map(c => c.id === currentChapter.id ? { ...c, title } : c) });
  }

  async function removeChapter() {
    if (chapters.length <= 1 || !window.confirm(`删除“${currentChapter.title}”？此操作不可撤销。`)) return;
    if (currentProject.root) await invoke("delete_chapter", { root: currentProject.root, chapterId: currentChapter.id });
    await persistManifest({ ...currentProject.manifest, chapters: chapters.filter(c => c.id !== currentChapter.id) });
    setChapterIndex(Math.max(0, chapterIndex - 1));
  }

  async function loadChapter() {
    if (!editor || !currentChapter) return;
    if (!currentProject.root) { editor.commands.setContent(chapterIndex === 0 ? initialHtml : `<h2>${currentChapter.title}</h2><p>从这里开始写作……</p>`, { emitUpdate: false }); return; }
    try {
      const doc = await invoke<{ content?: object } | null>("read_document", { root: currentProject.root, relativePath: `manuscript/${currentChapter.id}.json` });
      editor.commands.setContent(doc?.content ?? `<h2>${currentChapter.title}</h2><p>从这里开始写作……</p>`, { emitUpdate: false });
      setSaveState("已载入 · 刚刚");
    } catch (error) { setSaveState(`载入失败 · ${String(error)}`); }
  }

  async function saveCurrent(content = editor?.getJSON(), snapshot = false) {
    if (!content || !currentChapter) return;
    if (!currentProject.root) { setSaveState("浏览器预览 · 内容仅保留在当前页面"); return; }
    setSaveState("正在保存…");
    const path = snapshot ? `snapshots/${currentChapter.id}-${Date.now()}.json` : `manuscript/${currentChapter.id}.json`;
    try { await invoke("save_document", { root: currentProject.root, relativePath: path, document: { schemaVersion: 1, chapterId: currentChapter.id, savedAt: new Date().toISOString(), content } }); setSaveState(snapshot ? "已创建快照 · 刚刚" : "已自动保存 · 刚刚"); }
    catch (error) { setSaveState(`保存失败 · ${String(error)}`); }
  }

  async function generate(mode: "续写" | "润色" | "设定检查") {
    if (!isDesktop()) { setCandidateMode(`${mode}候选 · 演示`); setCandidate(`这是浏览器预览候选。启动桌面版并在设置中配置 Ollama 后，即可根据“${draft}”生成真实内容。`); return; }
    setBusy(true); setCandidateMode(`${mode} · 生成中`);
    const instruction = mode === "续写" ? "续写正文，直接输出可插入的小说段落" : mode === "润色" ? "润色正文，直接输出润色后的段落" : "检查人物、世界观、时间和逻辑一致性，列出问题与建议";
    try { const text = await invoke<string>("ai_generate", { baseUrl: endpoint, apiKey, model, prompt: `${instruction}。用户要求：${draft}\n\n当前正文：\n${editor?.getText()}` }); setCandidate(text); setCandidateMode(`${mode}候选`); }
    catch (error) { setCandidate(`生成失败：${String(error)}\n\n请确认 Ollama 已启动，并在设置中填写已安装的模型名称。`); setCandidateMode("连接失败"); }
    finally { setBusy(false); }
  }

  function insertCandidate() { if (!editor || !candidate) return; editor.chain().focus().insertContent(`<p>${candidate.replace(/\n+/g, "</p><p>")}</p>`).run(); }
  function saveSettings() { localStorage.setItem("lingan.ai.endpoint", endpoint); localStorage.setItem("lingan.ai.apiKey", apiKey); localStorage.setItem("lingan.ai.model", model); setDialog(null); }

  if (view === "home") return <main className="home app"><header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>灵感</span></div><div className="top-actions"><button className="icon-button" aria-label="设置" onClick={() => setDialog("settings")}>⚙</button><button className="icon-button" aria-label="帮助" onClick={() => setDialog("help")}>?</button></div></header><section className="home-content"><div className="home-hero"><p className="eyebrow">LOCAL-FIRST CREATIVE WORKSPACE</p><h1>把灵感，写成<br/><em>真正的故事。</em></h1><p>一个专注于小说创作的本地工作台。管理作品、梳理章节，并让 AI 成为你的创作伙伴。</p><button className="generate home-cta" onClick={() => setView("workbench")}>进入创作工作台　↗</button></div><div className="home-cards"><div className="home-card primary"><span>✦</span><h3>开始一部新作品</h3><p>从空白开始，建立属于你的作品结构。</p><button className="button" onClick={chooseProject}>新建作品　＋</button></div><div className="home-card"><span>▣</span><h3>打开已有作品</h3><p>从本地文件夹继续你的创作。</p><button className="button" onClick={chooseProject}>选择文件夹　→</button></div></div><div className="home-recent"><div className="section-heading"><h2>最近作品</h2><button className="button" onClick={() => setView("workbench")}>查看全部</button></div><button className="recent-item" onClick={() => setView("workbench")}><span className="dot blue"/><span><strong>{projects[0]?.manifest.title || "还没有作品"}</strong><small>继续第 01 章　·　刚刚</small></span><span>→</span></button></div></section>{dialog && <div className="modal-backdrop" onMouseDown={() => setDialog(null)}><section className="modal" onMouseDown={e => e.stopPropagation()}>{dialog === "settings" ? <><h2>AI 设置</h2><p className="modal-hint">支持 OpenAI API 及所有 OpenAI-compatible 服务；Ollama 可直接填写本地地址。</p><label>Base URL<input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://api.openai.com 或 http://127.0.0.1:11434" /></label><label>API Key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="本地 Ollama 可留空" /></label><label>模型名称<input value={model} onChange={e => setModel(e.target.value)} placeholder="例如 gpt-5 或 qwen3" /></label><div className="modal-actions"><button className="button" onClick={() => setDialog(null)}>取消</button><button className="generate" onClick={saveSettings}>保存</button></div></> : <><h2>使用帮助</h2><p>首页用于选择作品；进入工作台后管理章节和正文。作品数据默认保存在你选择的本地文件夹中。</p><button className="button" onClick={() => setDialog(null)}>知道了</button></>}</section></div>}</main>;

  return <main className={glass ? "app desktop-glass" : "app"}>
    <header className="topbar"><div className="brand"><button className="back-home" onClick={() => setView("home")}>‹</button><span className="brand-mark">✦</span><span>灵感</span></div><div className="top-actions">
      <button className="button" onClick={() => setGlass(v => !v)}>◐ {glass ? "桌面玻璃" : "标准窗口"}</button>
      <button className="icon-button" aria-label="设置" onClick={() => setDialog("settings")}>⚙</button><button className="icon-button" aria-label="帮助" onClick={() => setDialog("help")}>?</button>
    </div></header>
    <section className="workspace">
      <aside className="panel sidebar"><div className="panel-heading"><strong>我的作品</strong><button className="icon-button" title="打开或新建作品" onClick={chooseProject}>＋</button></div>
        {projects.map((project, index) => <button className={`project ${index === projectIndex ? "active" : ""}`} key={project.root || "demo"} onClick={() => { setProjectIndex(index); setChapterIndex(0); }}><span className={`dot ${index % 2 ? "amber" : "blue"}`} />{project.manifest.title}</button>)}
        <div className="section-heading"><p className="eyebrow">作品结构</p><button onClick={addChapter}>＋ 章节</button></div>
        {chapters.map((chapter, index) => <button className={`chapter ${index === chapterIndex ? "selected" : ""}`} key={chapter.id} onClick={() => setChapterIndex(index)}>{chapter.title}</button>)}
        <div className="chapter-actions"><button onClick={renameChapter}>重命名</button><button onClick={removeChapter}>删除</button></div>
      </aside>
      <section className="panel editor"><div className="editor-head"><div className="breadcrumbs">{currentProject.manifest.title}</div><div className="title-row"><div><h1>{currentChapter?.title}</h1><p>{currentChapter?.goal}</p></div><button className="button" onClick={() => void saveCurrent(undefined, true)}>创建快照</button></div>
        <div className="toolbar"><button onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive("bold") ? "active" : ""}><b>B</b></button><button onClick={() => editor?.chain().focus().toggleItalic().run()} className={editor?.isActive("italic") ? "active" : ""}><i>I</i></button><button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H</button><button onClick={() => editor?.chain().focus().setParagraph().run()}>Aa</button><button onClick={() => editor?.chain().focus().toggleBulletList().run()}>≡</button><span className="toolbar-spacer" /><button onClick={() => void generate("设定检查")}>⌁ 检查</button><button onClick={() => (window as unknown as { find: (text: string) => boolean }).find(window.prompt("查找正文") || "")}>⌕</button></div></div>
        <div className="editor-scroll"><EditorContent className="manuscript" editor={editor} /></div><footer className="editor-footer"><span>{saveState}</span><span>{editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0} 字　· 作者创作</span></footer>
      </section>
      <aside className="panel assistant"><div className="panel-heading"><strong>AI 协作</strong><span className="model-chip">Ollama · {model}</span></div><p className="context">当前上下文：{currentChapter?.title}</p>
        <div className="quick-actions"><button className="button" onClick={() => void generate("续写")}>继续写</button><button className="button" onClick={() => void generate("设定检查")}>检查设定</button><button className="button" onClick={() => void generate("润色")}>润色</button></div>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} /><button className="generate" disabled={busy} onClick={() => void generate("续写")}>{busy ? "生成中…" : "生成候选　↗"}</button>
        <div className="suggestion"><strong>{candidateMode}</strong><p>{candidate}</p><div><button className="button" onClick={() => window.alert(candidate)}>预览全文</button><button className="button" onClick={insertCandidate}>插入正文</button><button className="button" onClick={() => navigator.clipboard.writeText(candidate)}>复制候选</button></div></div>
      </aside>
    </section><div className="task-pill">‹　　A · 三栏写作台　　›</div>
    {dialog && <div className="modal-backdrop" onMouseDown={() => setDialog(null)}><section className="modal" onMouseDown={e => e.stopPropagation()}>{dialog === "settings" ? <><h2>AI 设置</h2><p className="modal-hint">支持 OpenAI API 及所有 OpenAI-compatible 服务；Ollama 可直接填写本地地址。</p><label>Base URL<input value={endpoint} onChange={e => setEndpoint(e.target.value)} /></label><label>API Key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} /></label><label>模型名称<input value={model} onChange={e => setModel(e.target.value)} /></label><div className="modal-actions"><button className="button" onClick={() => setDialog(null)}>取消</button><button className="generate" onClick={saveSettings}>保存</button></div></> : <><h2>使用帮助</h2><p>点击左栏“＋”打开已有作品文件夹，或选择空文件夹创建作品。正文会在停止输入约一秒后自动保存。</p><p>AI 支持 OpenAI API、兼容 OpenAI 格式的服务以及 Ollama。</p><button className="button" onClick={() => setDialog(null)}>知道了</button></>}</section></div>}
  </main>;
}
