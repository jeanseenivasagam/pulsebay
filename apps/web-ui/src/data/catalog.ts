import type { Booking, Department, ScheduleSummary, SlotAvailability, Specialist } from '../types';

export const OPERATING_SLOTS: readonly string[] = [
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
];

export const DEPARTMENTS: readonly Department[] = [
  {
    id: 'intake-bay',
    name: 'General Intake',
    shortCode: 'INT',
    roomLabel: 'Bay A-01',
    protocolSummary: 'Initial vitals check, chart setup, and rapid triage routing.',
    defaultDurationMins: 30,
    accentToken: 'cobalt',
  },
  {
    id: 'diagnostics-lab',
    name: 'Diagnostics Lab',
    shortCode: 'LAB',
    roomLabel: 'Bay B-04',
    protocolSummary: 'On-site panels, imaging scans, and same-day lab readouts.',
    defaultDurationMins: 45,
    accentToken: 'teal',
  },
  {
    id: 'therapy-suite',
    name: 'Mobility & Recovery',
    shortCode: 'MOB',
    roomLabel: 'Bay C-02',
    protocolSummary: 'Guided physical rehab, posture coaching, and ergonomic plans.',
    defaultDurationMins: 60,
    accentToken: 'amber',
  },
  {
    id: 'express-review',
    name: 'Express Follow-Up',
    shortCode: 'EXP',
    roomLabel: 'Bay D-07',
    protocolSummary: '15-30 min prescription renewals, lab debriefs, and clearance notes.',
    defaultDurationMins: 30,
    accentToken: 'coral',
  },
];

export const SPECIALISTS: readonly Specialist[] = [
  {
    id: 'spec-tan',
    name: 'Dr. Mei-Ling Tan',
    role: 'Lead Triage Officer',
    departmentId: 'intake-bay',
    bayCode: 'Bay A-01',
    statusNote: 'On shift, open morning and afternoon slots',
  },
  {
    id: 'spec-mensah',
    name: 'Dr. Kwame Mensah',
    role: 'Clinical Diagnostics Lead',
    departmentId: 'diagnostics-lab',
    bayCode: 'Bay B-04',
    statusNote: 'On shift, fast-turnaround panels active',
  },
  {
    id: 'spec-lindqvist',
    name: 'Sora Lindqvist, PT',
    role: 'Senior Mobility Specialist',
    departmentId: 'therapy-suite',
    bayCode: 'Bay C-02',
    statusNote: 'On shift, recovery studio ready',
  },
  {
    id: 'spec-alvarez',
    name: 'Nurse Mateo Alvarez',
    role: 'Express Desk Coordinator',
    departmentId: 'express-review',
    bayCode: 'Bay D-07',
    statusNote: 'On shift, same-day clearance queue',
  },
];

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + deltaDays);
  return toIsoDate(dt);
}

export function formatSlotLabel(slot24: string): string {
  const [hStr, mStr = '00'] = slot24.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return slot24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

export function formatHumanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function statusLabel(status: Booking['status']): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'checked_in':
      return 'Checked In';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function priorityLabel(priority: Booking['priority']): string {
  switch (priority) {
    case 'routine':
      return 'Routine';
    case 'priority':
      return 'Priority';
    case 'urgent':
      return 'Urgent';
  }
}

export function getDepartment(deptId: string): Department {
  return DEPARTMENTS.find((d) => d.id === deptId) ?? DEPARTMENTS[0];
}

export function getSpecialist(specId: string): Specialist {
  return SPECIALISTS.find((s) => s.id === specId) ?? SPECIALISTS[0];
}

export function summarizeBookings(bookings: readonly Booking[]): ScheduleSummary {
  const summary: ScheduleSummary = {
    total: bookings.length,
    confirmed: 0,
    checkedIn: 0,
    completed: 0,
    cancelled: 0,
    urgent: 0,
  };
  for (const b of bookings) {
    if (b.status === 'confirmed') summary.confirmed += 1;
    else if (b.status === 'checked_in') summary.checkedIn += 1;
    else if (b.status === 'completed') summary.completed += 1;
    else if (b.status === 'cancelled') summary.cancelled += 1;

    if (b.priority === 'urgent' && b.status !== 'cancelled') {
      summary.urgent += 1;
    }
  }
  return summary;
}

export function computeDaySlots(
  bookings: readonly Booking[],
  specialistId: string,
  date: string
): SlotAvailability[] {
  return OPERATING_SLOTS.map((slot) => {
    const found = bookings.find(
      (b) =>
        b.status !== 'cancelled' &&
        b.specialistId === specialistId &&
        b.date === date &&
        b.startTime === slot
    );
    return {
      time: slot,
      label: formatSlotLabel(slot),
      available: !found,
      bookedBy: found?.visitorName,
      bookingId: found?.id,
    };
  });
}

export function buildSampleBookings(anchorIso = toIsoDate(new Date())): Booking[] {
  const d0 = anchorIso;
  const d1 = addDaysIso(anchorIso, 1);
  const d2 = addDaysIso(anchorIso, 2);
  const dm1 = addDaysIso(anchorIso, -1);

  return [
    {
      id: 'seed-001',
      referenceCode: 'PB-SEED-1001',
      visitorName: 'Hannah Okafor',
      visitorEmail: 'hannah.okafor@example.org',
      visitorPhone: '+1 555-0142',
      departmentId: 'intake-bay',
      specialistId: 'spec-tan',
      date: d0,
      startTime: '09:00',
      durationMins: 30,
      priority: 'routine',
      status: 'completed',
      protocolNotes: 'Annual baseline vitals and intake onboarding completed.',
      createdAt: `${dm1}T09:15:00Z`,
    },
    {
      id: 'seed-002',
      referenceCode: 'PB-SEED-1002',
      visitorName: 'Devon Takahashi',
      visitorEmail: 'devon.takahashi@example.org',
      visitorPhone: '+1 555-0188',
      departmentId: 'diagnostics-lab',
      specialistId: 'spec-mensah',
      date: d0,
      startTime: '10:30',
      durationMins: 45,
      priority: 'priority',
      status: 'checked_in',
      protocolNotes: 'Fasting metabolic panel + pulse oximetry calibration.',
      createdAt: `${dm1}T11:40:00Z`,
    },
    {
      id: 'seed-003',
      referenceCode: 'PB-SEED-1003',
      visitorName: 'Priya Subramanian',
      visitorEmail: 'priya.subramanian@example.org',
      visitorPhone: '+1 555-0194',
      departmentId: 'therapy-suite',
      specialistId: 'spec-lindqvist',
      date: d0,
      startTime: '14:00',
      durationMins: 60,
      priority: 'routine',
      status: 'confirmed',
      protocolNotes: 'Post-marathon knee mobility assessment and stretch plan.',
      createdAt: `${dm1}T15:05:00Z`,
    },
    {
      id: 'seed-004',
      referenceCode: 'PB-SEED-1004',
      visitorName: 'Lucas Vermeer',
      visitorEmail: 'lucas.vermeer@example.org',
      visitorPhone: '+1 555-0129',
      departmentId: 'express-review',
      specialistId: 'spec-alvarez',
      date: d0,
      startTime: '15:30',
      durationMins: 30,
      priority: 'urgent',
      status: 'confirmed',
      protocolNotes: 'Same-day travel clearance certificate and prescription check.',
      createdAt: `${dm1}T16:20:00Z`,
    },
    {
      id: 'seed-005',
      referenceCode: 'PB-SEED-1005',
      visitorName: 'Amara Diallo',
      visitorEmail: 'amara.diallo@example.org',
      visitorPhone: '+1 555-0167',
      departmentId: 'intake-bay',
      specialistId: 'spec-tan',
      date: d1,
      startTime: '09:30',
      durationMins: 30,
      priority: 'routine',
      status: 'confirmed',
      protocolNotes: 'New member intake and digital record verification.',
      createdAt: `${dm1}T17:10:00Z`,
    },
    {
      id: 'seed-006',
      referenceCode: 'PB-SEED-1006',
      visitorName: 'Caleb Kowalski',
      visitorEmail: 'caleb.kowalski@example.org',
      visitorPhone: '+1 555-0115',
      departmentId: 'diagnostics-lab',
      specialistId: 'spec-mensah',
      date: d1,
      startTime: '13:30',
      durationMins: 45,
      priority: 'priority',
      status: 'confirmed',
      protocolNotes: 'Routine thyroid and iron panel follow-up draw.',
      createdAt: `${dm1}T18:00:00Z`,
    },
    {
      id: 'seed-007',
      referenceCode: 'PB-SEED-1007',
      visitorName: 'Noor Al-Mansoor',
      visitorEmail: 'noor.almansoor@example.org',
      visitorPhone: '+1 555-0173',
      departmentId: 'therapy-suite',
      specialistId: 'spec-lindqvist',
      date: d2,
      startTime: '11:00',
      durationMins: 60,
      priority: 'routine',
      status: 'confirmed',
      protocolNotes: 'Ergonomic desk posture session and shoulder recovery drills.',
      createdAt: `${dm1}T18:30:00Z`,
    },
  ];
}
