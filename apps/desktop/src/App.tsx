import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const chapters = ["故事策划", "人物与世界观", "第 01 章  潮声", "第 02 章  失物", "第 03 章  回信"];

export function App() {
  const [glass, setGlass] = useState(true);
  const [draft, setDraft] = useState("让海雾里出现一个不属于这个年代的声音");
  const [saveState, setSaveState] = useState("已自动保存 · 刚刚");
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [StarterKit],
    content: "<h2>潮声</h2><p>林默在海边醒来时，天还没有亮。</p><p>潮水退到很远的地方，露出一片湿漉漉的黑色礁石。风从小镇背后吹来，带着盐和旧木头的气味。</p><p>他摸了摸自己的口袋，里面只有一枚生锈的钥匙。</p><p>远处忽然传来一声铃响。</p>",
    onUpdate: () => setSaveState("有未保存修改 · 刚刚"),
  });

  async function createSnapshot() {
    setSaveState("正在保存…");
    try {
      await invoke("save_document", {
        root: projectRoot ?? "demo-project",
        relativePath: "manuscript/chapter-001.json",
        document: { schemaVersion: 1, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "林默在海边醒来时，天还没有亮。" }] }] } },
      });
      setSaveState("已保存快照 · 刚刚");
    } catch {
      setSaveState("浏览器预览 · 未连接本地核心");
    }
  }

  async function createProject() {
    try {
      const selected = await open({ directory: true, multiple: false, title: "选择作品文件夹" });
      if (typeof selected !== "string") return;
      await invoke("create_project", { root: selected, title: "未命名故事", kind: "serial-novel" });
      setProjectRoot(selected);
      setSaveState("作品已创建 · 刚刚");
    } catch {
      setSaveState("浏览器预览 · 文件夹选择需要桌面应用");
    }
  }

  return (
    <main className={glass ? "app desktop-glass" : "app"}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><span>雾笺 · AI 创作工作台</span></div>
        <div className="top-actions">
          <button className="button" onClick={() => setGlass((value) => !value)}>◐ {glass ? "桌面玻璃" : "标准窗口"}</button>
          <button className="icon-button" aria-label="设置">⚙</button>
          <button className="icon-button" aria-label="帮助">?</button>
        </div>
      </header>
      <section className="workspace">
        <aside className="panel sidebar">
          <div className="panel-heading"><strong>我的作品</strong><button className="icon-button" onClick={createProject}>＋</button></div>
          <button className="project active"><span className="dot blue" />潮声之下</button>
          <button className="project"><span className="dot amber" />未命名故事</button>
          <p className="eyebrow">作品结构</p>
          {chapters.map((chapter, index) => <button className={`chapter ${index === 2 ? "selected" : ""}`} key={chapter}>{index < 2 ? "⌁" : ""} {chapter}</button>)}
        </aside>
        <section className="panel editor">
          <div className="breadcrumbs">第一卷 · 海边小镇</div>
          <div className="title-row"><div><h1>第 01 章　潮声</h1><p>章节目标：让主角第一次听见“过去”的回声</p></div><button className="button" onClick={createSnapshot}>创建快照</button></div>
          <div className="toolbar"><span>B</span><i>I</i><span>H</span><span>Aa</span><span>≡</span><span className="toolbar-spacer" /><span>⌁ 检查</span><span>⌕</span></div>
          <EditorContent className="manuscript" editor={editor} />
          <footer className="editor-footer"><span>{saveState}</span><span>684 字　· 作者创作</span></footer>
        </section>
        <aside className="panel assistant">
          <div className="panel-heading"><strong>AI 协作</strong><span className="model-chip">Ollama · qwen3</span></div>
          <p className="context">当前上下文：第 01 章 · 潮汐之后</p>
          <div className="quick-actions"><button className="button">继续写</button><button className="button">检查设定</button><button className="button">润色</button></div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button className="generate">生成候选　↗</button>
          <div className="suggestion"><strong>候选 · 轻微悬疑</strong><p>“潮声忽然停了。林默抬头，看见远处的雾里亮起一盏不存在的煤油灯。”</p><div><button className="button">预览插入</button><button className="button">保存候选</button></div></div>
        </aside>
      </section>
      <div className="task-pill">‹　　A · 三栏写作台　　›</div>
    </main>
  );
}
