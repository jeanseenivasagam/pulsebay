use thiserror::Error;

/// Storage and persistence errors returned by `pulsebay-store`.
#[derive(Debug, Error)]
pub enum StoreError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error(transparent)]
    Core(#[from] pulsebay_core::CoreError),

    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),

    #[error("could not resolve local application data directory")]
    DataDirUnavailable,
}
