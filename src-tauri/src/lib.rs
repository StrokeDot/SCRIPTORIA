mod store;
use serde_json::Value;
use std::sync::Mutex;
use tauri::Manager;

#[tauri::command]
fn request(db:tauri::State<'_,Mutex<store::Store>>, action:String, args:Value)->Result<Value,String>{
    db.lock().map_err(|_|"Local database is busy".to_string())?.request(&action,args)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app|{
            let root=app.path().app_data_dir()?;
            let store=store::Store::open(root).map_err(std::io::Error::other)?;
            app.manage(Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![request])
        .run(tauri::generate_context!())
        .expect("SCRIPTORIA could not start");
}
