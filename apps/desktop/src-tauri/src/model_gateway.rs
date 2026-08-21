use serde::Deserialize;
use tauri::Manager;

use crate::secret_store::{self, ModelProfile};

fn load_profile(dir: &std::path::Path, profile_id: &str) -> Result<ModelProfile, String> {
    let settings = secret_store::settings_read_at(dir)?;
    let profile = secret_store::find_profile(&settings, profile_id).ok_or_else(|| "请先在设置中配置模型".to_string())?;
    if profile.base_url.trim().is_empty() || profile.model.trim().is_empty() {
        return Err("请先在设置中配置模型".into());
    }
    Ok(profile)
}

#[derive(Deserialize)]
struct ChatResponse {
    #[serde(default)]
    choices: Vec<Choice>,
}
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

#[cfg(test)]
pub fn models_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/v1") { format!("{base}/models") } else { format!("{base}/v1/models") }
}

pub fn normalize_api_key(api_key: &str) -> String {
    let key = api_key.trim();
    key.strip_prefix("Bearer ").or_else(|| key.strip_prefix("bearer ")).unwrap_or(key).trim().to_string()
}

pub fn bearer_header(api_key: &str) -> Option<String> {
    let key = normalize_api_key(api_key);
    if key.is_empty() { None } else { Some(format!("Bearer {key}")) }
}

pub fn format_http_error(status: reqwest::StatusCode, body: &str, sent_key: bool) -> String {
    let snippet: String = body.chars().filter(|ch| !ch.is_control()).take(180).collect();
    let mut message = if snippet.trim().is_empty() {
        format!("API 返回错误：{status}")
    } else {
        format!("API 返回错误：{status} · {}", snippet.trim())
    };
    if !sent_key && matches!(status.as_u16(), 401 | 403) {
        message.push_str("（请求未携带 API Key，请重新输入 Key 后再测）");
    }
    message
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
    let profile = load_profile(&dir, &profile_id)?;
    complete_chat(&profile, &secret_store::read_secret(&profile.id)?, prompt, true).await
}

async fn complete_chat(profile: &ModelProfile, api_key: &str, prompt: String, stream: bool) -> Result<String, String> {
    let url = chat_completions_url(&profile.base_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(if stream { 120 } else { 20 }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut payload = serde_json::json!({
        "model": profile.model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": stream
    });
    if !stream {
        payload["max_tokens"] = serde_json::json!(1);
    }
    let sent_key = bearer_header(api_key).is_some();
    let mut request = client.post(url).json(&payload);
    if let Some(header) = bearer_header(api_key) {
        request = request.header("Authorization", header);
    }
    let response = request.send().await.map_err(|e| format!("无法连接模型服务：{e}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format_http_error(status, &body, sent_key));
    }
    if !stream {
        return Ok(format!("连接成功 · {}", profile.model));
    }
    let content_type = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let body = response.text().await.map_err(|e| e.to_string())?;
    parse_completion_body(&content_type, &body)
}

#[tauri::command]
pub async fn ai_test(app: tauri::AppHandle, profile_id: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let profile = load_profile(&dir, &profile_id)?;
    complete_chat(&profile, &secret_store::read_secret(&profile.id)?, "ping".into(), false).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_avoids_duplicate_v1() {
        assert_eq!(chat_completions_url("http://127.0.0.1:11434"), "http://127.0.0.1:11434/v1/chat/completions");
        assert_eq!(chat_completions_url("https://api.openai.com/v1/"), "https://api.openai.com/v1/chat/completions");
        assert_eq!(models_url("https://api.openai.com/v1/"), "https://api.openai.com/v1/models");
    }

    #[test]
    fn empty_key_has_no_bearer() {
        assert_eq!(bearer_header(""), None);
        assert_eq!(bearer_header("  "), None);
        assert_eq!(bearer_header("sk-test"), Some("Bearer sk-test".into()));
        assert_eq!(bearer_header("Bearer sk-test"), Some("Bearer sk-test".into()));
    }

    #[test]
    fn http_error_mentions_missing_key() {
        let message = format_http_error(reqwest::StatusCode::UNAUTHORIZED, r#"{"error":{"code":"invalid_api_key"}}"#, false);
        assert!(message.contains("401"));
        assert!(message.contains("invalid_api_key"));
        assert!(message.contains("未携带 API Key"));
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
