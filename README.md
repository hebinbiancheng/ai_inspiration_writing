# AI 小说创作工作台

一个本地优先的 AI 小说创作工作台初始使用版，当前包含 React + Vite 编辑器界面，以及 Tauri/Rust 本地项目存储骨架。

## 快速开始

环境要求：Node.js 18+、npm；如果要运行桌面壳，还需要 Rust 和 Tauri 2 的系统依赖。

```bash
npm install --prefix apps/desktop
npm run dev
```

打开终端输出的本地地址即可预览编辑器。当前浏览器预览会保留界面状态；选择作品目录、创建项目和保存快照等本地文件操作需要通过 Tauri 桌面壳运行。

## 常用命令

```bash
npm run typecheck   # TypeScript 类型检查
npm run build       # 生产构建，输出到 apps/desktop/dist
```

## 当前能力

- 三栏写作工作台：作品结构、富文本稿件、AI 协作面板。
- TipTap 编辑器，可直接编辑当前章节内容。
- “创建快照”调用 Rust `save_document` 命令保存章节 JSON。
- “新建作品”调用 Rust `create_project` 命令初始化本地作品目录。
- 浏览器预览模式：未连接 Tauri 时会显示明确的预览状态。

## 目录结构

- `apps/desktop/`：桌面应用前端与 Tauri 壳。
- `packages/domain/`：作品、章节等领域类型。
- `packages/model-gateway/`：模型供应商统一接口骨架。
- `prototype/`：早期交互原型。
- `docs/`：设计与决策文档。

## 已知限制

AI 生成目前是界面占位流程，尚未连接 Ollama/OpenAI；作品列表和章节树仍使用演示数据。后续接入模型网关和持久化索引后即可扩展为完整工作流。
