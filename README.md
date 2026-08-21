# AI 小说创作工作台

本地优先的 AI 小说创作工作台。当前最小 demo：工作台首页 + 三栏写作 + OpenAI 兼容续写（接受前自动快照）。产品窗口名是「灵感」。

## 快速开始

### 开发者运行

开发环境需要 Node.js 18+ 和 npm。只有编译或调试桌面壳时才需要 Rust stable-msvc；Tauri CLI 已作为项目开发依赖安装，不需要全局安装。

```bash
npm install --prefix apps/desktop
npm run dev
```

打开终端输出的本地地址即可预览界面。浏览器预览能看首页和布局；选择作品目录、凭据、保存和续写需要桌面壳。

运行完整桌面开发版（验收闭环用这条）：

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

### macOS 开发与打包

本项目使用 Tauri 2，已包含 macOS 原生钥匙串支持（`keyring` 的 `apple-native` feature）和 `.icns` 应用图标。macOS 需要 Xcode Command Line Tools、Rust stable 与 Node.js 18+：

```bash
xcode-select --install
rustup default stable
npm install --prefix apps/desktop
npm run desktop       # 本地运行
npm run desktop:build # 生成 .app / .dmg（按当前 CPU 架构）
```

macOS 使用系统钥匙串保存 API Key；自定义标题栏会为左上角红黄绿窗口按钮预留空间。若只运行浏览器预览，不需要 Rust，但本地文件、钥匙串和模型调用仍需桌面壳。

### Windows 最终用户安装

最终用户只需安装 `npm run desktop:build` 生成的 Windows 安装包，不需要安装 Node.js、Rust、Cargo 或 Tauri。Windows WebView2 运行时通常随系统提供；安装包也可以按发布配置负责引导安装缺失的运行时。

## 当前能力

- 工作台首页：最近作品、新建、打开、模型配置状态。
- 三栏写作台：章节增删改、TipTap 正文、停笔约 1 秒自动保存。
- API Key 写入 Windows 凭据管理器；作品目录不落密钥。
- 续写走 OpenAI 兼容 `chat/completions`（含 Ollama `/v1`）；Rust 内拼接流式响应，界面一次显示完整候选。
- 接受候选前自动快照，拒绝不清正文。
- 未配置模型时仍可写作。浏览器预览会提示需要桌面应用。

## 目录结构

- `apps/desktop/`：桌面应用前端与 Tauri 壳。
- `packages/domain/`：与磁盘 `manifest.json` 对齐的领域类型。
- `packages/model-gateway/`：OpenAI 兼容请求类型；HTTP 在 Rust。
- `prototype/`：早期交互原型。
- `docs/superpowers/`：规格与实现计划。

## 已知限制

本轮最小 demo 不做：灵感追问、作品资料/大纲、审阅、导入导出、SQLite 搜索、流式 UI/取消、Ollama 原生 `/api/generate`、原生透明窗口、作品概览、回收站。

规格：`docs/superpowers/specs/2026-08-21-minimum-demo-design.md`
