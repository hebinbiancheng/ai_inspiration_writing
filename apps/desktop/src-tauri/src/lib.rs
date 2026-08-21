mod project_store;
mod secret_store;
mod model_gateway;

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
            secret_store::profile_read,
            secret_store::profile_save,
            secret_store::secret_save_cmd,
            secret_store::secret_has_cmd,
            secret_store::secret_delete_cmd,
            model_gateway::ai_complete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
