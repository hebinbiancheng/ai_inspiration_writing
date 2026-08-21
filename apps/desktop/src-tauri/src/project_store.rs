use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter { pub id: String, pub title: String, pub goal: String }

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub chapters: Vec<Chapter>,
}

fn manifest_path(root: &Path) -> PathBuf { root.join("manifest.json") }

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "目标路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    if path.exists() { fs::remove_file(path).map_err(|error| error.to_string())?; }
    fs::rename(&temp, path).map_err(|error| error.to_string())
}

fn now() -> String {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string()).unwrap_or_else(|_| "0".into())
}

fn safe_relative(relative_path: &str) -> Result<&Path, String> {
    let relative = Path::new(relative_path);
    let escapes = relative.is_absolute()
        || relative.has_root()
        || relative_path.starts_with('/')
        || relative_path.starts_with('\\')
        || relative.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::Prefix(_)));
    if escapes {
        return Err("路径必须位于作品目录内".into());
    }
    Ok(relative)
}

#[tauri::command]
pub fn create_project(root: String, title: String, kind: String) -> Result<ProjectManifest, String> {
    let root = PathBuf::from(root);
    if title.trim().is_empty() { return Err("作品名称不能为空".into()); }
    for folder in ["manuscript", "knowledge", "generations", "assets", "snapshots"] { fs::create_dir_all(root.join(folder)).map_err(|e| e.to_string())?; }
    let chapter = Chapter { id: "chapter-001".into(), title: "第 01 章".into(), goal: String::new() };
    let manifest = ProjectManifest { schema_version: 1, id: format!("project-{}", now()), title, kind, created_at: now(), updated_at: now(), chapters: vec![chapter] };
    write_json_atomic(&manifest_path(&root), &manifest)?;
    Ok(manifest)
}

#[tauri::command]
pub fn save_document(root: String, relative_path: String, document: serde_json::Value) -> Result<(), String> {
    write_json_atomic(&PathBuf::from(root).join(safe_relative(&relative_path)?), &document)
}

#[tauri::command]
pub fn read_document(root: String, relative_path: String) -> Result<Option<serde_json::Value>, String> {
    let path = PathBuf::from(root).join(safe_relative(&relative_path)?);
    if !path.exists() { return Ok(None); }
    Ok(Some(serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn read_manifest(root: String) -> Result<ProjectManifest, String> {
    serde_json::from_slice(&fs::read(manifest_path(Path::new(&root))).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_manifest(root: String, mut manifest: ProjectManifest) -> Result<ProjectManifest, String> {
    manifest.updated_at = now();
    write_json_atomic(&manifest_path(Path::new(&root)), &manifest)?;
    Ok(manifest)
}

#[tauri::command]
pub fn delete_chapter(root: String, chapter_id: String) -> Result<(), String> {
    let path = PathBuf::from(root).join("manuscript").join(format!("{chapter_id}.json"));
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

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
    app.path().app_data_dir().map_err(|e| e.to_string())
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
