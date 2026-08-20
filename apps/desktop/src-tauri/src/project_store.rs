use serde::{Deserialize, Serialize};
use std::{fs, io, path::{Path, PathBuf}};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
}

fn manifest_path(root: &Path) -> PathBuf { root.join("manifest.json") }

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "目标路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(&temp, bytes).map_err(|error| error.to_string())?;
    fs::rename(&temp, path).map_err(|error| error.to_string())
}

fn now() -> String {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string()).unwrap_or_else(|_| "0".into())
}

#[tauri::command]
pub fn create_project(root: String, title: String, kind: String) -> Result<ProjectManifest, String> {
    let root = PathBuf::from(root);
    if title.trim().is_empty() { return Err("作品名称不能为空".into()); }
    fs::create_dir_all(root.join("manuscript")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("knowledge")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("generations")).map_err(|error| error.to_string())?;
    fs::create_dir_all(root.join("assets")).map_err(|error| error.to_string())?;
    let manifest = ProjectManifest { schema_version: 1, id: format!("project-{}", now()), title, kind, created_at: now(), updated_at: now() };
    write_json_atomic(&manifest_path(&root), &manifest)?;
    Ok(manifest)
}

#[tauri::command]
pub fn save_document(root: String, relative_path: String, document: serde_json::Value) -> Result<(), String> {
    let root = PathBuf::from(root);
    let relative = Path::new(&relative_path);
    if relative.is_absolute() || relative.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
        return Err("正文路径必须位于作品目录内".into());
    }
    write_json_atomic(&root.join(relative), &document)
}

#[tauri::command]
pub fn read_manifest(root: String) -> Result<ProjectManifest, String> {
    let bytes = fs::read(manifest_path(Path::new(&root))).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[allow(dead_code)]
fn _io_error(_: io::Error) {}
