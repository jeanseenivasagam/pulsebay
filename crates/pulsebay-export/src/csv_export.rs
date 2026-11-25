use std::fs;
use std::path::Path;

use pulsebay_core::{format_slot_label, Booking, Department, Specialist};

use crate::error::ExportError;

/// Metadata describing an exported schedule report.
#[derive(Debug, Clone)]
pub struct ExportMeta {
    pub report_title: String,
    pub scope_label: String,
    pub generated_at: String,
}

impl Default for ExportMeta {
    fn default() -> Self {
        Self {
            report_title: "PulseBay Operations Schedule".into(),
            scope_label: "All Scheduled Records".into(),
            generated_at: chrono::Local::now().format("%Y-%m-%d %H:%M").to_string(),
        }
    }
}

/// Resolves human-readable department name and room label from catalog.
pub(crate) fn resolve_department<'a>(
    departments: &'a [Department],
    dept_id: &str,
) -> (&'a str, &'a str, &'a str) {
    departments
        .iter()
        .find(|d| d.id == dept_id)
        .map(|d| (d.name.as_str(), d.short_code.as_str(), d.room_label.as_str()))
        .unwrap_or(("General", "GEN", "Main Bay"))
}

/// Resolves human-readable specialist name from catalog.
pub(crate) fn resolve_specialist<'a>(specialists: &'a [Specialist], spec_id: &str) -> &'a str {
    specialists
        .iter()
        .find(|s| s.id == spec_id)
        .map(|s| s.name.as_str())
        .unwrap_or("Unassigned")
}

/// Generates an RFC-4180 UTF-8 CSV (with UTF-8 BOM so Microsoft Excel displays Unicode cleanly).
pub fn export_csv_bytes(
    bookings: &[Booking],
    departments: &[Department],
    specialists: &[Specialist],
) -> Result<Vec<u8>, ExportError> {
    let mut output = vec![0xEF, 0xBB, 0xBF]; // UTF-8 BOM for clean Windows Excel import
    {
        let mut writer = csv::Writer::from_writer(&mut output);
        writer.write_record([
            "Reference",
            "Date",
            "Time",
            "Duration (min)",
            "Visitor",
            "Email",
            "Phone",
            "Department",
            "Room",
            "Specialist",
            "Priority",
            "Status",
            "Protocol Notes",
        ])?;

        for b in bookings {
            let (dept_name, _code, room) = resolve_department(departments, &b.department_id);
            let spec_name = resolve_specialist(specialists, &b.specialist_id);

            writer.write_record([
                b.reference_code.as_str(),
                b.date.as_str(),
                &format_slot_label(&b.start_time),
                &b.duration_mins.to_string(),
                b.visitor_name.as_str(),
                b.visitor_email.as_str(),
                b.visitor_phone.as_str(),
                dept_name,
                room,
                spec_name,
                b.priority.label(),
                b.status.label(),
                b.protocol_notes.as_str(),
            ])?;
        }
        writer.flush()?;
    }
    Ok(output)
}

/// Writes the formatted CSV export directly to `path`.
pub fn export_csv_file(
    path: impl AsRef<Path>,
    bookings: &[Booking],
    departments: &[Department],
    specialists: &[Specialist],
) -> Result<usize, ExportError> {
    let bytes = export_csv_bytes(bookings, departments, specialists)?;
    fs::write(path, &bytes)?;
    Ok(bytes.len())
}
