pub mod error;
pub mod model;
pub mod schedule;
pub mod seed;

pub use error::CoreError;
pub use model::{
    format_slot_label, validate_date, validate_email, Booking, BookingFilter, BookingStatus,
    Department, NewBookingInput, Priority, ScheduleSummary, SlotAvailability, Specialist,
    OPERATING_SLOTS,
};
pub use schedule::{
    compute_day_availability, create_validated_booking, filter_bookings, has_slot_conflict,
    summarize_bookings,
};
pub use seed::{
    default_departments, default_sample_bookings, default_specialists, sample_bookings_for_anchor,
};

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;

    fn sample_input(date: &str, slot: &str) -> NewBookingInput {
        NewBookingInput {
            visitor_name: "Jamie Rivera".into(),
            visitor_email: "jamie.rivera@example.org".into(),
            visitor_phone: "+1 555-0199".into(),
            department_id: "intake-bay".into(),
            specialist_id: "spec-tan".into(),
            date: date.into(),
            start_time: slot.into(),
            duration_mins: 30,
            priority: Priority::Priority,
            protocol_notes: "First-time intake check".into(),
        }
    }

    #[test]
    fn creates_valid_booking_and_blocks_double_booking() {
        let depts = default_departments();
        let specs = default_specialists();
        let first = create_validated_booking(sample_input("2026-11-26", "10:00"), &depts, &specs, &[]);
        let booking = match first {
            Ok(b) => b,
            Err(err) => panic!("expected valid booking, got {err}"),
        };

        assert!(booking.reference_code.starts_with("PB-20261126-"));
        assert_eq!(booking.status, BookingStatus::Confirmed);

        let duplicate = create_validated_booking(
            sample_input("2026-11-26", "10:00"),
            &depts,
            &specs,
            &[booking],
        );
        assert!(matches!(duplicate, Err(CoreError::SlotConflict { .. })));
    }

    #[test]
    fn rejects_invalid_email_and_out_of_hours_slot() {
        let depts = default_departments();
        let specs = default_specialists();

        let mut bad_email = sample_input("2026-11-26", "10:00");
        bad_email.visitor_email = "not-an-email".into();
        assert_eq!(
            create_validated_booking(bad_email, &depts, &specs, &[]),
            Err(CoreError::InvalidEmail)
        );

        let bad_slot = sample_input("2026-11-26", "23:15");
        assert!(matches!(
            create_validated_booking(bad_slot, &depts, &specs, &[]),
            Err(CoreError::InvalidTimeSlot(_))
        ));
    }

    #[test]
    fn cancelled_bookings_release_slot_availability() {
        let anchor = NaiveDate::from_ymd_opt(2026, 11, 25).unwrap_or_default();
        let mut bookings = sample_bookings_for_anchor(anchor);
        bookings[0].status = BookingStatus::Cancelled;

        let slots = compute_day_availability(&bookings, "spec-tan", "2026-11-25");
        let slot_0900 = slots.iter().find(|s| s.time == "09:00");
        assert!(slot_0900.is_some_and(|s| s.available));
    }

    #[test]
    fn filter_and_summary_compute_expected_metrics() {
        let anchor = NaiveDate::from_ymd_opt(2026, 11, 25).unwrap_or_default();
        let bookings = sample_bookings_for_anchor(anchor);

        let today_only = filter_bookings(
            &bookings,
            &BookingFilter {
                date_from: Some("2026-11-25".into()),
                date_to: Some("2026-11-25".into()),
                ..Default::default()
            },
        );
        assert_eq!(today_only.len(), 4);

        let summary = summarize_bookings(&today_only);
        assert_eq!(summary.total, 4);
        assert_eq!(summary.completed, 1);
        assert_eq!(summary.checked_in, 1);
        assert_eq!(summary.confirmed, 2);
        assert_eq!(summary.urgent, 1);
    }
}
