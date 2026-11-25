use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// Operational wing / department within PulseBay.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Department {
    pub id: String,
    pub name: String,
    pub short_code: String,
    pub room_label: String,
    pub protocol_summary: String,
    pub default_duration_mins: u16,
    pub accent_token: String,
}

/// Staff specialist assigned to a department wing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Specialist {
    pub id: String,
    pub name: String,
    pub role: String,
    pub department_id: String,
    pub bay_code: String,
    pub status_note: String,
}

/// Triage priority tier for a booking.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Routine,
    Priority,
    Urgent,
}

impl Priority {
    pub fn label(self) -> &'static str {
        match self {
            Self::Routine => "Routine",
            Self::Priority => "Priority",
            Self::Urgent => "Urgent",
        }
    }
}

/// Lifecycle state of an appointment booking.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BookingStatus {
    Confirmed,
    CheckedIn,
    Completed,
    Cancelled,
}

impl BookingStatus {
    pub fn label(self) -> &'static str {
        match self {
            Self::Confirmed => "Confirmed",
            Self::CheckedIn => "Checked In",
            Self::Completed => "Completed",
            Self::Cancelled => "Cancelled",
        }
    }

    /// Returns `true` if the status still occupies a time slot on the calendar.
    pub fn occupies_slot(self) -> bool {
        !matches!(self, Self::Cancelled)
    }
}

/// A persisted appointment / operations booking record.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Booking {
    pub id: String,
    pub reference_code: String,
    pub visitor_name: String,
    pub visitor_email: String,
    pub visitor_phone: String,
    pub department_id: String,
    pub specialist_id: String,
    /// ISO calendar date: `YYYY-MM-DD`
    pub date: String,
    /// 24-hour slot start time: `HH:MM`
    pub start_time: String,
    pub duration_mins: u16,
    pub priority: Priority,
    pub status: BookingStatus,
    pub protocol_notes: String,
    pub created_at: String,
}

/// Input payload for creating a new booking.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBookingInput {
    pub visitor_name: String,
    pub visitor_email: String,
    #[serde(default)]
    pub visitor_phone: String,
    pub department_id: String,
    pub specialist_id: String,
    pub date: String,
    pub start_time: String,
    #[serde(default = "default_duration")]
    pub duration_mins: u16,
    #[serde(default = "default_priority")]
    pub priority: Priority,
    #[serde(default)]
    pub protocol_notes: String,
}

fn default_duration() -> u16 {
    30
}

fn default_priority() -> Priority {
    Priority::Routine
}

/// Filter options for querying or exporting bookings.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookingFilter {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub department_id: Option<String>,
    pub specialist_id: Option<String>,
    pub status: Option<BookingStatus>,
    pub search_query: Option<String>,
}

/// Summary statistics computed over a booking slice for dashboards & reports.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSummary {
    pub total: usize,
    pub confirmed: usize,
    pub checked_in: usize,
    pub completed: usize,
    pub cancelled: usize,
    pub urgent: usize,
}

/// Availability representation for one 30-minute time slot on a given date.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlotAvailability {
    pub time: String,
    pub label: String,
    pub available: bool,
    pub booked_by: Option<String>,
    pub booking_id: Option<String>,
}

/// Standard operating slots across a clinic/operations day (08:30 through 17:00).
pub const OPERATING_SLOTS: &[&str] = &[
    "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
];

pub fn validate_date(date: &str) -> Result<NaiveDate, CoreError> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| CoreError::InvalidDate(date.to_owned()))
}

pub fn validate_email(email: &str) -> Result<(), CoreError> {
    let trimmed = email.trim();
    let Some((local, domain)) = trimmed.split_once('@') else {
        return Err(CoreError::InvalidEmail);
    };
    if local.is_empty()
        || domain.len() < 3
        || !domain.contains('.')
        || domain.starts_with('.')
        || domain.ends_with('.')
        || trimmed.contains(char::is_whitespace)
    {
        return Err(CoreError::InvalidEmail);
    }
    Ok(())
}

pub fn format_slot_label(slot_24h: &str) -> String {
    let parts: Vec<&str> = slot_24h.split(':').collect();
    if parts.len() != 2 {
        return slot_24h.to_owned();
    }
    let hour = parts[0].parse::<u8>().unwrap_or(9);
    let minute = parts[1];
    let (display_hour, meridiem) = match hour {
        0 => (12, "AM"),
        1..=11 => (hour, "AM"),
        12 => (12, "PM"),
        _ => (hour - 12, "PM"),
    };
    format!("{display_hour}:{minute} {meridiem}")
}
