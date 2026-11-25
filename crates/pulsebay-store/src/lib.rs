pub mod error;
pub mod sqlite;

pub use error::StoreError;
pub use sqlite::BookingStore;

#[cfg(test)]
mod tests {
    use pulsebay_core::{BookingFilter, BookingStatus, CoreError, NewBookingInput, Priority};
    use tempfile::tempdir;

    use super::*;

    fn new_booking(name: &str, date: &str, slot: &str) -> NewBookingInput {
        NewBookingInput {
            visitor_name: name.into(),
            visitor_email: "guest@example.org".into(),
            visitor_phone: "+1 555-0101".into(),
            department_id: "intake-bay".into(),
            specialist_id: "spec-tan".into(),
            date: date.into(),
            start_time: slot.into(),
            duration_mins: 30,
            priority: Priority::Routine,
            protocol_notes: "Initial consult".into(),
        }
    }

    #[test]
    fn persists_creates_updates_reschedules_and_deletes() {
        let dir = tempdir().unwrap_or_else(|e| panic!("tempdir failed: {e}"));
        let db_file = dir.path().join("pulsebay-test.db");

        let store = BookingStore::open_path(&db_file)
            .unwrap_or_else(|e| panic!("open_path failed: {e}"));
        assert!(db_file.exists());
        assert!(!store.list_all().unwrap_or_default().is_empty());

        let created = store
            .create_booking(new_booking("Riley Chen", "2027-01-15", "10:00"))
            .unwrap_or_else(|e| panic!("create failed: {e}"));
        assert_eq!(created.visitor_name, "Riley Chen");

        let checked_in = store
            .update_status(&created.id, BookingStatus::CheckedIn)
            .unwrap_or_else(|e| panic!("update_status failed: {e}"));
        assert_eq!(checked_in.status, BookingStatus::CheckedIn);

        let moved = store
            .reschedule_booking(&created.id, "2027-01-16", "14:30")
            .unwrap_or_else(|e| panic!("reschedule failed: {e}"));
        assert_eq!(moved.date, "2027-01-16");
        assert_eq!(moved.start_time, "14:30");

        let noted = store
            .update_notes(
                &created.id,
                "[x] Vitals checked | [x] ID verified\nPatient requested follow-up summary.",
            )
            .unwrap_or_else(|e| panic!("update_notes failed: {e}"));
        assert!(noted.protocol_notes.contains("[x] Vitals checked"));
        assert!(noted
            .protocol_notes
            .contains("Patient requested follow-up summary."));

        let filtered = store
            .list_filtered(&BookingFilter {
                search_query: Some("Riley".into()),
                ..Default::default()
            })
            .unwrap_or_default();
        assert_eq!(filtered.len(), 1);

        store
            .delete_booking(&created.id)
            .unwrap_or_else(|e| panic!("delete failed: {e}"));
        let missing = store.delete_booking(&created.id);
        assert!(matches!(
            missing,
            Err(StoreError::Core(CoreError::BookingNotFound(_)))
        ));
    }

    #[test]
    fn reschedule_blocks_conflict_with_other_booking() {
        let store = BookingStore::open_in_memory()
            .unwrap_or_else(|e| panic!("in-memory store failed: {e}"));
        let a = store
            .create_booking(new_booking("Alex One", "2027-02-10", "09:00"))
            .unwrap_or_else(|e| panic!("create A failed: {e}"));
        let b = store
            .create_booking(new_booking("Jordan Two", "2027-02-10", "10:00"))
            .unwrap_or_else(|e| panic!("create B failed: {e}"));

        let err = store.reschedule_booking(&b.id, "2027-02-10", "09:00");
        assert!(matches!(
            err,
            Err(StoreError::Core(CoreError::SlotConflict { .. }))
        ));

        // Rescheduling to its own existing slot succeeds cleanly.
        let same = store.reschedule_booking(&a.id, "2027-02-10", "09:00");
        assert!(same.is_ok());
    }

    #[test]
    fn persists_across_reopen_without_re_seeding_duplicates() {
        let dir = tempdir().unwrap_or_else(|e| panic!("tempdir failed: {e}"));
        let db_file = dir.path().join("reopen-test.db");

        let initial_count = {
            let store = BookingStore::open_path(&db_file)
                .unwrap_or_else(|e| panic!("first open failed: {e}"));
            let _ = store
                .create_booking(new_booking("Sasha Novak", "2027-03-10", "11:30"))
                .unwrap_or_else(|e| panic!("create failed: {e}"));
            store.list_all().unwrap_or_default().len()
        };

        // Reopening the same database file must retain Sasha and never duplicate seed rows
        let reopened = BookingStore::open_path(&db_file)
            .unwrap_or_else(|e| panic!("second open failed: {e}"));
        let all = reopened.list_all().unwrap_or_default();
        assert_eq!(all.len(), initial_count);
        assert!(all.iter().any(|b| b.visitor_name == "Sasha Novak"));

        // Clear all bookings and confirm reopen still stays empty (initialized_v1 persists)
        reopened
            .clear_all_bookings()
            .unwrap_or_else(|e| panic!("clear failed: {e}"));
        drop(reopened);

        let third_open = BookingStore::open_path(&db_file)
            .unwrap_or_else(|e| panic!("third open failed: {e}"));
        assert!(third_open.list_all().unwrap_or_default().is_empty());
    }

    #[test]
    fn migrates_legacy_database_without_losing_user_records() {
        let dir = tempdir().unwrap_or_else(|e| panic!("tempdir failed: {e}"));
        let legacy_db = dir.path().join("legacy/pulsebay.db");
        let new_db = dir.path().join("io.jeanseenivasagam.pulsebay/pulsebay.db");

        {
            let legacy = BookingStore::open_path(&legacy_db)
                .unwrap_or_else(|e| panic!("legacy open failed: {e}"));
            let _ = legacy
                .create_booking(new_booking("Elena Upgrade", "2027-04-20", "10:30"))
                .unwrap_or_else(|e| panic!("legacy create failed: {e}"));
        }

        let migrated = BookingStore::open_with_migration(&new_db, Some(&legacy_db))
            .unwrap_or_else(|e| panic!("migration open failed: {e}"));
        assert!(new_db.exists());
        let rows = migrated.list_all().unwrap_or_default();
        assert!(rows.iter().any(|b| b.visitor_name == "Elena Upgrade"));
    }
}
