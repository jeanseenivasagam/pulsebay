use std::fs;
use std::path::Path;

use pulsebay_core::{
    format_slot_label, summarize_bookings, Booking, BookingStatus, Department, Priority, Specialist,
};
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};

use crate::csv_export::{resolve_department, resolve_specialist, ExportMeta};
use crate::error::ExportError;

/// Generates a styled two-sheet Excel `.xlsx` workbook (`Schedule` + `Summary`).
pub fn export_xlsx_bytes(
    bookings: &[Booking],
    departments: &[Department],
    specialists: &[Specialist],
    meta: &ExportMeta,
) -> Result<Vec<u8>, ExportError> {
    let mut workbook = Workbook::new();

    // Shared formats
    let header_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x1B6CE5))
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0x16263B));

    let title_fmt = Format::new()
        .set_bold()
        .set_font_size(14)
        .set_font_color(Color::RGB(0x16263B));

    let subtitle_fmt = Format::new()
        .set_font_size(10)
        .set_font_color(Color::RGB(0x4A607A));

    let cell_fmt = Format::new()
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xD3E1EA));

    let zebra_fmt = Format::new()
        .set_align(FormatAlign::VerticalCenter)
        .set_background_color(Color::RGB(0xF4F8FB))
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xD3E1EA));

    let num_fmt = Format::new()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xD3E1EA));

    let confirmed_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0x0D6E60))
        .set_background_color(Color::RGB(0xDCF5F1))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xB8E4DD));

    let checked_in_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0x1453B8))
        .set_background_color(Color::RGB(0xE0ECFF))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xBDD5FA));

    let completed_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0x3A4E63))
        .set_background_color(Color::RGB(0xE8EFF5))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xCBD7E2));

    let cancelled_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0xB42336))
        .set_background_color(Color::RGB(0xFDE8EB))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xF6C4CC));

    let urgent_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0xB42336))
        .set_background_color(Color::RGB(0xFDE8EB))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xF6C4CC));

    let priority_fmt = Format::new()
        .set_bold()
        .set_font_color(Color::RGB(0x9C5F00))
        .set_background_color(Color::RGB(0xFFF3D6))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(0xF3D79B));

    // --- Sheet 1: Schedule ---
    let sheet = workbook.add_worksheet();
    sheet.set_name("Schedule")?;
    sheet.set_freeze_panes(1, 0)?;

    let headers = [
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
    ];

    sheet.set_row_height(0, 26)?;
    for (col, title) in headers.iter().enumerate() {
        sheet.write_string_with_format(0, col as u16, *title, &header_fmt)?;
    }

    for (idx, b) in bookings.iter().enumerate() {
        let row = (idx + 1) as u32;
        sheet.set_row_height(row, 22)?;
        let row_fmt = if idx % 2 == 1 { &zebra_fmt } else { &cell_fmt };
        let (dept_name, _code, room) = resolve_department(departments, &b.department_id);
        let spec_name = resolve_specialist(specialists, &b.specialist_id);

        sheet.write_string_with_format(row, 0, &b.reference_code, row_fmt)?;
        sheet.write_string_with_format(row, 1, &b.date, row_fmt)?;
        sheet.write_string_with_format(row, 2, format_slot_label(&b.start_time), row_fmt)?;
        sheet.write_number_with_format(row, 3, f64::from(b.duration_mins), &num_fmt)?;
        sheet.write_string_with_format(row, 4, &b.visitor_name, row_fmt)?;
        sheet.write_string_with_format(row, 5, &b.visitor_email, row_fmt)?;
        sheet.write_string_with_format(row, 6, &b.visitor_phone, row_fmt)?;
        sheet.write_string_with_format(row, 7, dept_name, row_fmt)?;
        sheet.write_string_with_format(row, 8, room, row_fmt)?;
        sheet.write_string_with_format(row, 9, spec_name, row_fmt)?;

        let p_fmt = match b.priority {
            Priority::Urgent => &urgent_fmt,
            Priority::Priority => &priority_fmt,
            Priority::Routine => row_fmt,
        };
        sheet.write_string_with_format(row, 10, b.priority.label(), p_fmt)?;

        let s_fmt = match b.status {
            BookingStatus::Confirmed => &confirmed_fmt,
            BookingStatus::CheckedIn => &checked_in_fmt,
            BookingStatus::Completed => &completed_fmt,
            BookingStatus::Cancelled => &cancelled_fmt,
        };
        sheet.write_string_with_format(row, 11, b.status.label(), s_fmt)?;
        sheet.write_string_with_format(row, 12, &b.protocol_notes, row_fmt)?;
    }

    sheet.autofit();

    // --- Sheet 2: Summary ---
    let summary_sheet = workbook.add_worksheet();
    summary_sheet.set_name("Summary")?;

    let stats = summarize_bookings(bookings);
    summary_sheet.write_string_with_format(0, 0, &meta.report_title, &title_fmt)?;
    summary_sheet.write_string_with_format(
        1,
        0,
        format!("Scope: {} | Generated: {}", meta.scope_label, meta.generated_at),
        &subtitle_fmt,
    )?;
    summary_sheet.write_string_with_format(
        2,
        0,
        "PulseBay by Jean Seenivasagam — https://github.com/jeanseenivasagam/",
        &subtitle_fmt,
    )?;

    summary_sheet.write_string_with_format(4, 0, "Metric", &header_fmt)?;
    summary_sheet.write_string_with_format(4, 1, "Count", &header_fmt)?;

    let kpi_rows: [(&str, usize); 6] = [
        ("Total Bookings", stats.total),
        ("Confirmed", stats.confirmed),
        ("Checked In", stats.checked_in),
        ("Completed", stats.completed),
        ("Cancelled", stats.cancelled),
        ("Active Urgent", stats.urgent),
    ];

    for (offset, (label, value)) in kpi_rows.iter().enumerate() {
        let row = (5 + offset) as u32;
        summary_sheet.write_string_with_format(row, 0, *label, &cell_fmt)?;
        summary_sheet.write_number_with_format(row, 1, *value as f64, &num_fmt)?;
    }

    let dept_header_row = 13u32;
    summary_sheet.write_string_with_format(dept_header_row, 0, "Department", &header_fmt)?;
    summary_sheet.write_string_with_format(dept_header_row, 1, "Bay", &header_fmt)?;
    summary_sheet.write_string_with_format(dept_header_row, 2, "Bookings", &header_fmt)?;

    for (idx, dept) in departments.iter().enumerate() {
        let row = dept_header_row + 1 + idx as u32;
        let count = bookings
            .iter()
            .filter(|b| b.department_id == dept.id)
            .count();
        summary_sheet.write_string_with_format(row, 0, &dept.name, &cell_fmt)?;
        summary_sheet.write_string_with_format(row, 1, &dept.room_label, &cell_fmt)?;
        summary_sheet.write_number_with_format(row, 2, count as f64, &num_fmt)?;
    }

    summary_sheet.autofit();

    let buffer = workbook.save_to_buffer()?;
    Ok(buffer)
}

/// Writes the multi-sheet `.xlsx` report directly to `path`.
pub fn export_xlsx_file(
    path: impl AsRef<Path>,
    bookings: &[Booking],
    departments: &[Department],
    specialists: &[Specialist],
    meta: &ExportMeta,
) -> Result<usize, ExportError> {
    let bytes = export_xlsx_bytes(bookings, departments, specialists, meta)?;
    fs::write(path, &bytes)?;
    Ok(bytes.len())
}
