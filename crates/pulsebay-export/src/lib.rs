pub mod csv_export;
pub mod error;
pub mod pdf_export;
pub mod xlsx_export;

pub use csv_export::{export_csv_bytes, export_csv_file, ExportMeta};
pub use error::ExportError;
pub use pdf_export::{export_pdf_bytes, export_pdf_file};
pub use xlsx_export::{export_xlsx_bytes, export_xlsx_file};

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use pulsebay_core::{
        default_departments, default_specialists, sample_bookings_for_anchor, Booking,
    };
    use tempfile::tempdir;

    use super::*;

    fn sample_fixture() -> (Vec<Booking>, ExportMeta) {
        let anchor = NaiveDate::from_ymd_opt(2026, 11, 25).unwrap_or_default();
        let bookings = sample_bookings_for_anchor(anchor);
        let meta = ExportMeta {
            report_title: "PulseBay Test Schedule".into(),
            scope_label: "Nov 25 - Nov 27, 2026".into(),
            generated_at: "2026-11-25 12:00".into(),
        };
        (bookings, meta)
    }

    #[test]
    fn exports_valid_csv_with_utf8_bom_and_roundtrip() {
        let (bookings, _) = sample_fixture();
        let depts = default_departments();
        let specs = default_specialists();

        let bytes = export_csv_bytes(&bookings, &depts, &specs)
            .unwrap_or_else(|e| panic!("csv export failed: {e}"));
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));

        let mut reader = csv::Reader::from_reader(&bytes[3..]);
        let records: Vec<_> = reader
            .records()
            .collect::<Result<Vec<_>, _>>()
            .unwrap_or_else(|e| panic!("csv parse failed: {e}"));
        assert_eq!(records.len(), bookings.len());
        assert_eq!(&records[0][4], "Hannah Okafor");
    }

    #[test]
    fn exports_valid_xlsx_zip_archive_to_disk() {
        let (bookings, meta) = sample_fixture();
        let depts = default_departments();
        let specs = default_specialists();
        let dir = tempdir().unwrap_or_else(|e| panic!("tempdir failed: {e}"));
        let out_file = dir.path().join("schedule.xlsx");

        let written = export_xlsx_file(&out_file, &bookings, &depts, &specs, &meta)
            .unwrap_or_else(|e| panic!("xlsx export failed: {e}"));
        assert!(written > 2000);

        let raw = std::fs::read(&out_file).unwrap_or_default();
        // OOXML .xlsx files are ZIP archives starting with PK\x03\x04
        assert_eq!(&raw[0..4], &[0x50, 0x4B, 0x03, 0x04]);
    }

    #[test]
    fn exports_valid_multipage_pdf_document() {
        let (base, meta) = sample_fixture();
        let depts = default_departments();
        let specs = default_specialists();

        // Duplicate to 24 rows to verify multi-page pagination
        let mut many = Vec::new();
        for round in 0..4 {
            for b in &base {
                let mut cloned = b.clone();
                cloned.reference_code = format!("{}-{round}", b.reference_code);
                many.push(cloned);
            }
        }

        let bytes = export_pdf_bytes(&many, &depts, &specs, &meta)
            .unwrap_or_else(|e| panic!("pdf export failed: {e}"));
        let text = String::from_utf8_lossy(&bytes);

        assert!(text.starts_with("%PDF-1.4\n"));
        assert!(text.trim_end().ends_with("%%EOF"));
        assert!(text.contains("/Count 2"));
        assert!(text.contains("Hannah Okafor"));
        assert!(text.contains("Page 2 of 2"));
    }
}
