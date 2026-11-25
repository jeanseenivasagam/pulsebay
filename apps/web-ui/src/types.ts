export type Priority = 'routine' | 'priority' | 'urgent';

export type BookingStatus = 'confirmed' | 'checked_in' | 'completed' | 'cancelled';

export interface Department {
  id: string;
  name: string;
  shortCode: string;
  roomLabel: string;
  protocolSummary: string;
  defaultDurationMins: number;
  accentToken: 'cobalt' | 'teal' | 'amber' | 'coral';
}

export interface Specialist {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  bayCode: string;
  statusNote: string;
}

export interface Booking {
  id: string;
  referenceCode: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  departmentId: string;
  specialistId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMins: number;
  priority: Priority;
  status: BookingStatus;
  protocolNotes: string;
  createdAt: string;
}

export interface NewBookingInput {
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  departmentId: string;
  specialistId: string;
  date: string;
  startTime: string;
  durationMins: number;
  priority: Priority;
  protocolNotes: string;
}

export interface BookingFilter {
  dateFrom?: string;
  dateTo?: string;
  departmentId?: string;
  specialistId?: string;
  status?: BookingStatus;
  searchQuery?: string;
}

export interface SlotAvailability {
  time: string;
  label: string;
  available: boolean;
  bookedBy?: string;
  bookingId?: string;
}

export interface ScheduleSummary {
  total: number;
  confirmed: number;
  checkedIn: number;
  completed: number;
  cancelled: number;
  urgent: number;
}

export interface ExportResult {
  format: 'xlsx' | 'csv' | 'pdf';
  filename: string;
  savedPath?: string;
  bytesWritten: number;
  recordCount: number;
}

export interface RuntimeInfo {
  mode: 'desktop' | 'web-demo';
  version: string;
  storageLabel: string;
  dbPath?: string;
}
