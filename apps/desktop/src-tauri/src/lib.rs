mod project_store;

#[derive(serde::Deserialize)]
struct OllamaResponse { response: String }

#[derive(serde::Deserialize)]
struct OpenAiResponse { choices: Vec<OpenAiChoice> }
#[derive(serde::Deserialize)]
struct OpenAiChoice { message: OpenAiMessage }
#[derive(serde::Deserialize)]
struct OpenAiMessage { content: String }

#[tauri::command]
async fn ollama_generate(endpoint: String, model: String, prompt: String) -> Result<String, String> {
    let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));
    let response = reqwest::Client::new().post(url)
        .json(&serde_json::json!({ "model": model, "prompt": prompt, "stream": false }))
        .send().await.map_err(|e| format!("无法连接 Ollama：{e}"))?;
    if !response.status().is_success() { return Err(format!("Ollama 返回错误：{}", response.status())); }
    response.json::<OllamaResponse>().await.map(|value| value.response).map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_generate(base_url: String, api_key: String, model: String, prompt: String) -> Result<String, String> {
    let base = base_url.trim_end_matches('/');
    let client = reqwest::Client::new();
    if base.contains("11434") && api_key.trim().is_empty() {
        let response = client.post(format!("{base}/api/generate")).json(&serde_json::json!({"model": model, "prompt": prompt, "stream": false})).send().await.map_err(|e| format!("无法连接本地模型：{e}"))?;
        if !response.status().is_success() { return Err(format!("模型服务返回错误：{}", response.status())); }
        return response.json::<OllamaResponse>().await.map(|value| value.response).map_err(|e| e.to_string());
    }
    let url = if base.ends_with("/v1") { format!("{base}/chat/completions") } else { format!("{base}/v1/chat/completions") };
    let response = client.post(url).bearer_auth(api_key.trim()).json(&serde_json::json!({"model": model, "messages": [{"role":"user", "content": prompt}], "temperature": 0.7})).send().await.map_err(|e| format!("无法连接 OpenAI-compatible 服务：{e}"))?;
    if !response.status().is_success() { return Err(format!("API 返回错误：{}", response.status())); }
    let value = response.json::<OpenAiResponse>().await.map_err(|e| e.to_string())?;
    value.choices.into_iter().next().map(|choice| choice.message.content).ok_or_else(|| "响应没有内容".to_string())
}

#[tauri::command]
fn ping() -> &'static str {
    "灵感本地核心已连接"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            ping,
            ollama_generate,
            ai_generate,
            project_store::create_project,
            project_store::save_document,
            project_store::read_document,
            project_store::read_manifest,
            project_store::save_manifest,
            project_store::delete_chapter,
            project_store::snapshot_document,
            project_store::remember_project,
            project_store::list_recent_projects,
            project_store::forget_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
