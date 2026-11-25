use chrono::{Duration, Local, NaiveDate};

use crate::model::{Booking, BookingStatus, Department, Priority, Specialist};

/// Returns the 100% original default PulseBay departments (wings & protocols).
pub fn default_departments() -> Vec<Department> {
    vec![
        Department {
            id: "intake-bay".into(),
            name: "General Intake".into(),
            short_code: "INT".into(),
            room_label: "Bay A-01".into(),
            protocol_summary: "Initial vitals check, chart setup, and rapid triage routing.".into(),
            default_duration_mins: 30,
            accent_token: "cobalt".into(),
        },
        Department {
            id: "diagnostics-lab".into(),
            name: "Diagnostics Lab".into(),
            short_code: "LAB".into(),
            room_label: "Bay B-04".into(),
            protocol_summary: "On-site panels, imaging scans, and same-day lab readouts.".into(),
            default_duration_mins: 45,
            accent_token: "teal".into(),
        },
        Department {
            id: "therapy-suite".into(),
            name: "Mobility & Recovery".into(),
            short_code: "MOB".into(),
            room_label: "Bay C-02".into(),
            protocol_summary: "Guided physical rehab, posture coaching, and ergonomic plans.".into(),
            default_duration_mins: 60,
            accent_token: "amber".into(),
        },
        Department {
            id: "express-review".into(),
            name: "Express Follow-Up".into(),
            short_code: "EXP".into(),
            room_label: "Bay D-07".into(),
            protocol_summary: "15–30 min prescription renewals, lab debriefs, and clearance notes."
                .into(),
            default_duration_mins: 30,
            accent_token: "coral".into(),
        },
    ]
}

/// Returns the 100% original default PulseBay specialists.
pub fn default_specialists() -> Vec<Specialist> {
    vec![
        Specialist {
            id: "spec-tan".into(),
            name: "Dr. Mei-Ling Tan".into(),
            role: "Lead Triage Officer".into(),
            department_id: "intake-bay".into(),
            bay_code: "Bay A-01".into(),
            status_note: "On shift · Open morning & afternoon slots".into(),
        },
        Specialist {
            id: "spec-mensah".into(),
            name: "Dr. Kwame Mensah".into(),
            role: "Clinical Diagnostics Lead".into(),
            department_id: "diagnostics-lab".into(),
            bay_code: "Bay B-04".into(),
            status_note: "On shift · Fast-turnaround panels active".into(),
        },
        Specialist {
            id: "spec-lindqvist".into(),
            name: "Sora Lindqvist, PT".into(),
            role: "Senior Mobility Specialist".into(),
            department_id: "therapy-suite".into(),
            bay_code: "Bay C-02".into(),
            status_note: "On shift · Recovery studio ready".into(),
        },
        Specialist {
            id: "spec-alvarez".into(),
            name: "Nurse Mateo Alvarez".into(),
            role: "Express Desk Coordinator".into(),
            department_id: "express-review".into(),
            bay_code: "Bay D-07".into(),
            status_note: "On shift · Same-day clearance queue".into(),
        },
    ]
}

/// Generates realistic, 100% original sample bookings anchored around `anchor_date`
/// so the calendar always looks alive on first launch.
pub fn sample_bookings_for_anchor(anchor_date: NaiveDate) -> Vec<Booking> {
    let day_str = |offset: i64| -> String {
        (anchor_date + Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string()
    };

    let d0 = day_str(0);
    let d1 = day_str(1);
    let d2 = day_str(2);
    let dm1 = day_str(-1);

    vec![
        Booking {
            id: "seed-001".into(),
            reference_code: "PB-SEED-1001".into(),
            visitor_name: "Hannah Okafor".into(),
            visitor_email: "hannah.okafor@example.org".into(),
            visitor_phone: "+1 555-0142".into(),
            department_id: "intake-bay".into(),
            specialist_id: "spec-tan".into(),
            date: d0.clone(),
            start_time: "09:00".into(),
            duration_mins: 30,
            priority: Priority::Routine,
            status: BookingStatus::Completed,
            protocol_notes: "Annual baseline vitals and intake onboarding completed.".into(),
            created_at: format!("{dm1}T09:15:00Z"),
        },
        Booking {
            id: "seed-002".into(),
            reference_code: "PB-SEED-1002".into(),
            visitor_name: "Devon Takahashi".into(),
            visitor_email: "devon.takahashi@example.org".into(),
            visitor_phone: "+1 555-0188".into(),
            department_id: "diagnostics-lab".into(),
            specialist_id: "spec-mensah".into(),
            date: d0.clone(),
            start_time: "10:30".into(),
            duration_mins: 45,
            priority: Priority::Priority,
            status: BookingStatus::CheckedIn,
            protocol_notes: "Fasting metabolic panel + pulse oximetry calibration.".into(),
            created_at: format!("{dm1}T11:40:00Z"),
        },
        Booking {
            id: "seed-003".into(),
            reference_code: "PB-SEED-1003".into(),
            visitor_name: "Priya Subramanian".into(),
            visitor_email: "priya.subramanian@example.org".into(),
            visitor_phone: "+1 555-0194".into(),
            department_id: "therapy-suite".into(),
            specialist_id: "spec-lindqvist".into(),
            date: d0.clone(),
            start_time: "14:00".into(),
            duration_mins: 60,
            priority: Priority::Routine,
            status: BookingStatus::Confirmed,
            protocol_notes: "Post-marathon knee mobility assessment and stretch plan.".into(),
            created_at: format!("{dm1}T15:05:00Z"),
        },
        Booking {
            id: "seed-004".into(),
            reference_code: "PB-SEED-1004".into(),
            visitor_name: "Lucas Vermeer".into(),
            visitor_email: "lucas.vermeer@example.org".into(),
            visitor_phone: "+1 555-0129".into(),
            department_id: "express-review".into(),
            specialist_id: "spec-alvarez".into(),
            date: d0,
            start_time: "15:30".into(),
            duration_mins: 30,
            priority: Priority::Urgent,
            status: BookingStatus::Confirmed,
            protocol_notes: "Same-day travel clearance certificate and prescription check.".into(),
            created_at: format!("{dm1}T16:20:00Z"),
        },
        Booking {
            id: "seed-005".into(),
            reference_code: "PB-SEED-1005".into(),
            visitor_name: "Amara Diallo".into(),
            visitor_email: "amara.diallo@example.org".into(),
            visitor_phone: "+1 555-0167".into(),
            department_id: "intake-bay".into(),
            specialist_id: "spec-tan".into(),
            date: d1.clone(),
            start_time: "09:30".into(),
            duration_mins: 30,
            priority: Priority::Routine,
            status: BookingStatus::Confirmed,
            protocol_notes: "New member intake and digital record verification.".into(),
            created_at: format!("{dm1}T17:10:00Z"),
        },
        Booking {
            id: "seed-006".into(),
            reference_code: "PB-SEED-1006".into(),
            visitor_name: "Caleb Kowalski".into(),
            visitor_email: "caleb.kowalski@example.org".into(),
            visitor_phone: "+1 555-0115".into(),
            department_id: "diagnostics-lab".into(),
            specialist_id: "spec-mensah".into(),
            date: d1,
            start_time: "13:30".into(),
            duration_mins: 45,
            priority: Priority::Priority,
            status: BookingStatus::Confirmed,
            protocol_notes: "Routine thyroid and iron panel follow-up draw.".into(),
            created_at: format!("{dm1}T18:00:00Z"),
        },
        Booking {
            id: "seed-007".into(),
            reference_code: "PB-SEED-1007".into(),
            visitor_name: "Noor Al-Mansoor".into(),
            visitor_email: "noor.almansoor@example.org".into(),
            visitor_phone: "+1 555-0173".into(),
            department_id: "therapy-suite".into(),
            specialist_id: "spec-lindqvist".into(),
            date: d2,
            start_time: "11:00".into(),
            duration_mins: 60,
            priority: Priority::Routine,
            status: BookingStatus::Confirmed,
            protocol_notes: "Ergonomic desk posture session and shoulder recovery drills.".into(),
            created_at: format!("{dm1}T18:30:00Z"),
        },
    ]
}

/// Convenience helper using the current local date as the seed anchor.
pub fn default_sample_bookings() -> Vec<Booking> {
    sample_bookings_for_anchor(Local::now().date_naive())
}
