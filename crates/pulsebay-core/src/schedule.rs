use chrono::Utc;
use uuid::Uuid;

use crate::error::CoreError;
use crate::model::{
    format_slot_label, validate_date, validate_email, Booking, BookingFilter, BookingStatus,
    Department, NewBookingInput, ScheduleSummary, SlotAvailability, Specialist, OPERATING_SLOTS,
};

/// Validates a new booking request against catalog entities, time rules, and existing bookings.
pub fn create_validated_booking(
    input: NewBookingInput,
    departments: &[Department],
    specialists: &[Specialist],
    existing: &[Booking],
) -> Result<Booking, CoreError> {
    let visitor_name = input.visitor_name.trim().to_owned();
    if visitor_name.chars().count() < 2 {
        return Err(CoreError::InvalidVisitorName);
    }

    let visitor_email = input.visitor_email.trim().to_owned();
    validate_email(&visitor_email)?;
    validate_date(&input.date)?;

    if !OPERATING_SLOTS.contains(&input.start_time.as_str()) {
        return Err(CoreError::InvalidTimeSlot(input.start_time));
    }

    if !matches!(input.duration_mins, 30 | 45 | 60) {
        return Err(CoreError::InvalidDuration(input.duration_mins));
    }

    if !departments.iter().any(|d| d.id == input.department_id) {
        return Err(CoreError::UnknownDepartment(input.department_id));
    }

    let specialist = specialists
        .iter()
        .find(|s| s.id == input.specialist_id)
        .ok_or_else(|| CoreError::UnknownSpecialist(input.specialist_id.clone()))?;

    if has_slot_conflict(existing, &input.specialist_id, &input.date, &input.start_time, None) {
        return Err(CoreError::SlotConflict {
            specialist: specialist.name.clone(),
            date: input.date,
            slot: input.start_time,
        });
    }

    let id = Uuid::new_v4().to_string();
    let short_tag = id
        .split('-')
        .next()
        .unwrap_or("0000")
        .chars()
        .take(4)
        .collect::<String>()
        .to_uppercase();
    let date_compact = input.date.replace('-', "");
    let reference_code = format!("PB-{}-{short_tag}", &date_compact[..date_compact.len().min(8)]);

    Ok(Booking {
        id,
        reference_code,
        visitor_name,
        visitor_email,
        visitor_phone: input.visitor_phone.trim().to_owned(),
        department_id: input.department_id,
        specialist_id: input.specialist_id,
        date: input.date,
        start_time: input.start_time,
        duration_mins: input.duration_mins,
        priority: input.priority,
        status: BookingStatus::Confirmed,
        protocol_notes: input.protocol_notes.trim().to_owned(),
        created_at: Utc::now().to_rfc3339(),
    })
}

/// Checks whether a specialist already has an active (non-cancelled) booking at `date` + `slot`.
pub fn has_slot_conflict(
    bookings: &[Booking],
    specialist_id: &str,
    date: &str,
    start_time: &str,
    ignore_booking_id: Option<&str>,
) -> bool {
    bookings.iter().any(|b| {
        if let Some(ignore_id) = ignore_booking_id {
            if b.id == ignore_id {
                return false;
            }
        }
        b.status.occupies_slot()
            && b.specialist_id == specialist_id
            && b.date == date
            && b.start_time == start_time
    })
}

/// Computes slot-by-slot availability for a specific date and specialist.
pub fn compute_day_availability(
    bookings: &[Booking],
    specialist_id: &str,
    date: &str,
) -> Vec<SlotAvailability> {
    OPERATING_SLOTS
        .iter()
        .map(|slot| {
            let matching = bookings.iter().find(|b| {
                b.status.occupies_slot()
                    && b.specialist_id == specialist_id
                    && b.date == date
                    && b.start_time == *slot
            });
            SlotAvailability {
                time: (*slot).to_owned(),
                label: format_slot_label(slot),
                available: matching.is_none(),
                booked_by: matching.map(|b| b.visitor_name.clone()),
                booking_id: matching.map(|b| b.id.clone()),
            }
        })
        .collect()
}

/// Filters bookings in deterministic date + start_time order.
pub fn filter_bookings(bookings: &[Booking], filter: &BookingFilter) -> Vec<Booking> {
    let query_lower = filter
        .search_query
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .map(str::to_lowercase);

    let mut result: Vec<Booking> = bookings
        .iter()
        .filter(|b| {
            if let Some(ref from) = filter.date_from {
                if !from.is_empty() && b.date.as_str() < from.as_str() {
                    return false;
                }
            }
            if let Some(ref to) = filter.date_to {
                if !to.is_empty() && b.date.as_str() > to.as_str() {
                    return false;
                }
            }
            if let Some(ref dept) = filter.department_id {
                if !dept.is_empty() && b.department_id != *dept {
                    return false;
                }
            }
            if let Some(ref spec) = filter.specialist_id {
                if !spec.is_empty() && b.specialist_id != *spec {
                    return false;
                }
            }
            if let Some(status) = filter.status {
                if b.status != status {
                    return false;
                }
            }
            if let Some(ref q) = query_lower {
                let haystack = format!(
                    "{} {} {} {} {}",
                    b.reference_code,
                    b.visitor_name,
                    b.visitor_email,
                    b.protocol_notes,
                    b.date
                )
                .to_lowercase();
                if !haystack.contains(q) {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect();

    result.sort_by(|a, b| {
        a.date
            .cmp(&b.date)
            .then_with(|| a.start_time.cmp(&b.start_time))
            .then_with(|| a.reference_code.cmp(&b.reference_code))
    });

    result
}

/// Summarizes booking counts by status and urgent priority.
pub fn summarize_bookings(bookings: &[Booking]) -> ScheduleSummary {
    let mut summary = ScheduleSummary {
        total: bookings.len(),
        confirmed: 0,
        checked_in: 0,
        completed: 0,
        cancelled: 0,
        urgent: 0,
    };

    for b in bookings {
        match b.status {
            BookingStatus::Confirmed => summary.confirmed += 1,
            BookingStatus::CheckedIn => summary.checked_in += 1,
            BookingStatus::Completed => summary.completed += 1,
            BookingStatus::Cancelled => summary.cancelled += 1,
        }
        if matches!(b.priority, crate::model::Priority::Urgent) && b.status.occupies_slot() {
            summary.urgent += 1;
        }
    }

    summary
}
