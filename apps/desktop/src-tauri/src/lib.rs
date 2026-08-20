mod project_store;

#[tauri::command]
fn ping() -> &'static str {
    "雾笺本地核心已连接"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![ping, project_store::create_project, project_store::save_document, project_store::read_manifest])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
