use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;

pub const SECRET_SERVICE: &str = "com.wujian.ai-novel-workbench";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct AppSettings {
    #[serde(default)]
    pub works_dir: String,
    #[serde(default)]
    pub active_profile_id: String,
    #[serde(default)]
    pub profiles: Vec<ModelProfile>,
}

fn settings_path(data_dir: &Path) -> PathBuf { data_dir.join("settings.json") }
fn legacy_profile_path(data_dir: &Path) -> PathBuf { data_dir.join("model-profile.json") }

fn parse_legacy_profile(raw: serde_json::Value) -> Result<AppSettings, String> {
    if raw.get("profiles").is_some() {
        return serde_json::from_value(raw).map_err(|e| e.to_string());
    }
    let id = raw.get("profile_id").and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let model = raw.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let base_url = raw.get("base_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let name = if model.trim().is_empty() { "默认".into() } else { model.clone() };
    Ok(AppSettings {
        works_dir: String::new(),
        active_profile_id: id.clone(),
        profiles: vec![ModelProfile { id, name, base_url, model }],
    })
}

pub fn settings_read_at(data_dir: &Path) -> Result<AppSettings, String> {
    let path = settings_path(data_dir);
    if path.exists() {
        return serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?).map_err(|e| e.to_string());
    }
    let legacy = legacy_profile_path(data_dir);
    if !legacy.exists() { return Ok(AppSettings::default()); }
    let raw: serde_json::Value = serde_json::from_slice(&fs::read(&legacy).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    parse_legacy_profile(raw)
}

pub fn settings_save_at(data_dir: &Path, settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let dest = settings_path(data_dir);
    let temp = dest.with_extension("json.tmp");
    fs::write(&temp, serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if dest.exists() { fs::remove_file(&dest).map_err(|e| e.to_string())?; }
    fs::rename(temp, dest).map_err(|e| e.to_string())
}

pub fn find_profile(settings: &AppSettings, profile_id: &str) -> Option<ModelProfile> {
    let id = if profile_id.trim().is_empty() { settings.active_profile_id.as_str() } else { profile_id };
    settings.profiles.iter().find(|profile| profile.id == id)
        .cloned()
        .or_else(|| settings.profiles.first().cloned())
}

pub fn secret_save(profile_id: String, api_key: String) -> Result<(), String> {
    let mut key = api_key.trim().to_string();
    if let Some(rest) = key.strip_prefix("Bearer ").or_else(|| key.strip_prefix("bearer ")) {
        key = rest.trim().to_string();
    }
    if key.is_empty() { return Ok(()); }
    let entry = keyring::Entry::new(SECRET_SERVICE, &profile_id).map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

fn is_missing_entry(error: &keyring::Error) -> bool {
    matches!(error, keyring::Error::NoEntry) || error.to_string().to_ascii_lowercase().contains("no entry")
}

pub fn read_secret(profile_id: &str) -> Result<String, String> {
    match keyring::Entry::new(SECRET_SERVICE, profile_id) {
        Ok(entry) => match entry.get_password() {
            Ok(value) => Ok(value),
            Err(error) if is_missing_entry(&error) => Ok(String::new()),
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
            Err(error) if is_missing_entry(&error) => Ok(()),
            Err(error) => Err(error.to_string()),
        },
        Err(error) => Err(error.to_string()),
    }
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_read(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let dir = app_data_dir(&app)?;
    if !dir.exists() { return Ok(AppSettings::default()); }
    settings_read_at(&dir)
}

#[tauri::command]
pub fn settings_save(app: tauri::AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    settings_save_at(&app_data_dir(&app)?, &settings)?;
    Ok(settings)
}

#[tauri::command(rename = "secret_save")]
pub fn secret_save_cmd(profile_id: String, api_key: String) -> Result<(), String> {
    secret_save(profile_id, api_key)
}

#[tauri::command(rename = "secret_has")]
pub fn secret_has_cmd(profile_id: String) -> Result<bool, String> {
    secret_has(profile_id)
}

#[tauri::command(rename = "secret_delete")]
pub fn secret_delete_cmd(profile_id: String) -> Result<(), String> {
    secret_delete(profile_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip() {
        let data = std::env::temp_dir().join(format!(
            "lingan-settings-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()
        ));
        let settings = AppSettings {
            works_dir: "D:/novels".into(),
            active_profile_id: "moonshot".into(),
            profiles: vec![
                ModelProfile {
                    id: "local".into(),
                    name: "Ollama".into(),
                    base_url: "http://127.0.0.1:11434/v1".into(),
                    model: "qwen3".into(),
                },
                ModelProfile {
                    id: "moonshot".into(),
                    name: "Kimi".into(),
                    base_url: "https://api.moonshot.cn/v1".into(),
                    model: "kimi-k3".into(),
                },
            ],
        };
        settings_save_at(&data, &settings).unwrap();
        assert_eq!(settings_read_at(&data).unwrap(), settings);
        assert_eq!(find_profile(&settings, "").unwrap().id, "moonshot");
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn migrates_single_legacy_profile() {
        let data = std::env::temp_dir().join(format!(
            "lingan-legacy-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()
        ));
        fs::create_dir_all(&data).unwrap();
        fs::write(legacy_profile_path(&data), br#"{"base_url":"http://127.0.0.1:11434/v1","model":"qwen3","profile_id":"default"}"#).unwrap();
        let settings = settings_read_at(&data).unwrap();
        assert_eq!(settings.active_profile_id, "default");
        assert_eq!(settings.profiles.len(), 1);
        assert_eq!(settings.profiles[0].id, "default");
        assert_eq!(settings.profiles[0].model, "qwen3");
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn empty_key_save_is_ok() {
        secret_save("default-empty-test".into(), "  ".into()).unwrap();
    }

    #[test]
    fn secret_round_trip_persists() {
        let id = format!(
            "lingan-key-test-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()
        );
        secret_save(id.clone(), "sk-test-not-real".into()).unwrap();
        let saved = read_secret(&id).unwrap();
        let _ = secret_delete(id);
        assert_eq!(saved, "sk-test-not-real");
    }
}
