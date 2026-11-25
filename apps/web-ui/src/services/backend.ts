import {
  buildSampleBookings,
  DEPARTMENTS,
  OPERATING_SLOTS,
  SPECIALISTS,
} from '../data/catalog';
import { exportInBrowser } from '../lib/browserExport';
import type {
  Booking,
  BookingFilter,
  BookingStatus,
  ExportResult,
  NewBookingInput,
  RuntimeInfo,
} from '../types';

const STORAGE_KEY = 'pulsebay.bookings.v1';

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.__TAURI_INTERNALS__?.invoke === 'function';
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('Desktop IPC runtime is unavailable.');
  }
  return window.__TAURI_INTERNALS__.invoke<T>(cmd, args);
}

function readBrowserBookings(): Booking[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = buildSampleBookings();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as Booking[];
    }
  } catch {
    // Fall back to fresh sample data if storage is unavailable or corrupted
  }
  return buildSampleBookings();
}

function writeBrowserBookings(bookings: Booking[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  } catch {
    // Ignore quota errors in private browsing mode
  }
}

function sortBookings(list: Booking[]): Booking[] {
  return [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.referenceCode.localeCompare(b.referenceCode)
  );
}

export function applyFilterLocally(bookings: readonly Booking[], filter: BookingFilter): Booking[] {
  const query = filter.searchQuery?.trim().toLowerCase() ?? '';
  return sortBookings(
    bookings.filter((b) => {
      if (filter.dateFrom && b.date < filter.dateFrom) return false;
      if (filter.dateTo && b.date > filter.dateTo) return false;
      if (filter.departmentId && b.departmentId !== filter.departmentId) return false;
      if (filter.specialistId && b.specialistId !== filter.specialistId) return false;
      if (filter.status && b.status !== filter.status) return false;
      if (query) {
        const hay = `${b.referenceCode} ${b.visitorName} ${b.visitorEmail} ${b.protocolNotes} ${b.date}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
  );
}

export const PulseBayBackend = {
  async getRuntimeInfo(): Promise<RuntimeInfo> {
    if (isDesktopRuntime()) {
      return tauriInvoke<RuntimeInfo>('get_runtime_info');
    }
    return {
      mode: 'web-demo',
      version: '1.0.0',
      storageLabel: 'Browser Local Sandbox',
    };
  },

  async listBookings(filter: BookingFilter = {}): Promise<Booking[]> {
    if (isDesktopRuntime()) {
      return tauriInvoke<Booking[]>('list_bookings', { filter });
    }
    return applyFilterLocally(readBrowserBookings(), filter);
  },

  async createBooking(input: NewBookingInput): Promise<Booking> {
    if (isDesktopRuntime()) {
      return tauriInvoke<Booking>('create_booking', { input });
    }

    const name = input.visitorName.trim();
    const email = input.visitorEmail.trim();
    if (name.length < 2) {
      throw new Error('Visitor name must be at least 2 characters long.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid email address for the booking confirmation.');
    }
    if (!OPERATING_SLOTS.includes(input.startTime)) {
      throw new Error(`Time slot ${input.startTime} is outside operating hours.`);
    }
    if (!DEPARTMENTS.some((d) => d.id === input.departmentId)) {
      throw new Error('Select a valid department.');
    }
    const specialist = SPECIALISTS.find((s) => s.id === input.specialistId);
    if (!specialist) {
      throw new Error('Select a valid specialist.');
    }

    const existing = readBrowserBookings();
    const conflict = existing.some(
      (b) =>
        b.status !== 'cancelled' &&
        b.specialistId === input.specialistId &&
        b.date === input.date &&
        b.startTime === input.startTime
    );
    if (conflict) {
      throw new Error(`${specialist.name} is already booked on ${input.date} at ${input.startTime}.`);
    }

    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    const booking: Booking = {
      id: `web-${Date.now()}-${rand}`,
      referenceCode: `PB-${input.date.replace(/-/g, '')}-${rand}`,
      visitorName: name,
      visitorEmail: email,
      visitorPhone: input.visitorPhone.trim(),
      departmentId: input.departmentId,
      specialistId: input.specialistId,
      date: input.date,
      startTime: input.startTime,
      durationMins: input.durationMins,
      priority: input.priority,
      status: 'confirmed',
      protocolNotes: input.protocolNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    const next = sortBookings([...existing, booking]);
    writeBrowserBookings(next);
    return booking;
  },

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
    if (isDesktopRuntime()) {
      return tauriInvoke<Booking>('update_booking_status', { id, status });
    }
    const list = readBrowserBookings();
    const target = list.find((b) => b.id === id);
    if (!target) throw new Error('Booking not found.');
    target.status = status;
    writeBrowserBookings(list);
    return target;
  },

  async updateBookingNotes(id: string, protocolNotes: string): Promise<Booking> {
    if (isDesktopRuntime()) {
      return tauriInvoke<Booking>('update_booking_notes', {
        id,
        protocolNotes,
      });
    }
    const list = readBrowserBookings();
    const target = list.find((b) => b.id === id);
    if (!target) throw new Error('Booking not found.');
    target.protocolNotes = protocolNotes.trim();
    writeBrowserBookings(list);
    return target;
  },

  async rescheduleBooking(id: string, newDate: string, newStartTime: string): Promise<Booking> {
    if (isDesktopRuntime()) {
      return tauriInvoke<Booking>('reschedule_booking', {
        id,
        newDate,
        newStartTime,
      });
    }
    const list = readBrowserBookings();
    const target = list.find((b) => b.id === id);
    if (!target) throw new Error('Booking not found.');
    const conflict = list.some(
      (b) =>
        b.id !== id &&
        b.status !== 'cancelled' &&
        b.specialistId === target.specialistId &&
        b.date === newDate &&
        b.startTime === newStartTime
    );
    if (conflict) {
      throw new Error(`That slot (${newDate} at ${newStartTime}) is already taken.`);
    }
    target.date = newDate;
    target.startTime = newStartTime;
    target.status = 'confirmed';
    writeBrowserBookings(sortBookings(list));
    return target;
  },

  async deleteBooking(id: string): Promise<void> {
    if (isDesktopRuntime()) {
      await tauriInvoke<void>('delete_booking', { id });
      return;
    }
    const list = readBrowserBookings().filter((b) => b.id !== id);
    writeBrowserBookings(list);
  },

  async resetSampleData(): Promise<Booking[]> {
    if (isDesktopRuntime()) {
      return tauriInvoke<Booking[]>('reset_sample_data');
    }
    const fresh = buildSampleBookings();
    writeBrowserBookings(fresh);
    return fresh;
  },

  async clearAllBookings(): Promise<void> {
    if (isDesktopRuntime()) {
      await tauriInvoke<void>('clear_all_bookings');
      return;
    }
    writeBrowserBookings([]);
  },

  async exportSchedule(
    format: 'xlsx' | 'csv' | 'pdf',
    bookings: readonly Booking[],
    scopeLabel: string,
    filter: BookingFilter
  ): Promise<ExportResult | null> {
    if (isDesktopRuntime()) {
      return tauriInvoke<ExportResult | null>('export_schedule', {
        format,
        scopeLabel,
        filter,
      });
    }
    return exportInBrowser(format, bookings, scopeLabel);
  },
};
