# 最小可运行 Demo 设计

- 日期：2026-08-21
- 状态：待用户审阅；通过后进入实现计划
- 产品：灵感（本地优先 AI 小说创作工作台）
- 范围：正式可运行的最小闭环，不是完整第一版

## 1. 要证明什么

作者在本机桌面应用里可以：新建一部作品、写章节并自动保存、配置自己的 OpenAI 兼容 API（Key 进 Windows 凭据管理器）、对当前章生成一条续写候选、预览后接受才写入正文（写入前自动快照）、关掉应用再打开内容仍在。未配置模型时仍能写作。

成功标准只认 `npm run desktop` 跑通上述闭环。不要求流式 UI、取消、用量估算、Windows 安装包。

## 2. 已确认决策

| 决策 | 选择 |
|---|---|
| 切片 | 本地写作 + 真实 AI 续写 |
| AI 动作 | 只做续写；不做润色、设定检查 |
| 密钥 | Windows Credential Manager；作品目录不落 Key；前端永不回读 Key |
| 模型 | 只做 OpenAI 兼容适配器（含 Ollama `/v1`） |
| 实现路径 | 抽出 `ProjectStore` / `SecretStore` / `ModelGateway`，现有写作台做第一消费者 |
| 打开作品 | 直接进三栏写作台；作品概览（原型 C）本轮不做 |
| 首页 | 规划中的应用工作台（原型 B 的可用入口），不是当前营销着陆页 |
| 流式 | UI 不逐字刷新；`ModelGateway` 在 Rust 内消费 SSE 并拼成全文再返回 |

## 3. 本轮不做

灵感追问、人物/世界观/大纲、审阅、批量导入导出、SQLite / FTS5、`AgentRunner` / `TaskCenter`、流式 UI / 取消 / Token 估算、Ollama 原生 `/api/generate`、图片、原生透明窗口、作品概览 C、回收站、加密备份、macOS 打包、未接受候选落盘到 `generations/`。

章节删除若界面仍保留，只做确认后删除文件，不在本轮做回收站。这不是验收路径。

## 4. 架构

桌面壳保持 Tauri 2 + React 19 + Vite + Tiptap。不拆新包运行时依赖；`packages/domain` 提供与磁盘一致的类型，`packages/model-gateway` 只放请求/响应类型，HTTP 在 Rust。

```text
[工作台首页] ──打开/新建──► [三栏写作台]
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              ProjectStore   SecretStore   ModelGateway
              作品目录         凭据库         OpenAI 兼容
              正文/快照        只存 Key       流式拼全文
```

续写不是独立 Agent 框架。写作台内一段用例：组 prompt → `complete` → 内存中一条候选 → 接受时先快照再写入。

磁盘 `manifest.json` 保持现有 snake_case 与 `schema_version: 1`，本轮不写格式迁移。领域 TS 类型字段名与 JSON 一致（`schema_version`、`created_at`、`chapters` 等），避免第三套 camelCase 平行模型。

## 5. 界面

### 5.1 工作台首页

参考原型 B 的工作台结构，只放本轮能用的入口：

- 最近作品：来自应用数据目录的根路径列表，点一项打开并进入写作台
- 新建作品：选文件夹，输入作品名，创建后进入写作台
- 打开已有作品：选已有作品文件夹，读 `manifest.json` 后进入写作台
- 配置 AI：Base URL、模型名、API Key（Key 只写不读）；展示是否已保存 Key
- 模型配置状态：已配置 / 未配置，不展示 Key 明文

不出现：导入、发展灵感、假数据仪表盘。底部不出现原型切换器。

未配置 API 时首页仍可用；只有续写会引导去配置。

### 5.2 三栏写作台

保留左栏作品/章节、中栏编辑器、右栏 AI。去掉底部「A · 三栏写作台」。

右栏只留「继续写」和指令输入。去掉「检查设定」「润色」。模型芯片显示当前配置的模型名，不写死 `Ollama · qwen3`。

候选区：预览全文、接受写入、拒绝。接受 = 先把当前章写入 `snapshots/`，再把候选插入正文，再保存 `manuscript/{chapterId}.json`。拒绝 = 清空内存候选，不改正文、不落盘。

玻璃主题 CSS 切换可保留，不代表原生透明窗口已交付。

浏览器预览：可看首页与写作台布局；新建/打开/保存/续写提示必须使用桌面壳。

## 6. 模块接口

### 6.1 ProjectStore（Rust）

| 命令 | 行为 |
|---|---|
| `create_project(root, title, kind)` | 建 `manuscript/` `knowledge/` `generations/` `assets/` `snapshots/` 与 `manifest.json`。第一章标题为「第 01 章」，目标为空字符串，禁止再写入「潮声」演示文案 |
| `read_manifest` / `save_manifest` | 读写根目录 `manifest.json` |
| `read_document` / `save_document` | 相对路径必须在作品目录内，禁止 `..` 与绝对路径；原子写（临时文件后替换） |
| `snapshot_document(root, chapter_id, document)` | 写入 `snapshots/{chapter_id}-{unix_ms}.json` |
| `remember_project(root)` / `list_recent_projects()` | 应用数据目录 `recents.json`，供首页最近作品。损坏或已移动的根路径打开失败时从列表摘掉，不崩溃 |

章节增删改通过 `save_manifest` 完成；删章可继续删对应 `manuscript` 文件，不做回收站。

### 6.2 SecretStore（Rust）

凭据目标：service = `com.wujian.ai-novel-workbench`，account = `profileId`（本轮固定 `default`）。实现用能对接 Windows Credential Manager 的 `keyring`（或同等），不用 Stronghold 文件库，不用 `localStorage` 存 Key。

| 命令 | 行为 |
|---|---|
| `secret_save(profile_id, api_key)` | 仅当 `api_key` 非空时写入凭据库。空字符串不写入（Windows 凭据库不能可靠存空密码） |
| `secret_has(profile_id)` | 返回凭据库中是否已有非空 Key；永不返回 Key |
| `secret_delete(profile_id)` | 删除凭据 |

非密钥配置 `{ base_url, model, profile_id }` 存在应用数据目录 `model-profile.json`，由 Rust 读写（`profile_read` / `profile_save`）。

设置页保存规则：

- 用户填了非空 Key：`secret_save`，再 `profile_save`
- Key 输入框留空：不改凭据库，只 `profile_save`（本地 Ollama `/v1` 无 Key 也能用；已保存的云端 Key 保持不变）
- 「清除已保存的 Key」：`secret_delete`

打开设置时：读 profile + `secret_has`；Key 输入框始终空白；`secret_has == true` 时 placeholder 为「已保存，输入则覆盖」。`ai_complete` 在凭据缺失时按空 Key 发请求（不带 `Authorization`）。

### 6.3 ModelGateway（Rust）

唯一命令：`ai_complete(profile_id, prompt) -> string`。

内部步骤：

1. 读 `model-profile.json` 得到 `base_url`、`model`；缺配置则返回可理解错误：「请先在设置中配置模型」。
2. 从 SecretStore 取 Key；无记录视为空 Key。
3. 请求 `POST {base}/v1/chat/completions`（若 `base_url` 已以 `/v1` 结尾则不再重复拼接）。JSON：`model`、`messages: [{role:"user", content: prompt}]`、`stream: true`。仅当 Key 非空时加 `Authorization: Bearer`。
4. 若 `Content-Type` 含 `event-stream` 或正文以 `data:` 开头：解析 SSE，拼接 `choices[0].delta.content`（兼容部分实现放在 `choices[0].message.content` 的增量），直到 `data: [DONE]`。
5. 否则按 JSON 解析 `choices[0].message.content`。
6. 空内容或无法解析：返回明确错误，不把半截 SSE 当正文。

删除现有 `ollama_generate` 以及「URL 含 11434 则走 Ollama 原生」的分支。前端不传 Key。

续写 prompt 固定结构（无作品资料）：

```text
你是小说续写助手。根据作者要求和当前章节正文，直接输出可插入的续写段落，不要前言、不要条目列表。

作者要求：
{用户指令，可为空}

当前章节正文：
{编辑器纯文本}
```

## 7. 数据流

```text
新建/打开
  UI → 选文件夹 → create_project 或 read_manifest → remember_project → 进入写作台 → read_document

写作
  Tiptap 停笔约 1s → save_document(manuscript/{id}.json)

配置 AI
  UI 提交 base_url/model；Key 非空才 secret_save；然后 profile_save；刷新 secret_has

续写
  UI 组 prompt → ai_complete(default, prompt)
    → SecretStore 取 Key → HTTP 流式收完 → 返回全文
    → UI 显示一条候选（busy 期间按钮禁用，不逐字刷新）

接受
  snapshot_document → 插入编辑器 → save_document

拒绝
  清空 UI 候选状态

重开
  list_recent_projects → read_manifest → read_document
```

## 8. 失败处理

| 情况 | 表现 |
|---|---|
| 非桌面壳 | 首页可浏览；涉及文件夹、保存、凭据、续写的操作提示「需要桌面应用」；已输入正文留在当前页，不假装已保存 |
| 未配置模型 | 编辑与保存正常；点续写提示去配置，不调用网络 |
| 凭据/网络/HTTP 错误 | 候选区显示具体失败原因；正文与未保存草稿不丢 |
| 只流式且可拼接 | Gateway 拼全文，UI 一次展示 |
| 既非 JSON 也非可用 SSE | 明确报错「模型响应无法解析」，不写入候选正文 |
| 作品文件夹被移动 | 最近列表打开失败则移除该项并提示，应用不崩溃 |
| 空 Key 调需要鉴权的云端 | 展示 API 返回的错误，不伪造成功 |

不无限重试。一次续写一次请求。本轮无取消：关闭窗口由操作系统中断进程，不保证服务端停算。

## 9. 测试

提交前：`npm run typecheck`；在 `apps/desktop/src-tauri` 执行 `cargo check`。

Rust 单测：

- 相对路径含 `..` 或绝对路径被拒绝
- 典型 OpenAI SSE 片段能拼出完整字符串
- 非流式 JSON `chat/completions` 能取出 `message.content`
- 凭据缺失时请求头不含 `Authorization`

不写端到端 UI 自动化。人工按第 1 节闭环验收。

## 10. 提交切分

每步一个 commit，主题外的文件不进该步。每步跑第 9 节自动检查。

1. 本规格（本文档）
2. `packages/domain` 与磁盘 manifest 对齐（含 `chapters`），去掉前端平行类型
3. `ProjectStore`：去掉「潮声」演示章、`snapshot_document`、最近作品 `recents.json`
4. `SecretStore` + `model-profile.json`
5. `ModelGateway`：`ai_complete` 流式拼全文；删除端口号猜测
6. 工作台首页、去掉「A · 三栏写作台」、续写-only 候选接受/拒绝
7. README 与产品记录改到与 demo 一致（AI 已直连、首页是工作台、已知限制改为本轮未做清单）

## 11. 与现有代码的关系

吸收工作区里已有的首页雏形、自动保存、章节 CRUD、设置弹层，按本规格改而不是推倒。必须改掉的偏差：`localStorage` 存 Key、新建作品写死「潮声」、底部原型切换器、AI 面板三项动作、用 11434 判断 Ollama、`packages/domain` 与 Rust 字段不一致。
