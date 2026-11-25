use thiserror::Error;

/// Domain-level validation and scheduling errors returned by `pulsebay-core`.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum CoreError {
    #[error("visitor name must be at least 2 characters long")]
    InvalidVisitorName,

    #[error("a valid contact email address is required")]
    InvalidEmail,

    #[error("booking date '{0}' must follow YYYY-MM-DD format")]
    InvalidDate(String),

    #[error("time slot '{0}' is outside operating hours (08:30–17:00 in 30-minute increments)")]
    InvalidTimeSlot(String),

    #[error("duration must be 30, 45, or 60 minutes (got {0})")]
    InvalidDuration(u16),

    #[error("unknown department id '{0}'")]
    UnknownDepartment(String),

    #[error("unknown specialist id '{0}'")]
    UnknownSpecialist(String),

    #[error("time slot conflict: {specialist} is already booked on {date} at {slot}")]
    SlotConflict {
        specialist: String,
        date: String,
        slot: String,
    },

    #[error("booking '{0}' was not found")]
    BookingNotFound(String),
}
