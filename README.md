# AI 小说创作工作台

一个本地优先的 AI 小说创作工作台初始使用版，当前包含 React + Vite 编辑器界面，以及 Tauri/Rust 本地项目存储骨架。

## 快速开始

### 开发者运行

开发环境需要 Node.js 18+ 和 npm。只有编译或调试桌面壳时才需要 Rust stable-msvc；Tauri CLI 已作为项目开发依赖安装，不需要全局安装。

```bash
npm install --prefix apps/desktop
npm run dev
```

打开终端输出的本地地址即可预览编辑器。当前浏览器预览会保留界面状态；选择作品目录、创建项目和保存快照等本地文件操作需要通过 Tauri 桌面壳运行。

运行完整桌面开发版：

```bash
npm run desktop
```

## 常用命令

```bash
npm run typecheck   # TypeScript 类型检查
npm run build       # 生产构建，输出到 apps/desktop/dist
npm run desktop     # 启动 Tauri 桌面开发版
npm run desktop:build # 构建桌面安装包
```

### 最终用户安装

最终用户只需安装 `npm run desktop:build` 生成的 Windows 安装包，不需要安装 Node.js、Rust、Cargo 或 Tauri。Windows WebView2 运行时通常随系统提供；安装包也可以按发布配置负责引导安装缺失的运行时。

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
