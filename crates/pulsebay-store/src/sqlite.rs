use std::fs;
use std::path::{Path, PathBuf};

use directories::ProjectDirs;
use pulsebay_core::{
    create_validated_booking, default_departments, default_sample_bookings, default_specialists,
    filter_bookings, has_slot_conflict, validate_date, Booking, BookingFilter, BookingStatus,
    CoreError, NewBookingInput, Priority, OPERATING_SLOTS,
};
use rusqlite::{params, Connection, OptionalExtension};

use crate::error::StoreError;

/// SQLite-backed local repository for PulseBay bookings.
pub struct BookingStore {
    conn: Connection,
    db_path: Option<PathBuf>,
}

impl BookingStore {
    /// Opens (or initializes) the standard user-level database at `%APPDATA%\PulseBay\pulsebay.db`
    /// (or OS equivalent) with zero administrator privileges required.
    pub fn open_default() -> Result<Self, StoreError> {
        let proj_dirs = ProjectDirs::from("io", "jeanseenivasagam", "PulseBay")
            .ok_or(StoreError::DataDirUnavailable)?;
        let data_dir = proj_dirs.data_dir();
        fs::create_dir_all(data_dir)?;
        let db_path = data_dir.join("pulsebay.db");
        Self::open_path(db_path)
    }

    /// Opens (or creates) a SQLite database at a specific file path.
    pub fn open_path(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let path_buf = path.as_ref().to_path_buf();
        if let Some(parent) = path_buf.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        let conn = Connection::open(&path_buf)?;
        let mut store = Self {
            conn,
            db_path: Some(path_buf),
        };
        store.init_schema()?;
        store.seed_if_first_run()?;
        Ok(store)
    }

    /// Opens an ephemeral in-memory database (ideal for automated tests).
    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        let store = Self {
            conn,
            db_path: None,
        };
        store.init_schema()?;
        Ok(store)
    }

    pub fn db_path(&self) -> Option<&Path> {
        self.db_path.as_deref()
    }

    fn init_schema(&self) -> Result<(), StoreError> {
        self.conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bookings (
                id TEXT PRIMARY KEY,
                reference_code TEXT NOT NULL UNIQUE,
                visitor_name TEXT NOT NULL,
                visitor_email TEXT NOT NULL,
                visitor_phone TEXT NOT NULL DEFAULT '',
                department_id TEXT NOT NULL,
                specialist_id TEXT NOT NULL,
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                duration_mins INTEGER NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                protocol_notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_bookings_date_time
                ON bookings(date, start_time);
            CREATE INDEX IF NOT EXISTS idx_bookings_specialist_date
                ON bookings(specialist_id, date);
            ",
        )?;
        Ok(())
    }

    fn seed_if_first_run(&mut self) -> Result<(), StoreError> {
        let initialized: Option<String> = self
            .conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'initialized_v1'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        if initialized.is_none() {
            let samples = default_sample_bookings();
            for booking in &samples {
                self.insert_raw_booking(booking)?;
            }
            self.conn.execute(
                "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('initialized_v1', 'true')",
                [],
            )?;
        }
        Ok(())
    }

    fn insert_raw_booking(&self, b: &Booking) -> Result<(), StoreError> {
        self.conn.execute(
            "
            INSERT INTO bookings (
                id, reference_code, visitor_name, visitor_email, visitor_phone,
                department_id, specialist_id, date, start_time, duration_mins,
                priority, status, protocol_notes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ",
            params![
                b.id,
                b.reference_code,
                b.visitor_name,
                b.visitor_email,
                b.visitor_phone,
                b.department_id,
                b.specialist_id,
                b.date,
                b.start_time,
                i64::from(b.duration_mins),
                priority_to_str(b.priority),
                status_to_str(b.status),
                b.protocol_notes,
                b.created_at,
            ],
        )?;
        Ok(())
    }

    /// Loads all persisted bookings ordered chronologically.
    pub fn list_all(&self) -> Result<Vec<Booking>, StoreError> {
        let mut stmt = self.conn.prepare(
            "
            SELECT
                id, reference_code, visitor_name, visitor_email, visitor_phone,
                department_id, specialist_id, date, start_time, duration_mins,
                priority, status, protocol_notes, created_at
            FROM bookings
            ORDER BY date ASC, start_time ASC, reference_code ASC
            ",
        )?;

        let rows = stmt.query_map([], |row| {
            let duration_raw: i64 = row.get(9)?;
            let priority_raw: String = row.get(10)?;
            let status_raw: String = row.get(11)?;

            Ok(Booking {
                id: row.get(0)?,
                reference_code: row.get(1)?,
                visitor_name: row.get(2)?,
                visitor_email: row.get(3)?,
                visitor_phone: row.get(4)?,
                department_id: row.get(5)?,
                specialist_id: row.get(6)?,
                date: row.get(7)?,
                start_time: row.get(8)?,
                duration_mins: u16::try_from(duration_raw).unwrap_or(30),
                priority: str_to_priority(&priority_raw),
                status: str_to_status(&status_raw),
                protocol_notes: row.get(12)?,
                created_at: row.get(13)?,
            })
        })?;

        let mut bookings = Vec::new();
        for item in rows {
            bookings.push(item?);
        }
        Ok(bookings)
    }

    /// Lists bookings matching the supplied filter.
    pub fn list_filtered(&self, filter: &BookingFilter) -> Result<Vec<Booking>, StoreError> {
        let all = self.list_all()?;
        Ok(filter_bookings(&all, filter))
    }

    /// Validates and persists a new booking, preventing specialist double-booking.
    pub fn create_booking(&self, input: NewBookingInput) -> Result<Booking, StoreError> {
        let existing = self.list_all()?;
        let departments = default_departments();
        let specialists = default_specialists();
        let booking = create_validated_booking(input, &departments, &specialists, &existing)?;
        self.insert_raw_booking(&booking)?;
        Ok(booking)
    }

    /// Updates a booking's lifecycle status (`confirmed`, `checked_in`, `completed`, `cancelled`).
    pub fn update_status(&self, id: &str, status: BookingStatus) -> Result<Booking, StoreError> {
        let updated = self.conn.execute(
            "UPDATE bookings SET status = ?1 WHERE id = ?2",
            params![status_to_str(status), id],
        )?;
        if updated == 0 {
            return Err(StoreError::Core(CoreError::BookingNotFound(id.to_owned())));
        }
        self.get_by_id(id)
    }

    /// Reschedules an existing booking to a new date/time after verifying no conflict exists.
    pub fn reschedule_booking(
        &self,
        id: &str,
        new_date: &str,
        new_start_time: &str,
    ) -> Result<Booking, StoreError> {
        validate_date(new_date)?;
        if !OPERATING_SLOTS.contains(&new_start_time) {
            return Err(StoreError::Core(CoreError::InvalidTimeSlot(
                new_start_time.to_owned(),
            )));
        }

        let current = self.get_by_id(id)?;
        let all = self.list_all()?;

        if has_slot_conflict(&all, &current.specialist_id, new_date, new_start_time, Some(id)) {
            let specialist_name = default_specialists()
                .into_iter()
                .find(|s| s.id == current.specialist_id)
                .map(|s| s.name)
                .unwrap_or_else(|| current.specialist_id.clone());
            return Err(StoreError::Core(CoreError::SlotConflict {
                specialist: specialist_name,
                date: new_date.to_owned(),
                slot: new_start_time.to_owned(),
            }));
        }

        self.conn.execute(
            "UPDATE bookings SET date = ?1, start_time = ?2, status = ?3 WHERE id = ?4",
            params![
                new_date,
                new_start_time,
                status_to_str(BookingStatus::Confirmed),
                id
            ],
        )?;

        self.get_by_id(id)
    }

    /// Permanently removes a booking by ID.
    pub fn delete_booking(&self, id: &str) -> Result<(), StoreError> {
        let removed = self
            .conn
            .execute("DELETE FROM bookings WHERE id = ?1", params![id])?;
        if removed == 0 {
            return Err(StoreError::Core(CoreError::BookingNotFound(id.to_owned())));
        }
        Ok(())
    }

    /// Replaces the schedule with fresh sample bookings anchored to today.
    pub fn reset_to_sample_data(&mut self) -> Result<Vec<Booking>, StoreError> {
        self.conn.execute("DELETE FROM bookings", [])?;
        let samples = default_sample_bookings();
        for booking in &samples {
            self.insert_raw_booking(booking)?;
        }
        Ok(samples)
    }

    /// Empties all bookings so a user can start from a blank schedule.
    pub fn clear_all_bookings(&self) -> Result<(), StoreError> {
        self.conn.execute("DELETE FROM bookings", [])?;
        Ok(())
    }

    fn get_by_id(&self, id: &str) -> Result<Booking, StoreError> {
        let all = self.list_all()?;
        all.into_iter()
            .find(|b| b.id == id)
            .ok_or_else(|| StoreError::Core(CoreError::BookingNotFound(id.to_owned())))
    }
}

fn priority_to_str(priority: Priority) -> &'static str {
    match priority {
        Priority::Routine => "routine",
        Priority::Priority => "priority",
        Priority::Urgent => "urgent",
    }
}

fn str_to_priority(value: &str) -> Priority {
    match value {
        "priority" => Priority::Priority,
        "urgent" => Priority::Urgent,
        _ => Priority::Routine,
    }
}

fn status_to_str(status: BookingStatus) -> &'static str {
    match status {
        BookingStatus::Confirmed => "confirmed",
        BookingStatus::CheckedIn => "checked_in",
        BookingStatus::Completed => "completed",
        BookingStatus::Cancelled => "cancelled",
    }
}

fn str_to_status(value: &str) -> BookingStatus {
    match value {
        "checked_in" => BookingStatus::CheckedIn,
        "completed" => BookingStatus::Completed,
        "cancelled" => BookingStatus::Cancelled,
        _ => BookingStatus::Confirmed,
    }
}
