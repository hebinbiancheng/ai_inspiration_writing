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
    let dest = profile_path(data_dir);
    let temp = dest.with_extension("json.tmp");
    fs::write(&temp, serde_json::to_vec_pretty(profile).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if dest.exists() { fs::remove_file(&dest).map_err(|e| e.to_string())?; }
    fs::rename(temp, dest).map_err(|e| e.to_string())
}

pub fn secret_save(profile_id: String, api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    if key.is_empty() { return Ok(()); }
    let entry = keyring::Entry::new(SECRET_SERVICE, &profile_id).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
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
pub fn profile_read(app: tauri::AppHandle) -> Result<Option<ModelProfile>, String> {
    let dir = app_data_dir(&app)?;
    if !dir.exists() { return Ok(None); }
    profile_read_at(&dir)
}

#[tauri::command]
pub fn profile_save(app: tauri::AppHandle, profile: ModelProfile) -> Result<(), String> {
    profile_save_at(&app_data_dir(&app)?, &profile)
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
    fn profile_round_trip() {
        let data = std::env::temp_dir().join(format!(
            "lingan-profile-{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()
        ));
        let profile = ModelProfile {
            base_url: "http://127.0.0.1:11434/v1".into(),
            model: "qwen3".into(),
            profile_id: "default".into(),
        };
        profile_save_at(&data, &profile).unwrap();
        assert_eq!(profile_read_at(&data).unwrap(), Some(profile));
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn empty_key_save_is_ok() {
        secret_save("default-empty-test".into(), "  ".into()).unwrap();
    }
}
