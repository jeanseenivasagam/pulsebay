use std::sync::Mutex;

use chrono::Local;
use pulsebay_core::{
    default_departments, default_specialists, Booking, BookingFilter, BookingStatus,
    NewBookingInput,
};
use pulsebay_export::{export_csv_file, export_pdf_file, export_xlsx_file, ExportMeta};
use pulsebay_store::BookingStore;
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    store: Mutex<BookingStore>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    mode: String,
    version: String,
    storage_label: String,
    db_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    format: String,
    filename: String,
    saved_path: Option<String>,
    bytes_written: usize,
    record_count: usize,
}

fn lock_store<'a>(state: &'a State<'a, AppState>) -> Result<std::sync::MutexGuard<'a, BookingStore>, String> {
    state
        .store
        .lock()
        .map_err(|_| "Internal state lock error".to_owned())
}

#[tauri::command]
fn get_runtime_info(state: State<'_, AppState>) -> Result<RuntimeInfo, String> {
    let store = lock_store(&state)?;
    Ok(RuntimeInfo {
        mode: "desktop".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        storage_label: "Local SQLite Database".into(),
        db_path: store.db_path().map(|p| p.display().to_string()),
    })
}

#[tauri::command]
fn list_bookings(state: State<'_, AppState>, filter: Option<BookingFilter>) -> Result<Vec<Booking>, String> {
    let store = lock_store(&state)?;
    let filter = filter.unwrap_or_default();
    store.list_filtered(&filter).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_booking(state: State<'_, AppState>, input: NewBookingInput) -> Result<Booking, String> {
    let store = lock_store(&state)?;
    store.create_booking(input).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_booking_status(
    state: State<'_, AppState>,
    id: String,
    status: BookingStatus,
) -> Result<Booking, String> {
    let store = lock_store(&state)?;
    store.update_status(&id, status).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_booking_notes(
    state: State<'_, AppState>,
    id: String,
    protocol_notes: String,
) -> Result<Booking, String> {
    let store = lock_store(&state)?;
    store
        .update_notes(&id, &protocol_notes)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn reschedule_booking(
    state: State<'_, AppState>,
    id: String,
    new_date: String,
    new_start_time: String,
) -> Result<Booking, String> {
    let store = lock_store(&state)?;
    store
        .reschedule_booking(&id, &new_date, &new_start_time)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_booking(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let store = lock_store(&state)?;
    store.delete_booking(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reset_sample_data(state: State<'_, AppState>) -> Result<Vec<Booking>, String> {
    let mut store = lock_store(&state)?;
    store.reset_to_sample_data().map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_all_bookings(state: State<'_, AppState>) -> Result<(), String> {
    let store = lock_store(&state)?;
    store.clear_all_bookings().map_err(|e| e.to_string())
}

#[tauri::command]
fn export_schedule(
    app: AppHandle,
    state: State<'_, AppState>,
    format: String,
    scope_label: String,
    filter: Option<BookingFilter>,
) -> Result<Option<ExportResult>, String> {
    let bookings = {
        let store = lock_store(&state)?;
        store
            .list_filtered(&filter.unwrap_or_default())
            .map_err(|e| e.to_string())?
    };

    let fmt = format.to_lowercase();
    let (filter_name, ext) = match fmt.as_str() {
        "xlsx" => ("Excel Workbook", "xlsx"),
        "csv" => ("CSV Spreadsheet", "csv"),
        "pdf" => ("PDF Document", "pdf"),
        other => return Err(format!("Unsupported export format: {other}")),
    };

    let stamp = Local::now().format("%Y-%m-%d").to_string();
    let default_name = format!("pulsebay-schedule-{stamp}.{ext}");

    let chosen = app
        .dialog()
        .file()
        .set_title(format!("Export PulseBay {filter_name}"))
        .set_file_name(&default_name)
        .add_filter(filter_name, &[ext])
        .blocking_save_file();

    let Some(file_path) = chosen else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|e| format!("Could not resolve selected file path: {e}"))?;

    let departments = default_departments();
    let specialists = default_specialists();
    let meta = ExportMeta {
        report_title: "PulseBay Operations Schedule".into(),
        scope_label,
        generated_at: Local::now().format("%Y-%m-%d %H:%M").to_string(),
    };

    let bytes_written = match ext {
        "xlsx" => export_xlsx_file(&path, &bookings, &departments, &specialists, &meta)
            .map_err(|e| e.to_string())?,
        "csv" => export_csv_file(&path, &bookings, &departments, &specialists)
            .map_err(|e| e.to_string())?,
        "pdf" => export_pdf_file(&path, &bookings, &departments, &specialists, &meta)
            .map_err(|e| e.to_string())?,
        _ => unreachable!(),
    };

    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or(default_name);

    Ok(Some(ExportResult {
        format: ext.to_owned(),
        filename,
        saved_path: Some(path.display().to_string()),
        bytes_written,
        record_count: bookings.len(),
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let store = BookingStore::open_default()
        .unwrap_or_else(|_| BookingStore::open_in_memory().expect("in-memory sqlite fallback"));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            store: Mutex::new(store),
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            list_bookings,
            create_booking,
            update_booking_status,
            update_booking_notes,
            reschedule_booking,
            delete_booking,
            reset_sample_data,
            clear_all_bookings,
            export_schedule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PulseBay desktop application");
}
