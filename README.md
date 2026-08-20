# 雾笺 · AI 小说创作工作台

本项目是一个本地优先的桌面小说创作工作台，目标平台为 Windows 和 macOS。

## 当前状态

- `prototype/`：已完成的三页面交互原型。
- `apps/desktop/`：Tauri + React 桌面应用骨架的前端部分。
- `packages/domain/`：公开作品格式和领域类型。
- `packages/model-gateway/`：OpenAI 兼容 API、Ollama 和图片模型的统一接口。
- `产品共创记录.md`：产品讨论决策记录。
- `技术选型与架构建议.md`：技术方案和模块边界。

## 下一步

安装依赖后运行 `npm run dev`，然后接入 Tauri CLI 和 Rust 本地核心，完成 ProjectStore 与自动保存。
