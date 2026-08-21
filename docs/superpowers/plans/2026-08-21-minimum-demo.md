# 最小可运行 Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Tauri 骨架上落地「新建作品 → 写作自动保存 → 配置 OpenAI 兼容 API（Key 进凭据库）→ 续写一条候选 → 预览后接受（先快照）→ 重开仍在」的最小桌面闭环。

**Architecture:** 前端只做工作台首页和三栏写作台。本地能力收进三个 Rust 模块：`ProjectStore`（作品目录/正文/快照/最近列表）、`SecretStore`（Windows 凭据库 + `model-profile.json`）、`ModelGateway`（OpenAI 兼容 `chat/completions`，Rust 内把 SSE 拼成全文）。UI 不逐字刷新；前端永不读取 Key。

**Tech Stack:** Tauri 2、React 19、TypeScript、Vite、Tiptap 3、Rust、reqwest、keyring 3。

**Spec:** `docs/superpowers/specs/2026-08-21-minimum-demo-design.md`

## Global Constraints

- 从当前工作区改起，不要 `git restore` 已有的首页/自动保存/章节 CRUD；按规格改掉偏差。
- 磁盘 `manifest.json` 保持 snake_case 与 `schema_version: 1`；正文 JSON 保持现有 camelCase（`schemaVersion` / `chapterId` / `savedAt` / `content`）。
- 凭据 service = `com.wujian.ai-novel-workbench`，account = `default`。
- Key 不进 `localStorage`、不进作品目录、不回传前端。
- 本轮只做续写；禁止「检查设定」「润色」、底部「A · 三栏写作台」、导入/灵感入口、作品概览 C。
- 新建作品第一章标题必须是 `第 01 章`，goal 为空，禁止「潮声」演示文案。
- 每步提交前：仓库根目录 `npm run typecheck`；`apps/desktop/src-tauri` 下 `cargo check`。有 Rust 测试的步骤再跑对应 `cargo test`。
- Windows PowerShell 提交不要用 bash HEREDOC，用 `git commit -m "feat: ..."`。
- 一步一 commit，不要把后续任务的文件混进当前 commit。

## File Structure

| 文件 | 职责 |
|---|---|
| `packages/domain/src/index.ts` | 与磁盘一致的 `Chapter` / `ProjectManifest` / `RichTextDocument` |
| `packages/model-gateway/src/index.ts` | 前端用的 `ModelProfile` 与 `ai_complete` 入参类型（无流式 adapter） |
| `apps/desktop/src-tauri/src/project_store.rs` | 作品目录、原子写、快照、最近作品 `recents.json` |
| `apps/desktop/src-tauri/src/secret_store.rs` | 凭据库 + `model-profile.json` |
| `apps/desktop/src-tauri/src/model_gateway.rs` | URL 拼接、SSE/JSON 解析、`ai_complete` |
| `apps/desktop/src-tauri/src/lib.rs` | 注册命令；删除 `ollama_generate` / `ai_generate` |
| `apps/desktop/src/desktop.ts` | `isDesktop`、`PROFILE_ID`、桌面壳提示 |
| `apps/desktop/src/continuePrompt.ts` | 续写 prompt 模板 |
| `apps/desktop/src/SettingsDialog.tsx` | 配置 Base URL / 模型 / Key |
| `apps/desktop/src/HomeView.tsx` | 工作台首页 |
| `apps/desktop/src/WorkbenchView.tsx` | 三栏写作台 |
| `apps/desktop/src/App.tsx` | 视图切换与共享状态 |
| `apps/desktop/src/home.css` / `styles.css` | 首页工作台样式；去掉 `.task-pill` |
| `README.md`、`产品共创记录.md` | 与 demo 对齐 |

---

### Task 1: 领域类型与磁盘 manifest 对齐

**Files:**
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/desktop/tsconfig.json`
- Modify: `apps/desktop/vite.config.ts`
- Modify: `apps/desktop/src/App.tsx`（只改类型来源，不改交互）

**Interfaces:**
- Consumes: 无
- Produces: `Chapter`、`ProjectKind`、`ProjectManifest`（字段 `schema_version` / `created_at` / `updated_at` / `chapters`）、`RichTextDocument`（`schemaVersion` / `chapterId` / `savedAt` / `content`）

- [ ] **Step 1: 把领域类型改成与 `manifest.json` 一致**

把 `packages/domain/src/index.ts` 整文件替换为：

```ts
export type ProjectKind = "serial-novel" | "long-form" | "short-story" | "script" | "interactive";

export interface Chapter {
  id: string;
  title: string;
  goal: string;
}

export interface ProjectManifest {
  schema_version: number;
  id: string;
  title: string;
  kind: ProjectKind;
  created_at: string;
  updated_at: string;
  chapters: Chapter[];
}

export interface RichTextDocument {
  schemaVersion: number;
  chapterId: string;
  savedAt: string;
  content: Record<string, unknown>;
}
```

删除 `AiCandidate`（本轮候选只活在内存里）。

- [ ] **Step 2: 让桌面前端能 import 该包**

`apps/desktop/tsconfig.json` 的 `compilerOptions` 增加：

```json
"baseUrl": ".",
"paths": {
  "@domain": ["../../packages/domain/src/index.ts"]
}
```

`include` 保持 `["src", "vite.config.ts"]`。

`apps/desktop/vite.config.ts` 整文件替换为：

```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@domain": resolve(rootDir, "../../packages/domain/src/index.ts"),
    },
  },
});
```

- [ ] **Step 3: App.tsx 去掉平行类型**

删除 `App.tsx` 顶部的 `type Chapter` / `type Manifest`。改为：

```ts
import type { Chapter, ProjectManifest } from "@domain";

type Project = { root: string; manifest: ProjectManifest };
```

把文件中所有 `Manifest` 换成 `ProjectManifest`。`demoManifest` 必须带 `chapters`，类型才能通过；先保留演示数据（Task 5 再改首页），例如：

```ts
const demoManifest: ProjectManifest = {
  schema_version: 1,
  id: "demo",
  title: "未命名作品",
  kind: "serial-novel",
  created_at: "0",
  updated_at: "0",
  chapters: [{ id: "chapter-001", title: "第 01 章", goal: "" }],
};
```

- [ ] **Step 4: 跑类型检查**

Run: `npm run typecheck`

Expected: 退出码 0。若报找不到 `@domain`，检查 `paths` 与 vite alias 是否同时存在。

- [ ] **Step 5: Commit**

```powershell
git add packages/domain/src/index.ts apps/desktop/tsconfig.json apps/desktop/vite.config.ts apps/desktop/src/App.tsx
git commit -m "feat: align domain types with on-disk manifest"
```

---

### Task 2: ProjectStore（无演示章、快照、最近作品）

**Files:**
- Modify: `apps/desktop/src-tauri/src/project_store.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`（只追加新命令，先不删 AI 命令）

**Interfaces:**
- Consumes: 现有 `write_json_atomic` / `safe_relative` / `now`
- Produces: `create_project(root, title, kind) -> ProjectManifest`（第一章 `第 01 章`，goal `""`）；`snapshot_document(root, chapter_id, document) -> String`（返回相对路径）；`remember_project(app, root)`；`list_recent_projects(app) -> Vec<String>`；`forget_project(app, root)`

- [ ] **Step 1: 写失败测试（路径逃逸 + 新建章标题）**

在 `project_store.rs` 文件末尾追加：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_relative_rejects_parent_dir() {
        assert!(safe_relative("../secret.json").is_err());
        assert!(safe_relative("/tmp/x.json").is_err());
        assert!(safe_relative("manuscript/chapter-001.json").is_ok());
    }

    #[test]
    fn create_project_uses_blank_first_chapter() {
        let root = std::env::temp_dir().join(format!("lingan-ps-{}", now()));
        fs::create_dir_all(&root).unwrap();
        let manifest = create_project(root.to_string_lossy().into(), "测试作品".into(), "serial-novel".into()).unwrap();
        assert_eq!(manifest.chapters.len(), 1);
        assert_eq!(manifest.chapters[0].title, "第 01 章");
        assert_eq!(manifest.chapters[0].goal, "");
        assert!(!manifest.chapters[0].title.contains("潮声"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn recents_round_trip_and_forget() {
        let data = std::env::temp_dir().join(format!("lingan-recents-{}", now()));
        fs::create_dir_all(&data).unwrap();
        remember_project_at(&data, "D:/novels/a").unwrap();
        remember_project_at(&data, "D:/novels/b").unwrap();
        remember_project_at(&data, "D:/novels/a").unwrap();
        let listed = list_recent_at(&data).unwrap();
        assert_eq!(listed, vec!["D:/novels/a".to_string(), "D:/novels/b".to_string()]);
        forget_project_at(&data, "D:/novels/a").unwrap();
        assert_eq!(list_recent_at(&data).unwrap(), vec!["D:/novels/b".to_string()]);
        let _ = fs::remove_dir_all(data);
    }
}
```

此时 `remember_project_at` / `list_recent_at` / `forget_project_at` 还不存在，测试应编不过。

- [ ] **Step 2: 跑测试确认失败**

Run: `Set-Location apps/desktop/src-tauri; cargo test`

Expected: FAIL，报 `remember_project_at` 未找到，或 `create_project` 断言失败（第一章仍是潮声）。

- [ ] **Step 3: 实现最小代码**

1. `create_project` 里第一章改为：

```rust
let chapter = Chapter { id: "chapter-001".into(), title: "第 01 章".into(), goal: String::new() };
```

2. 在 `save_document` 后增加（纯函数 + Tauri 命令）：

```rust
#[tauri::command]
pub fn snapshot_document(root: String, chapter_id: String, document: serde_json::Value) -> Result<String, String> {
    let relative = format!("snapshots/{chapter_id}-{}.json", now());
    save_document(root, relative.clone(), document)?;
    Ok(relative)
}

fn recents_path(data_dir: &Path) -> PathBuf { data_dir.join("recents.json") }

pub fn list_recent_at(data_dir: &Path) -> Result<Vec<String>, String> {
    let path = recents_path(data_dir);
    if !path.exists() { return Ok(Vec::new()); }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn remember_project_at(data_dir: &Path, root: &str) -> Result<(), String> {
    let mut items = list_recent_at(data_dir)?;
    items.retain(|item| item != root);
    items.insert(0, root.to_string());
    write_json_atomic(&recents_path(data_dir), &items)
}

pub fn forget_project_at(data_dir: &Path, root: &str) -> Result<(), String> {
    let mut items = list_recent_at(data_dir)?;
    items.retain(|item| item != root);
    write_json_atomic(&recents_path(data_dir), &items)
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    tauri::Manager::path(app).app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remember_project(app: tauri::AppHandle, root: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    remember_project_at(&dir, &root)
}

#[tauri::command]
pub fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = app_data_dir(&app)?;
    if !dir.exists() { return Ok(Vec::new()); }
    list_recent_at(&dir)
}

#[tauri::command]
pub fn forget_project(app: tauri::AppHandle, root: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    if !dir.exists() { return Ok(()); }
    forget_project_at(&dir, &root)
}
```

3. `lib.rs` 的 `generate_handler!` 追加：`project_store::snapshot_document, project_store::remember_project, project_store::list_recent_projects, project_store::forget_project`

- [ ] **Step 4: 跑测试确认通过**

Run: `Set-Location apps/desktop/src-tauri; cargo test`

Expected: `safe_relative_rejects_parent_dir`、`create_project_uses_blank_first_chapter`、`recents_round_trip_and_forget` 均为 PASS。再跑 `cargo check`，退出码 0。

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src-tauri/src/project_store.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: persist recents and snapshot chapters without demo copy"
```

---

### Task 3: SecretStore

**Files:**
- Create: `apps/desktop/src-tauri/src/secret_store.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `app.path().app_data_dir()`（与 Task 2 相同）
- Produces: `ModelProfile { base_url: String, model: String, profile_id: String }`；`secret_save(profile_id, api_key)`；`secret_has(profile_id) -> bool`；`secret_delete(profile_id)`；`profile_read(app) -> Option<ModelProfile>`；`profile_save(app, profile)`；`SECRET_SERVICE = "com.wujian.ai-novel-workbench"`；`read_secret(profile_id) -> Result<String, String>`（仅供 Task 4 在 Rust 内调用，不注册为 Tauri 命令）

- [ ] **Step 1: 写失败测试（profile 文件 + 空 Key 不写凭据）**

先在 `Cargo.toml` 的 `[dependencies]` 增加一行（测试会用到模块）：

```toml
keyring = "3"
```

创建 `secret_store.rs`，先只放测试和空实现以外的签名，让测试失败：

```rust
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;

pub const SECRET_SERVICE: &str = "com.wujian.ai-novel-workbench";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelProfile {
    pub base_url: String,
    pub model: String,
    pub profile_id: String,
}

fn profile_path(data_dir: &Path) -> PathBuf { data_dir.join("model-profile.json") }

pub fn profile_read_at(data_dir: &Path) -> Result<Option<ModelProfile>, String> {
    let path = profile_path(data_dir);
    if !path.exists() { return Ok(None); }
    Ok(Some(serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?))
}

pub fn profile_save_at(data_dir: &Path, profile: &ModelProfile) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let temp = profile_path(data_dir).with_extension("json.tmp");
    fs::write(&temp, serde_json::to_vec_pretty(profile).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let dest = profile_path(data_dir);
    if dest.exists() { fs::remove_file(&dest).map_err(|e| e.to_string())?; }
    fs::rename(temp, dest).map_err(|e| e.to_string())
}

pub fn secret_save(profile_id: String, api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() { return Ok(()); }
    let entry = keyring::Entry::new(SECRET_SERVICE, &profile_id).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
}

pub fn read_secret(profile_id: &str) -> Result<String, String> {
    match keyring::Entry::new(SECRET_SERVICE, profile_id) {
        Ok(entry) => match entry.get_password() {
            Ok(value) => Ok(value),
            Err(keyring::Error::NoEntry) => Ok(String::new()),
            Err(error) => Err(error.to_string()),
        },
        Err(error) => Err(error.to_string()),
    }
}

pub fn secret_has(profile_id: String) -> Result<bool, String> {
    Ok(!read_secret(&profile_id)?.is_empty())
}

pub fn secret_delete(profile_id: String) -> Result<(), String> {
    match keyring::Entry::new(SECRET_SERVICE, &profile_id) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        },
        Err(error) => Err(error.to_string()),
    }
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profile_read(app: tauri::AppHandle) -> Result<Option<ModelProfile>, String> {
    let dir = app_data_dir(&app)?;
    if !dir.exists() { return Ok(None); }
    profile_read_at(&dir)
}

#[tauri::command]
pub fn profile_save(app: tauri::AppHandle, profile: ModelProfile) -> Result<(), String> {
    profile_save_at(&app_data_dir(&app)?, &profile)
}

#[tauri::command(rename_all = "snake_case")]
pub fn secret_save_cmd(profile_id: String, api_key: String) -> Result<(), String> {
    secret_save(profile_id, api_key)
}

#[tauri::command(rename_all = "snake_case")]
pub fn secret_has_cmd(profile_id: String) -> Result<bool, String> {
    secret_has(profile_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn secret_delete_cmd(profile_id: String) -> Result<(), String> {
    secret_delete(profile_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_round_trip() {
        let data = std::env::temp_dir().join(format!("lingan-profile-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
        let profile = ModelProfile { base_url: "http://127.0.0.1:11434/v1".into(), model: "qwen3".into(), profile_id: "default".into() };
        profile_save_at(&data, &profile).unwrap();
        assert_eq!(profile_read_at(&data).unwrap(), Some(profile));
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn empty_key_save_is_ok() {
        secret_save("default-empty-test".into(), "  ".into()).unwrap();
    }
}
```

Tauri 命令对外名称必须是 `secret_save` / `secret_has` / `secret_delete`。上面若 `rename_all` 无效，改用：

```rust
#[tauri::command(rename = "secret_save")]
pub fn secret_save_cmd(profile_id: String, api_key: String) -> Result<(), String> { secret_save(profile_id, api_key) }
```

`secret_has`、`secret_delete` 同样加 `rename`。不要把 `read_secret` 放进 `generate_handler!`。

- [ ] **Step 2: 注册模块并跑测试**

`lib.rs` 增加 `mod secret_store;`，`generate_handler!` 追加 `secret_store::profile_read, secret_store::profile_save, secret_store::secret_save_cmd, secret_store::secret_has_cmd, secret_store::secret_delete_cmd`。

Run: `Set-Location apps/desktop/src-tauri; cargo test profile_round_trip empty_key_save_is_ok -- --nocapture`

Expected: PASS。`cargo check` 退出码 0。

若 `keyring::Error::NoEntry` 在所用版本路径不同，按编译器提示改成该版本的「条目不存在」匹配，语义不变：不存在视为无 Key。

- [ ] **Step 3: Commit**

```powershell
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/secret_store.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: store API keys in the OS credential manager"
```

---

### Task 4: ModelGateway（流式在 Rust 内拼全文）

**Files:**
- Create: `apps/desktop/src-tauri/src/model_gateway.rs`
- Modify: `packages/model-gateway/src/index.ts`
- Modify: `apps/desktop/src-tauri/src/lib.rs`（删除 `ollama_generate`、`ai_generate` 及其 struct）

**Interfaces:**
- Consumes: `secret_store::profile_read_at` 不能直接用 AppHandle 的测试；`ai_complete` 通过 `profile_read` + `read_secret`。纯函数：`chat_completions_url`、`bearer_header`、`parse_completion_body`
- Produces: `ai_complete(app, profile_id, prompt) -> String`；错误文案「请先在设置中配置模型」「模型响应无法解析」

- [ ] **Step 1: 写失败测试（先写解析函数测试，函数尚未存在）**

创建 `model_gateway.rs` 先只放 `#[cfg(test)]` 会调用的函数。最小完整实现如下（本步一次写完测试+实现，因为解析器是纯函数；仍先跑测试）。

把 `packages/model-gateway/src/index.ts` 替换为：

```ts
export interface ModelProfile {
  base_url: string;
  model: string;
  profile_id: string;
}

export interface CompleteRequest {
  profile_id: string;
  prompt: string;
}
```

`model_gateway.rs`：

```rust
use serde::Deserialize;
use tauri::Manager;

use crate::secret_store::{self, ModelProfile};

#[derive(Deserialize)]
struct ChatResponse { choices: Vec<Choice> }
#[derive(Deserialize)]
struct Choice {
    #[serde(default)]
    message: Option<Message>,
    #[serde(default)]
    delta: Option<Message>,
}
#[derive(Deserialize, Default)]
struct Message {
    #[serde(default)]
    content: Option<String>,
}

pub fn chat_completions_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/v1") { format!("{base}/chat/completions") } else { format!("{base}/v1/chat/completions") }
}

pub fn bearer_header(api_key: &str) -> Option<String> {
    let key = api_key.trim();
    if key.is_empty() { None } else { Some(format!("Bearer {key}")) }
}

pub fn parse_completion_body(content_type: &str, body: &str) -> Result<String, String> {
    let trimmed = body.trim();
    let looks_sse = content_type.to_ascii_lowercase().contains("event-stream") || trimmed.starts_with("data:");
    if looks_sse {
        let mut out = String::new();
        for line in trimmed.lines() {
            let line = line.trim();
            if !line.starts_with("data:") { continue; }
            let data = line.trim_start_matches("data:").trim();
            if data.is_empty() || data == "[DONE]" { continue; }
            let parsed: ChatResponse = serde_json::from_str(data).map_err(|_| "模型响应无法解析".to_string())?;
            if let Some(piece) = choice_text(&parsed) { out.push_str(&piece); }
        }
        if out.trim().is_empty() { return Err("模型响应无法解析".into()); }
        return Ok(out);
    }
    let parsed: ChatResponse = serde_json::from_str(trimmed).map_err(|_| "模型响应无法解析".to_string())?;
    choice_text(&parsed).filter(|text| !text.trim().is_empty()).ok_or_else(|| "模型响应无法解析".into())
}

fn choice_text(parsed: &ChatResponse) -> Option<String> {
    let choice = parsed.choices.first()?;
    choice.delta.as_ref().and_then(|m| m.content.clone())
        .or_else(|| choice.message.as_ref().and_then(|m| m.content.clone()))
}

#[tauri::command]
pub async fn ai_complete(app: tauri::AppHandle, profile_id: String, prompt: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let profile: ModelProfile = secret_store::profile_read_at(&dir)?.ok_or_else(|| "请先在设置中配置模型".to_string())?;
    if profile.base_url.trim().is_empty() || profile.model.trim().is_empty() {
        return Err("请先在设置中配置模型".into());
    }
    let id = if profile_id.trim().is_empty() { profile.profile_id.clone() } else { profile_id };
    let api_key = secret_store::read_secret(&id)?;
    let url = chat_completions_url(&profile.base_url);
    let client = reqwest::Client::new();
    let mut request = client.post(url).json(&serde_json::json!({
        "model": profile.model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": true
    }));
    if let Some(header) = bearer_header(&api_key) {
        request = request.header("Authorization", header);
    }
    let response = request.send().await.map_err(|e| format!("无法连接模型服务：{e}"))?;
    if !response.status().is_success() {
        return Err(format!("API 返回错误：{}", response.status()));
    }
    let content_type = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let body = response.text().await.map_err(|e| e.to_string())?;
    parse_completion_body(&content_type, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_avoids_duplicate_v1() {
        assert_eq!(chat_completions_url("http://127.0.0.1:11434"), "http://127.0.0.1:11434/v1/chat/completions");
        assert_eq!(chat_completions_url("https://api.openai.com/v1/"), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn empty_key_has_no_bearer() {
        assert_eq!(bearer_header(""), None);
        assert_eq!(bearer_header("  "), None);
        assert_eq!(bearer_header("sk-test"), Some("Bearer sk-test".into()));
    }

    #[test]
    fn parse_json_message() {
        let body = r#"{"choices":[{"message":{"content":"潮水停了。"}}]}"#;
        assert_eq!(parse_completion_body("application/json", body).unwrap(), "潮水停了。");
    }

    #[test]
    fn parse_sse_deltas() {
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\ndata: [DONE]\n";
        assert_eq!(parse_completion_body("text/event-stream", body).unwrap(), "Hello world");
    }

    #[test]
    fn parse_rejects_garbage() {
        assert!(parse_completion_body("application/json", "not-json").is_err());
    }
}
```

把 `secret_store.rs` 里的 `profile_read_at` 保持 `pub`。`apps/desktop/tsconfig.json` 的 `paths` 与 `vite.config.ts` 的 `alias` 增加 `@gateway` → `../../packages/model-gateway/src/index.ts`（写法与 Task 1 的 `@domain` 相同）。

- [ ] **Step 2: 接入 lib.rs 并删除旧 AI 命令**

- `mod model_gateway;`
- 删除 `OllamaResponse` / `OpenAiResponse` / `ollama_generate` / `ai_generate`
- `generate_handler!` 加入 `model_gateway::ai_complete`，去掉 `ollama_generate, ai_generate`

此时前端若仍 `invoke("ai_generate")`，桌面续写会失败，这是预期，下一任务改 UI。

- [ ] **Step 3: 跑测试**

Run: `Set-Location apps/desktop/src-tauri; cargo test --lib`

Expected: 本任务新增的 url / bearer / parse 测试 PASS；Task 2/3 测试仍 PASS。`cargo check` 退出码 0。

- [ ] **Step 4: Commit**

```powershell
git add packages/model-gateway/src/index.ts apps/desktop/src-tauri/src/model_gateway.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/secret_store.rs
git commit -m "feat: complete OpenAI-compatible replies by buffering SSE"
```

---

### Task 5: 工作台首页 + 续写接受/拒绝

**Files:**
- Create: `apps/desktop/src/desktop.ts`
- Create: `apps/desktop/src/continuePrompt.ts`
- Create: `apps/desktop/src/SettingsDialog.tsx`
- Create: `apps/desktop/src/HomeView.tsx`
- Create: `apps/desktop/src/WorkbenchView.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/home.css`
- Modify: `apps/desktop/src/styles.css`（删除 `.task-pill` 及对它的使用）

**Interfaces:**
- Consumes: `create_project`、`read_manifest`、`save_manifest`、`read_document`、`save_document`、`snapshot_document`、`remember_project`、`list_recent_projects`、`forget_project`、`delete_chapter`、`profile_read`、`profile_save`、`secret_save`、`secret_has`、`secret_delete`、`ai_complete(profile_id, prompt)`
- Produces: 首页工作台 UI；写作台无原型切换器；续写-only；接受前快照

- [ ] **Step 1: 桌面探测与 prompt 模板**

`apps/desktop/src/desktop.ts`：

```ts
export const PROFILE_ID = "default";

export function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function desktopHint(): string {
  return "需要桌面应用才能访问本地文件夹、凭据和模型。";
}
```

`apps/desktop/src/continuePrompt.ts`：

```ts
export function buildContinuePrompt(instruction: string, chapterText: string): string {
  const requirement = instruction.trim() || "（无）";
  return `你是小说续写助手。根据作者要求和当前章节正文，直接输出可插入的续写段落，不要前言、不要条目列表。\n\n作者要求：\n${requirement}\n\n当前章节正文：\n${chapterText}`;
}
```

- [ ] **Step 2: 设置弹层（Key 只写不读）**

`SettingsDialog.tsx`：打开时 `invoke("profile_read")` 与 `invoke("secret_has", { profileId: PROFILE_ID })`。输入框 Key 始终空。`hasSecret` 时 placeholder 为 `已保存，输入则覆盖`。保存：若 Key 非空则 `secret_save`，然后 `profile_save({ base_url, model, profile_id: PROFILE_ID })`。提供按钮调用 `secret_delete`。非桌面壳只展示 `desktopHint()`。

invoke 参数名跟 Tauri 默认 camelCase：`profileId`、`apiKey`、`baseUrl` 若 Rust 是 snake_case 字段，serde 对 struct `ModelProfile` 用 `#[serde(rename_all = "camelCase")]` **不要加**——规格磁盘是 snake_case。因此前端 `profile_save` 传：

```ts
{ base_url: endpoint, model, profile_id: PROFILE_ID }
```

`secret_save` 传 `{ profileId: PROFILE_ID, apiKey: key }`（Tauri 2 默认把 JS camelCase 转 Rust snake_case 参数名 `profile_id` / `api_key`）。

- [ ] **Step 3: 首页改成工作台，不要营销着陆页**

`HomeView` 结构：

- 顶栏：品牌「灵感」；模型状态「已配置 · {model}」或「未配置模型」；设置按钮
- 主区标题：「工作台」（不要「把灵感，写成真正的故事」）
- 两张卡：新建作品、打开已有作品
- 最近作品列表：来自 `list_recent_projects`，逐个 `read_manifest`；失败则 `forget_project` 并跳过
- 不渲染导入、发展灵感、底部切换器

新建：`open({ directory: true })` → `prompt` 要作品名 → `create_project` → `remember_project` → 回调进入写作台。若所选目录已有 `manifest.json`，改为打开而不是覆盖。打开：读 manifest，失败则当新建。

`home.css` 去掉巨大 hero 营销句依赖；保留卡片与最近列表。删除所有「进入创作工作台 ↗」那种把用户带进演示写作台的按钮。

- [ ] **Step 4: 写作台续写闭环**

`WorkbenchView` 基于当前 `App.tsx` 三栏，必须：

- 删除 `<div className="task-pill">` 以及 `styles.css` 里 `.task-pill`
- 右栏去掉「检查设定」「润色」，只留继续写 + textarea +「生成候选」
- 模型芯片：`profile.model` 或「未配置」
- `generate`：非桌面则 setCandidate 为 `desktopHint()`；无 profile 则提示去设置，不 invoke；否则 `ai_complete({ profileId: PROFILE_ID, prompt: buildContinuePrompt(draft, editor.getText()) })`，busy 时禁用按钮，一次返回后整段显示
- 候选按钮：预览全文（`window.alert` 可接受）、**接受写入**、**拒绝**
- 接受：先 `snapshot_document({ root, chapterId, document: { schemaVersion: 1, chapterId, savedAt, content: editor.getJSON() } })`，再 `insertContent` 把候选按段落插入，再 `save_document`
- 拒绝：`setCandidate("")`，不 invoke
- 自动保存逻辑保持 900ms debounce
- 不再 `localStorage` 读写 `lingan.ai.apiKey` / `lingan.projectRoots`
- 浏览器预览可用空 `root` 的本地编辑，保存/续写只改 status 文案，不假装成功

`App.tsx` 只保留：`view`、`projects`、`projectIndex`、打开设置、在 Home / Workbench 间切换。

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`

Expected: 退出码 0。再 `Set-Location apps/desktop/src-tauri; cargo check`，退出码 0。

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/src/desktop.ts apps/desktop/src/continuePrompt.ts apps/desktop/src/SettingsDialog.tsx apps/desktop/src/HomeView.tsx apps/desktop/src/WorkbenchView.tsx apps/desktop/src/App.tsx apps/desktop/src/home.css apps/desktop/src/styles.css apps/desktop/src/main.tsx
git commit -m "feat: add workbench home and confirm-to-insert continue writing"
```

---

### Task 6: 文档与 demo 对齐

**Files:**
- Modify: `README.md`
- Modify: `产品共创记录.md`（只追加 2026-08-21 摘要，不改写全部历史）
- Modify: `docs/superpowers/specs/2026-08-21-minimum-demo-design.md` 状态改为「实现中/已规划」

**Interfaces:**
- Consumes: 本计划已实现的行为
- Produces: README 不再写「AI 是占位」「章节树是演示数据」

- [ ] **Step 1: 改 README**

「当前能力」改为：

- 工作台首页：最近作品、新建、打开、模型配置状态
- 三栏写作台：章节 CRUD、TipTap、停笔自动保存
- API Key 写入 Windows 凭据管理器；续写走 OpenAI 兼容接口，Rust 内拼接流式响应
- 接受候选前自动快照；未配置模型仍可写作
- 浏览器预览可看界面，本地文件与续写需要 `npm run desktop`

「已知限制」改为：无灵感追问、无作品资料/审阅/导入导出、无 SQLite、无流式 UI/取消、无原生透明窗口。

目录结构里的 `docs/` 改为已存在的 `docs/superpowers/`。

- [ ] **Step 2: 产品记录追加一节**

在 `产品共创记录.md` 末尾追加「2026-08-21：最小 demo 规格」：切片为写作+续写；首页为工作台；Key 进凭据库；Gateway 缓冲 SSE；规格路径与本计划路径。不要删除旧的「待确认」段落（那是历史），用新节说明当前以规格为准。

- [ ] **Step 3: typecheck（文档无代码，仍跑一次防止误改）**

Run: `npm run typecheck`

Expected: 退出码 0。

- [ ] **Step 4: Commit**

```powershell
git add README.md 产品共创记录.md docs/superpowers/specs/2026-08-21-minimum-demo-design.md
git commit -m "docs: describe the runnable continue-writing demo"
```

---

## 人工验收（全部任务完成后）

`npm run desktop`：

1. 首页是工作台，没有营销大标题，没有「A · 三栏写作台」
2. 新建作品后第一章是「第 01 章」，不是潮声
3. 写作后自动保存，重开最近作品内容还在
4. 设置里填 OpenAI 兼容 Base URL 与模型；Key 保存后再开设置看不到 Key
5. 续写一次返回全文；接受后 `snapshots/` 多文件且正文已插入
6. 拒绝不清正文
7. 未配模型仍能写；浏览器模式不能真正保存/续写

## Spec coverage

| 规格章节 | 任务 |
|---|---|
| §1 成功标准 | Task 5 + 人工验收 |
| §5.1 工作台首页 | Task 5 |
| §5.2 去掉原型条、续写-only、先快照再写入 | Task 5 |
| §6.1 ProjectStore | Task 2 |
| §6.2 SecretStore | Task 3 |
| §6.3 ModelGateway / 删除 11434 分支 | Task 4 |
| §8 失败处理 | Task 3–5 |
| §9 Rust 单测 | Task 2、4 |
| §10 提交切分 | Task 1–6（规格文档已在计划外提交） |
| 领域类型 | Task 1 |
| README | Task 6 |
