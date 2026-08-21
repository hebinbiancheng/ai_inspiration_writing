use serde::Deserialize;
use tauri::Manager;

use crate::secret_store::{self, ModelProfile};

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
