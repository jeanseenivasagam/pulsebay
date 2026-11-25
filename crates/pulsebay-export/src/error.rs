use thiserror::Error;

/// Errors returned while generating Excel, CSV, or PDF schedule exports.
#[derive(Debug, Error)]
pub enum ExportError {
    #[error("Excel (.xlsx) generation failed: {0}")]
    Xlsx(#[from] rust_xlsxwriter::XlsxError),

    #[error("CSV serialization failed: {0}")]
    Csv(#[from] csv::Error),

    #[error("I/O error writing export file: {0}")]
    Io(#[from] std::io::Error),
}
