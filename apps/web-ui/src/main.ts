import './styles/tokens.css';
import './styles/base.css';
import './styles/console.css';

import {
  computeDaySlots,
  DEPARTMENTS,
  formatHumanDate,
  formatSlotLabel,
  getDepartment,
  getSpecialist,
  OPERATING_SLOTS,
  priorityLabel,
  SPECIALISTS,
  statusLabel,
  summarizeBookings,
  toIsoDate,
} from './data/catalog';
import { ICONS } from './lib/icons';
import { applyFilterLocally, PulseBayBackend } from './services/backend';
import type {
  Booking,
  BookingFilter,
  BookingStatus,
  Priority,
  RuntimeInfo,
} from './types';

type ActiveTab = 'calendar' | 'roster' | 'export';
type ExportScope = 'selected-day' | 'current-month' | 'roster-filter' | 'all';

interface AppState {
  runtime: RuntimeInfo;
  activeTab: ActiveTab;
  bookings: Booking[];
  selectedDate: string;
  viewYear: number;
  viewMonth: number; // 0..11
  selectedDepartmentId: string;
  selectedSpecialistId: string;
  selectedSlot: string;
  confirmedBooking: Booking | null;
  formError: string | null;
  rosterFilter: BookingFilter;
  exportScope: ExportScope;
  rescheduleTargetId: string | null;
  toast: { message: string; isError?: boolean } | null;
  aboutOpen: boolean;
}

const todayIso = toIsoDate(new Date());
const nowDate = new Date();

const state: AppState = {
  runtime: {
    mode: 'web-demo',
    version: '0.1.0',
    storageLabel: 'Browser Local Sandbox',
  },
  activeTab: 'calendar',
  bookings: [],
  selectedDate: todayIso,
  viewYear: nowDate.getFullYear(),
  viewMonth: nowDate.getMonth(),
  selectedDepartmentId: DEPARTMENTS[0].id,
  selectedSpecialistId: SPECIALISTS[0].id,
  selectedSlot: '',
  confirmedBooking: null,
  formError: null,
  rosterFilter: {},
  exportScope: 'all',
  rescheduleTargetId: null,
  toast: null,
  aboutOpen: false,
};

let toastTimer: number | null = null;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message: string, isError = false): void {
  state.toast = { message, isError };
  renderToastOnly();
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    renderToastOnly();
  }, 4200);
}

function renderToastOnly(): void {
  const host = document.querySelector<HTMLElement>('[data-toast-host]');
  if (!host) return;
  if (!state.toast) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <div class="toast ${state.toast.isError ? 'toast--error' : ''}" role="status" aria-live="polite">
      ${state.toast.isError ? ICONS.info : ICONS.checkCircle}
      <span>${esc(state.toast.message)}</span>
    </div>
  `;
}

function pickFirstAvailableSlot(): string {
  const slots = computeDaySlots(state.bookings, state.selectedSpecialistId, state.selectedDate);
  const currentStillOpen = slots.find((s) => s.time === state.selectedSlot && s.available);
  if (currentStillOpen) return currentStillOpen.time;
  return slots.find((s) => s.available)?.time ?? '';
}

function getExportScopedBookings(): { bookings: Booking[]; label: string; filter: BookingFilter } {
  if (state.exportScope === 'selected-day') {
    const filter: BookingFilter = {
      dateFrom: state.selectedDate,
      dateTo: state.selectedDate,
    };
    return {
      bookings: applyFilterLocally(state.bookings, filter),
      label: `Day Schedule (${formatHumanDate(state.selectedDate)})`,
      filter,
    };
  }

  if (state.exportScope === 'current-month') {
    const y = state.viewYear;
    const m = String(state.viewMonth + 1).padStart(2, '0');
    const lastDay = new Date(y, state.viewMonth + 1, 0).getDate();
    const filter: BookingFilter = {
      dateFrom: `${y}-${m}-01`,
      dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
    };
    const monthName = new Date(y, state.viewMonth, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    return {
      bookings: applyFilterLocally(state.bookings, filter),
      label: `${monthName} Schedule`,
      filter,
    };
  }

  if (state.exportScope === 'roster-filter') {
    return {
      bookings: applyFilterLocally(state.bookings, state.rosterFilter),
      label: 'Active Roster Filter',
      filter: state.rosterFilter,
    };
  }

  return {
    bookings: applyFilterLocally(state.bookings, {}),
    label: 'All Scheduled Bookings',
    filter: {},
  };
}

function renderTopbar(): string {
  const isDesktop = state.runtime.mode === 'desktop';
  const modePill = isDesktop
    ? `<span class="runtime-pill"><span class="runtime-pill__dot" aria-hidden="true"></span>Desktop · SQLite</span>`
    : `<span class="runtime-pill runtime-pill--demo"><span class="runtime-pill__dot" aria-hidden="true"></span>Web Demo</span>`;

  return `
    <header class="topbar">
      <div class="topbar__inner">
        <div class="brand-lockup">
          <img class="brand-lockup__mark" src="./brand/pulsebay-mark.svg" alt="PulseBay icon" width="42" height="42" />
          <div>
            <div class="brand-lockup__title">
              <span>PulseBay</span>
              ${modePill}
            </div>
            <p class="brand-lockup__sub">Clinic &amp; Operations Scheduling Console</p>
          </div>
        </div>

        <nav class="nav-tabs" role="tablist" aria-label="Primary console views">
          <button
            class="nav-tab"
            type="button"
            role="tab"
            aria-selected="${state.activeTab === 'calendar'}"
            data-nav-tab="calendar"
          >
            ${ICONS.calendar}
            <span>Calendar &amp; Booking</span>
          </button>
          <button
            class="nav-tab"
            type="button"
            role="tab"
            aria-selected="${state.activeTab === 'roster'}"
            data-nav-tab="roster"
          >
            ${ICONS.list}
            <span>Shift Roster</span>
          </button>
          <button
            class="nav-tab"
            type="button"
            role="tab"
            aria-selected="${state.activeTab === 'export'}"
            data-nav-tab="export"
          >
            ${ICONS.download}
            <span>Export Studio</span>
          </button>
        </nav>

        <div class="topbar__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-open-about>
            ${ICONS.info}
            <span>About &amp; Windows App</span>
          </button>
        </div>
      </div>
    </header>
  `;
}

function renderDemoBanner(): string {
  if (state.runtime.mode === 'desktop') return '';
  return `
    <div class="demo-banner">
      <div class="demo-banner__inner">
        <span>
          <strong>Interactive Web Demo:</strong> Browser sandbox with live <code>.xlsx</code>, <code>.csv</code> &amp; <code>.pdf</code> downloads. Run the Windows app for local SQLite storage.
        </span>
        <div class="demo-banner__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-reset-sample>
            ${ICONS.refresh}
            <span>Reset demo data</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderKpiStrip(): string {
  const todayBookings = state.bookings.filter((b) => b.date === todayIso && b.status !== 'cancelled');
  const allStats = summarizeBookings(state.bookings);

  return `
    <section class="kpi-grid" aria-label="Schedule overview metrics">
      <article class="kpi-tile">
        <div>
          <p class="kpi-tile__label">Today's Queue</p>
          <p class="kpi-tile__value tabular">${todayBookings.length}</p>
          <p class="kpi-tile__sub">${formatHumanDate(todayIso)}</p>
        </div>
        <span class="kpi-badge">${ICONS.calendar}</span>
      </article>

      <article class="kpi-tile kpi-tile--teal">
        <div>
          <p class="kpi-tile__label">Confirmed Slots</p>
          <p class="kpi-tile__value tabular">${allStats.confirmed}</p>
          <p class="kpi-tile__sub">${allStats.total} total records</p>
        </div>
        <span class="kpi-badge">${ICONS.checkCircle}</span>
      </article>

      <article class="kpi-tile kpi-tile--amber">
        <div>
          <p class="kpi-tile__label">Checked In Now</p>
          <p class="kpi-tile__value tabular">${allStats.checkedIn}</p>
          <p class="kpi-tile__sub">${allStats.completed} completed</p>
        </div>
        <span class="kpi-badge">${ICONS.clock}</span>
      </article>

      <article class="kpi-tile kpi-tile--coral">
        <div>
          <p class="kpi-tile__label">Urgent Triage</p>
          <p class="kpi-tile__value tabular">${allStats.urgent}</p>
          <p class="kpi-tile__sub">Active priority queue</p>
        </div>
        <span class="kpi-badge">${ICONS.shield}</span>
      </article>
    </section>
  `;
}

function renderMonthCalendar(): string {
  const firstOfMonth = new Date(state.viewYear, state.viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(state.viewYear, state.viewMonth, 1 - startWeekday);
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const activeByDate = new Map<string, number>();
  for (const b of state.bookings) {
    if (b.status === 'cancelled') continue;
    activeByDate.set(b.date, (activeByDate.get(b.date) ?? 0) + 1);
  }

  const cells: string[] = [];
  for (let i = 0; i < 42; i += 1) {
    const dt = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const iso = toIsoDate(dt);
    const inMonth = dt.getMonth() === state.viewMonth;
    const isToday = iso === todayIso;
    const isSelected = iso === state.selectedDate;
    const count = activeByDate.get(iso) ?? 0;

    const classes = [
      'cal-day',
      !inMonth ? 'cal-day--outside' : '',
      isToday ? 'cal-day--today' : '',
      isSelected ? 'cal-day--selected' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const dotCount = Math.min(count, 3);
    const dotsHtml =
      count > 0
        ? `<span class="cal-day__dots" aria-hidden="true">${'<span class="cal-day__dot"></span>'.repeat(
            dotCount
          )}${count > 3 ? `<span class="cal-day__count">+</span>` : ''}</span>`
        : `<span class="cal-day__dots" aria-hidden="true"></span>`;

    cells.push(`
      <button
        type="button"
        class="${classes}"
        data-pick-date="${iso}"
        aria-label="${formatHumanDate(iso)}, ${count} active bookings"
        aria-pressed="${isSelected}"
      >
        <span class="cal-day__num tabular">${dt.getDate()}</span>
        ${dotsHtml}
      </button>
    `);
  }

  return `
    <section class="console-card" aria-label="Interactive date picker">
      <div class="cal-header">
        <h2 class="cal-header__month">${monthLabel}</h2>
        <div class="cal-header__nav">
          <button class="btn btn--secondary btn--sm" type="button" data-cal-prev aria-label="Previous month">
            ${ICONS.chevronLeft}
          </button>
          <button class="btn btn--secondary btn--sm" type="button" data-cal-today>Today</button>
          <button class="btn btn--secondary btn--sm" type="button" data-cal-next aria-label="Next month">
            ${ICONS.chevronRight}
          </button>
        </div>
      </div>

      <div class="cal-weekdays" aria-hidden="true">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>
      <div class="cal-days">${cells.join('')}</div>
    </section>
  `;
}

function renderWingSelector(): string {
  const cards = DEPARTMENTS.map((dept) => {
    const specialist = SPECIALISTS.find((s) => s.departmentId === dept.id) ?? SPECIALISTS[0];
    const active = dept.id === state.selectedDepartmentId;
    return `
      <button
        type="button"
        class="wing-card"
        data-pick-dept="${dept.id}"
        aria-pressed="${active}"
      >
        <div class="wing-card__top">
          <span class="wing-chip wing-chip--${dept.accentToken}">${dept.shortCode}</span>
          <span class="wing-card__room mono">${dept.roomLabel}</span>
        </div>
        <span class="wing-card__name">${esc(dept.name)}</span>
        <span class="wing-card__spec">${esc(specialist.name)}</span>
      </button>
    `;
  }).join('');

  return `
    <section class="console-card" aria-label="Department wing selector">
      <div class="console-card__head">
        <div>
          <h2 class="console-card__title">Department &amp; Bay</h2>
          <p class="console-card__desc">Choose a clinic wing to view its specialist availability.</p>
        </div>
      </div>
      <div class="wing-grid">${cards}</div>
    </section>
  `;
}

function renderSlotPickerAndForm(): string {
  const dept = getDepartment(state.selectedDepartmentId);
  const specialist = getSpecialist(state.selectedSpecialistId);
  const slots = computeDaySlots(state.bookings, state.selectedSpecialistId, state.selectedDate);
  const openCount = slots.filter((s) => s.available).length;

  const slotButtons = slots
    .map((slot) => {
      const isSelected = slot.available && slot.time === state.selectedSlot;
      const cls = [
        'slot-tile',
        !slot.available ? 'slot-tile--booked' : '',
        isSelected ? 'slot-tile--selected' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <button
          type="button"
          class="${cls}"
          data-pick-slot="${slot.time}"
          ${slot.available ? '' : 'disabled'}
          aria-pressed="${isSelected}"
        >
          <span class="slot-tile__time">${slot.label}</span>
          <span class="slot-tile__state">
            ${slot.available ? (isSelected ? 'Selected' : 'Open') : esc(slot.bookedBy ?? 'Booked')}
          </span>
        </button>
      `;
    })
    .join('');

  let bookingPanelHtml: string;
  if (state.confirmedBooking) {
    const b = state.confirmedBooking;
    const bDept = getDepartment(b.departmentId);
    const bSpec = getSpecialist(b.specialistId);
    bookingPanelHtml = `
      <div class="ticket-card" role="status" aria-live="polite">
        <div class="ticket-card__head">
          <div>
            <h3>Booking confirmed</h3>
            <p class="console-card__desc">Saved immediately to ${esc(state.runtime.storageLabel)}.</p>
          </div>
          <span class="ticket-card__ref mono">${esc(b.referenceCode)}</span>
        </div>

        <dl class="ticket-dl">
          <div>
            <dt>Visitor</dt>
            <dd>${esc(b.visitorName)}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>${esc(b.visitorEmail)}</dd>
          </div>
          <div>
            <dt>Date &amp; Time</dt>
            <dd class="tabular">${formatHumanDate(b.date)} · ${formatSlotLabel(b.startTime)} (${b.durationMins} min)</dd>
          </div>
          <div>
            <dt>Department &amp; Specialist</dt>
            <dd>${esc(bDept.name)} (${bDept.roomLabel}) — ${esc(bSpec.name)}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>${priorityLabel(b.priority)}</dd>
          </div>
          <div>
            <dt>Protocol Notes</dt>
            <dd>${esc(b.protocolNotes || 'Standard intake checklist')}</dd>
          </div>
        </dl>

        <div class="ticket-actions">
          <button class="btn btn--teal btn--sm" type="button" data-export-single-pdf="${esc(b.id)}">
            ${ICONS.fileText}
            <span>Export confirmation PDF</span>
          </button>
          <button class="btn btn--primary btn--sm" type="button" data-book-another>
            ${ICONS.plus}
            <span>Book another slot</span>
          </button>
          <button class="btn btn--secondary btn--sm" type="button" data-nav-tab="roster">
            ${ICONS.list}
            <span>View in Shift Roster</span>
          </button>
        </div>
      </div>
    `;
  } else {
    const slotPillText = state.selectedSlot
      ? `${formatHumanDate(state.selectedDate)} · ${formatSlotLabel(state.selectedSlot)}`
      : 'All slots booked for this date';

    bookingPanelHtml = `
      <form data-booking-form novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="visitor-name">Visitor full name</label>
            <input
              id="visitor-name"
              name="visitorName"
              class="input"
              type="text"
              placeholder="e.g. Morgan Patel"
              required
              autocomplete="name"
            />
          </div>

          <div class="field">
            <label for="visitor-email">Confirmation email</label>
            <input
              id="visitor-email"
              name="visitorEmail"
              class="input"
              type="email"
              placeholder="morgan.patel@example.org"
              required
              autocomplete="email"
            />
          </div>

          <div class="field">
            <label for="visitor-phone">Phone (optional)</label>
            <input
              id="visitor-phone"
              name="visitorPhone"
              class="input"
              type="tel"
              placeholder="+1 555-0190"
              autocomplete="tel"
            />
          </div>

          <div class="field">
            <label for="booking-duration">Session length</label>
            <select id="booking-duration" name="durationMins" class="select">
              <option value="30" ${dept.defaultDurationMins === 30 ? 'selected' : ''}>30 minutes</option>
              <option value="45" ${dept.defaultDurationMins === 45 ? 'selected' : ''}>45 minutes</option>
              <option value="60" ${dept.defaultDurationMins === 60 ? 'selected' : ''}>60 minutes</option>
            </select>
          </div>

          <div class="field">
            <label for="booking-priority">Triage priority</label>
            <select id="booking-priority" name="priority" class="select">
              <option value="routine">Routine</option>
              <option value="priority">Priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div class="field">
            <label for="booking-specialist">Assigned specialist</label>
            <select id="booking-specialist" name="specialistId" class="select" data-change-specialist>
              ${SPECIALISTS.map(
                (s) =>
                  `<option value="${s.id}" ${s.id === state.selectedSpecialistId ? 'selected' : ''}>${esc(
                    s.name
                  )} (${s.bayCode})</option>`
              ).join('')}
            </select>
          </div>

          <div class="field field--full">
            <label for="protocol-notes">Protocol checklist or visit notes</label>
            <textarea
              id="protocol-notes"
              name="protocolNotes"
              class="textarea"
              placeholder="List intake focus, diagnostic prep, or room requirements..."
            ></textarea>
          </div>
        </div>

        ${state.formError ? `<div class="form-error" role="alert">${esc(state.formError)}</div>` : ''}

        <div class="form-footer">
          <span class="selected-slot-pill tabular">
            ${ICONS.clock}
            <span>${esc(slotPillText)}</span>
          </span>

          <button
            class="btn btn--primary"
            type="submit"
            ${state.selectedSlot ? '' : 'disabled'}
          >
            ${ICONS.checkCircle}
            <span>Confirm booking</span>
          </button>
        </div>
      </form>
    `;
  }

  return `
    <div class="stack-col">
      <section class="console-card" aria-label="Available time slots">
        <div class="console-card__head">
          <div>
            <h2 class="console-card__title">${formatHumanDate(state.selectedDate)}</h2>
            <p class="console-card__desc">
              ${esc(specialist.name)} (${dept.roomLabel}) · <strong class="tabular">${openCount}</strong> of ${slots.length} slots open
            </p>
          </div>
          <div class="slot-legend" aria-hidden="true">
            <span class="slot-legend__item"><span class="slot-legend__swatch"></span>Open</span>
            <span class="slot-legend__item"><span class="slot-legend__swatch slot-legend__swatch--selected"></span>Selected</span>
            <span class="slot-legend__item"><span class="slot-legend__swatch slot-legend__swatch--booked"></span>Booked</span>
          </div>
        </div>

        <div class="slot-grid">${slotButtons}</div>
      </section>

      <section class="console-card" aria-label="Booking details form">
        <div class="console-card__head">
          <div>
            <h2 class="console-card__title">Booking Intake Console</h2>
            <p class="console-card__desc">${esc(dept.protocolSummary)}</p>
          </div>
          <span class="wing-chip wing-chip--${dept.accentToken}">${esc(dept.name)}</span>
        </div>
        ${bookingPanelHtml}
      </section>
    </div>
  `;
}

function renderCalendarView(): string {
  return `
    <div class="booking-grid">
      <div class="stack-col">
        ${renderMonthCalendar()}
        ${renderWingSelector()}
      </div>
      ${renderSlotPickerAndForm()}
    </div>
  `;
}

function renderRosterView(): string {
  const filtered = applyFilterLocally(state.bookings, state.rosterFilter);

  const rowsHtml =
    filtered.length === 0
      ? `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <h3>No bookings match your current filters</h3>
              <p>Clear filters or switch to Calendar &amp; Booking to schedule a new appointment.</p>
              <button class="btn btn--secondary btn--sm" type="button" data-clear-filters>Reset filters</button>
            </div>
          </td>
        </tr>
      `
      : filtered
          .map((b) => {
            const dept = getDepartment(b.departmentId);
            const spec = getSpecialist(b.specialistId);
            return `
              <tr>
                <td class="mono">${esc(b.referenceCode)}</td>
                <td class="tabular">
                  <strong>${b.date}</strong><br />
                  <span style="color: var(--ink-muted); font-size: 0.82rem;">${formatSlotLabel(b.startTime)} (${b.durationMins}m)</span>
                </td>
                <td>
                  <strong>${esc(b.visitorName)}</strong><br />
                  <span style="color: var(--ink-muted); font-size: 0.82rem;">${esc(b.visitorEmail)}</span>
                </td>
                <td>
                  <span class="wing-chip wing-chip--${dept.accentToken}">${dept.shortCode}</span>
                  <span style="margin-left: 0.35rem; font-weight: 600;">${esc(spec.name)}</span>
                </td>
                <td>
                  <span class="priority-pill priority-pill--${b.priority}">${priorityLabel(b.priority)}</span>
                </td>
                <td>
                  <span class="status-pill status-pill--${b.status}">${statusLabel(b.status)}</span>
                </td>
                <td>
                  <div class="row-actions">
                    ${
                      b.status === 'confirmed'
                        ? `<button class="btn btn--secondary btn--sm" type="button" data-set-status="${esc(b.id)}" data-next-status="checked_in">Check in</button>`
                        : ''
                    }
                    ${
                      b.status === 'checked_in'
                        ? `<button class="btn btn--teal btn--sm" type="button" data-set-status="${esc(b.id)}" data-next-status="completed">Complete</button>`
                        : ''
                    }
                    ${
                      b.status !== 'cancelled' && b.status !== 'completed'
                        ? `<button class="btn btn--secondary btn--sm" type="button" data-open-reschedule="${esc(b.id)}">Reschedule</button>`
                        : ''
                    }
                    ${
                      b.status !== 'cancelled'
                        ? `<button class="btn btn--ghost btn--sm" type="button" data-set-status="${esc(b.id)}" data-next-status="cancelled">Cancel</button>`
                        : `<button class="btn btn--ghost btn--sm" type="button" data-delete-booking="${esc(b.id)}" aria-label="Delete ${esc(b.referenceCode)}">${ICONS.trash}</button>`
                    }
                  </div>
                </td>
              </tr>
            `;
          })
          .join('');

  return `
    <section class="console-card" aria-label="Shift roster filters and records">
      <div class="console-card__head">
        <div>
          <h2 class="console-card__title">Shift Roster</h2>
          <p class="console-card__desc">
            Showing <strong class="tabular">${filtered.length}</strong> of ${state.bookings.length} scheduled records.
          </p>
        </div>
        <div class="topbar__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-reset-sample>
            ${ICONS.refresh}
            <span>Restore samples</span>
          </button>
          <button class="btn btn--primary btn--sm" type="button" data-nav-tab="export">
            ${ICONS.download}
            <span>Export filtered</span>
          </button>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom: 1rem;">
        <div class="field">
          <label for="roster-search">Search visitor, ref, or notes</label>
          <div class="search-wrap">
            ${ICONS.search}
            <input
              id="roster-search"
              class="input"
              type="search"
              placeholder="Search name, email, PB-..."
              value="${esc(state.rosterFilter.searchQuery ?? '')}"
              data-filter-search
            />
          </div>
        </div>

        <div class="field">
          <label for="roster-dept">Department</label>
          <select id="roster-dept" class="select" data-filter-dept>
            <option value="">All departments</option>
            ${DEPARTMENTS.map(
              (d) =>
                `<option value="${d.id}" ${
                  state.rosterFilter.departmentId === d.id ? 'selected' : ''
                }>${esc(d.name)}</option>`
            ).join('')}
          </select>
        </div>

        <div class="field">
          <label for="roster-status">Status</label>
          <select id="roster-status" class="select" data-filter-status>
            <option value="">All statuses</option>
            <option value="confirmed" ${state.rosterFilter.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="checked_in" ${state.rosterFilter.status === 'checked_in' ? 'selected' : ''}>Checked In</option>
            <option value="completed" ${state.rosterFilter.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${state.rosterFilter.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>

        <div class="field">
          <label for="roster-date">From date</label>
          <input
            id="roster-date"
            class="input"
            type="date"
            value="${esc(state.rosterFilter.dateFrom ?? '')}"
            data-filter-date-from
          />
        </div>

        <button class="btn btn--secondary" type="button" data-clear-filters>Clear</button>
      </div>

      <div class="roster-table-wrap">
        <table class="roster-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Date &amp; Time</th>
              <th>Visitor</th>
              <th>Wing &amp; Specialist</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderExportView(): string {
  const scoped = getExportScopedBookings();
  const previewRows = scoped.bookings.slice(0, 6);

  return `
    <div class="stack-col">
      <section class="console-card" aria-label="Export scope selection">
        <div class="console-card__head">
          <div>
            <h2 class="console-card__title">Multi-Format Export Studio</h2>
            <p class="console-card__desc">
              Generate clean, ready-to-share reports in Excel (<code>.xlsx</code>), CSV (<code>.csv</code>), and PDF (<code>.pdf</code>).
            </p>
          </div>
          <span class="selected-slot-pill tabular">${scoped.bookings.length} records selected</span>
        </div>

        <div class="scope-pills" role="group" aria-label="Export date scope">
          <button class="scope-pill" type="button" data-export-scope="all" aria-pressed="${state.exportScope === 'all'}">
            All Records (${state.bookings.length})
          </button>
          <button class="scope-pill" type="button" data-export-scope="selected-day" aria-pressed="${state.exportScope === 'selected-day'}">
            Selected Day (${state.selectedDate})
          </button>
          <button class="scope-pill" type="button" data-export-scope="current-month" aria-pressed="${state.exportScope === 'current-month'}">
            Current Calendar Month
          </button>
          <button class="scope-pill" type="button" data-export-scope="roster-filter" aria-pressed="${state.exportScope === 'roster-filter'}">
            Active Roster Filter
          </button>
        </div>
      </section>

      <section class="export-cards" aria-label="Export formats">
        <article class="export-card">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
              <span class="export-card__badge export-card__badge--xlsx">${ICONS.sheet}</span>
              <div>
                <h3>Excel Workbook (.xlsx)</h3>
                <p class="console-card__desc">Multi-sheet OOXML spreadsheet</p>
              </div>
            </div>
            <ul class="export-card__list">
              <li><strong>Schedule</strong> tab with frozen cobalt header row &amp; formatted columns</li>
              <li><strong>Summary</strong> tab with KPI totals &amp; department counts</li>
              <li>Opens natively in Excel, LibreOffice Calc, and Google Sheets</li>
            </ul>
          </div>
          <button class="btn btn--teal" type="button" data-run-export="xlsx">
            ${ICONS.download}
            <span>Export Excel (.xlsx)</span>
          </button>
        </article>

        <article class="export-card">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
              <span class="export-card__badge export-card__badge--csv">${ICONS.list}</span>
              <div>
                <h3>CSV Spreadsheet (.csv)</h3>
                <p class="console-card__desc">Universal RFC-4180 data export</p>
              </div>
            </div>
            <ul class="export-card__list">
              <li>UTF-8 BOM encoded so Windows Excel renders names cleanly</li>
              <li>Strict quoting for notes containing commas or line breaks</li>
              <li>Ready for BI dashboards, scripts, or database imports</li>
            </ul>
          </div>
          <button class="btn btn--primary" type="button" data-run-export="csv">
            ${ICONS.download}
            <span>Export CSV (.csv)</span>
          </button>
        </article>

        <article class="export-card">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
              <span class="export-card__badge export-card__badge--pdf">${ICONS.fileText}</span>
              <div>
                <h3>PDF Schedule Report (.pdf)</h3>
                <p class="console-card__desc">Print-ready landscape operations brief</p>
              </div>
            </div>
            <ul class="export-card__list">
              <li>PulseBay cobalt banner, scope stamp, and 5 KPI status cards</li>
              <li>Clean tabular roster with automatic multi-page pagination</li>
              <li>Zero external dependencies — generated locally in milliseconds</li>
            </ul>
          </div>
          <button class="btn btn--coral" type="button" data-run-export="pdf">
            ${ICONS.download}
            <span>Export PDF (.pdf)</span>
          </button>
        </article>
      </section>

      <section class="console-card" aria-label="Export preview">
        <div class="console-card__head">
          <div>
            <h3 class="console-card__title">Export Preview — ${esc(scoped.label)}</h3>
            <p class="console-card__desc">
              Showing ${previewRows.length} of ${scoped.bookings.length} records that will be included in the file.
            </p>
          </div>
        </div>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Date &amp; Time</th>
                <th>Visitor</th>
                <th>Department</th>
                <th>Specialist</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                previewRows.length === 0
                  ? `<tr><td colspan="6"><div class="empty-state"><p>No records in this scope.</p></div></td></tr>`
                  : previewRows
                      .map((b) => {
                        const dept = getDepartment(b.departmentId);
                        const spec = getSpecialist(b.specialistId);
                        return `
                          <tr>
                            <td class="mono">${esc(b.referenceCode)}</td>
                            <td class="tabular">${b.date} · ${formatSlotLabel(b.startTime)}</td>
                            <td><strong>${esc(b.visitorName)}</strong></td>
                            <td>${esc(dept.name)} (${dept.roomLabel})</td>
                            <td>${esc(spec.name)}</td>
                            <td><span class="status-pill status-pill--${b.status}">${statusLabel(b.status)}</span></td>
                          </tr>
                        `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderRescheduleModal(): string {
  if (!state.rescheduleTargetId) return '';
  const target = state.bookings.find((b) => b.id === state.rescheduleTargetId);
  if (!target) return '';

  return `
    <dialog class="console-dialog" data-reschedule-dialog aria-label="Reschedule booking">
      <div class="dialog-body">
        <div class="dialog-head">
          <div>
            <h3>Reschedule ${esc(target.referenceCode)}</h3>
            <p class="console-card__desc">${esc(target.visitorName)} — ${esc(getSpecialist(target.specialistId).name)}</p>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" data-close-reschedule aria-label="Close">
            ${ICONS.x}
          </button>
        </div>

        <form data-reschedule-form>
          <div class="form-grid">
            <div class="field">
              <label for="resched-date">New date</label>
              <input id="resched-date" name="newDate" class="input" type="date" value="${esc(target.date)}" required />
            </div>
            <div class="field">
              <label for="resched-slot">New time slot</label>
              <select id="resched-slot" name="newStartTime" class="select">
                ${OPERATING_SLOTS.map(
                  (slot) =>
                    `<option value="${slot}" ${slot === target.startTime ? 'selected' : ''}>${formatSlotLabel(slot)}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <div class="form-footer">
            <button class="btn btn--secondary" type="button" data-close-reschedule>Cancel</button>
            <button class="btn btn--primary" type="submit">Save new time</button>
          </div>
        </form>
      </div>
    </dialog>
  `;
}

function renderAboutModal(): string {
  if (!state.aboutOpen) return '';
  return `
    <dialog class="console-dialog" data-about-dialog aria-label="About PulseBay">
      <div class="dialog-body">
        <div class="dialog-head">
          <div class="brand-lockup">
            <img class="brand-lockup__mark" src="./brand/pulsebay-mark.svg" alt="PulseBay icon" width="38" height="38" />
            <div>
              <h3>PulseBay v${esc(state.runtime.version)}</h3>
              <p class="console-card__desc">Original Rust Desktop App &amp; Companion Web Demo</p>
            </div>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" data-close-about aria-label="Close">
            ${ICONS.x}
          </button>
        </div>

        <p style="font-size: 0.92rem; color: var(--ink-secondary);">
          PulseBay is a ground-up Rust application built with modular Cargo crates
          (<code>pulsebay-core</code>, <code>pulsebay-store</code> with embedded SQLite, and
          <code>pulsebay-export</code> for native <code>.xlsx</code>, <code>.csv</code>, and <code>.pdf</code> files)
          paired with a playful-clinical console UI.
        </p>

        <div class="console-card" style="box-shadow: none; background: var(--surface-well); padding: 0.85rem;">
          <h4 style="font-size: 0.95rem; margin-bottom: 0.35rem;">Safe Windows Installation</h4>
          <p style="font-size: 0.84rem; color: var(--ink-secondary);">
            The Windows installer installs cleanly per-user into <code>%LOCALAPPDATA%\\Programs\\PulseBay</code>
            with no admin elevation required, zero background services, a standard Settings → Apps uninstaller,
            and published SHA-256 checksums.
          </p>
          ${
            state.runtime.dbPath
              ? `<p style="font-size: 0.8rem; color: var(--ink-muted); margin-top: 0.45rem;">Active SQLite database: <code>${esc(
                  state.runtime.dbPath
                )}</code></p>`
              : ''
          }
        </div>

        <div class="profile-links">
          <a
            class="btn btn--primary btn--sm"
            href="https://github.com/jeanseenivasagam/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${ICONS.external}
            <span>GitHub — jeanseenivasagam</span>
          </a>
          <a
            class="btn btn--secondary btn--sm"
            href="https://www.linkedin.com/in/jeanseenivasagam/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${ICONS.external}
            <span>LinkedIn — Jean Seenivasagam</span>
          </a>
        </div>
      </div>
    </dialog>
  `;
}

function renderFooter(): string {
  return `
    <footer class="app-footer">
      <div class="app-footer__inner">
        <span>
          <strong>PulseBay</strong> v${esc(state.runtime.version)} · Built from scratch in Rust &amp; TypeScript by
          <strong>Jean Seenivasagam</strong>
        </span>
        <div class="app-footer__links">
          <a href="https://github.com/jeanseenivasagam/" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="https://www.linkedin.com/in/jeanseenivasagam/" target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  `;
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;

  const activeContent =
    state.activeTab === 'calendar'
      ? renderCalendarView()
      : state.activeTab === 'roster'
      ? renderRosterView()
      : renderExportView();

  root.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      ${renderDemoBanner()}
      <main class="console-main">
        ${renderKpiStrip()}
        ${activeContent}
      </main>
      ${renderFooter()}
      ${renderRescheduleModal()}
      ${renderAboutModal()}
      <div data-toast-host></div>
    </div>
  `;

  renderToastOnly();
  bindEvents(root);
}

function bindEvents(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-nav-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.navTab as ActiveTab | undefined;
      if (!tab) return;
      state.activeTab = tab;
      render();
    });
  });

  root.querySelector<HTMLElement>('[data-cal-prev]')?.addEventListener('click', () => {
    if (state.viewMonth === 0) {
      state.viewMonth = 11;
      state.viewYear -= 1;
    } else {
      state.viewMonth -= 1;
    }
    render();
  });

  root.querySelector<HTMLElement>('[data-cal-next]')?.addEventListener('click', () => {
    if (state.viewMonth === 11) {
      state.viewMonth = 0;
      state.viewYear += 1;
    } else {
      state.viewMonth += 1;
    }
    render();
  });

  root.querySelector<HTMLElement>('[data-cal-today]')?.addEventListener('click', () => {
    const today = new Date();
    state.selectedDate = toIsoDate(today);
    state.viewYear = today.getFullYear();
    state.viewMonth = today.getMonth();
    state.confirmedBooking = null;
    state.selectedSlot = pickFirstAvailableSlot();
    render();
  });

  root.querySelectorAll<HTMLElement>('[data-pick-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = btn.dataset.pickDate;
      if (!iso) return;
      state.selectedDate = iso;
      const [y, m] = iso.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m)) {
        state.viewYear = y;
        state.viewMonth = m - 1;
      }
      state.confirmedBooking = null;
      state.formError = null;
      state.selectedSlot = pickFirstAvailableSlot();
      render();
    });
  });

  root.querySelectorAll<HTMLElement>('[data-pick-dept]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deptId = btn.dataset.pickDept;
      if (!deptId) return;
      state.selectedDepartmentId = deptId;
      const matchedSpec = SPECIALISTS.find((s) => s.departmentId === deptId);
      if (matchedSpec) {
        state.selectedSpecialistId = matchedSpec.id;
      }
      state.confirmedBooking = null;
      state.formError = null;
      state.selectedSlot = pickFirstAvailableSlot();
      render();
    });
  });

  root.querySelector<HTMLSelectElement>('[data-change-specialist]')?.addEventListener('change', (e) => {
    const specId = (e.currentTarget as HTMLSelectElement).value;
    state.selectedSpecialistId = specId;
    const spec = SPECIALISTS.find((s) => s.id === specId);
    if (spec) state.selectedDepartmentId = spec.departmentId;
    state.selectedSlot = pickFirstAvailableSlot();
    render();
  });

  root.querySelectorAll<HTMLElement>('[data-pick-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = btn.dataset.pickSlot;
      if (!slot) return;
      state.selectedSlot = slot;
      state.confirmedBooking = null;
      state.formError = null;
      render();
    });
  });

  root.querySelector<HTMLFormElement>('[data-booking-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const visitorName = String(fd.get('visitorName') ?? '').trim();
    const visitorEmail = String(fd.get('visitorEmail') ?? '').trim();
    const visitorPhone = String(fd.get('visitorPhone') ?? '').trim();
    const durationMins = Number(fd.get('durationMins') ?? 30);
    const priority = (String(fd.get('priority') ?? 'routine') as Priority) || 'routine';
    const specialistId = String(fd.get('specialistId') ?? state.selectedSpecialistId);
    const protocolNotes = String(fd.get('protocolNotes') ?? '').trim();

    if (!state.selectedSlot) {
      state.formError = 'Select an open time slot above before confirming.';
      render();
      return;
    }

    try {
      const created = await PulseBayBackend.createBooking({
        visitorName,
        visitorEmail,
        visitorPhone,
        departmentId: state.selectedDepartmentId,
        specialistId,
        date: state.selectedDate,
        startTime: state.selectedSlot,
        durationMins,
        priority,
        protocolNotes,
      });
      state.bookings = await PulseBayBackend.listBookings();
      state.confirmedBooking = created;
      state.formError = null;
      state.selectedSlot = pickFirstAvailableSlot();
      render();
      showToast(`Confirmed ${created.referenceCode} for ${created.visitorName}.`);
    } catch (err) {
      state.formError = err instanceof Error ? err.message : String(err);
      render();
    }
  });

  root.querySelector<HTMLElement>('[data-book-another]')?.addEventListener('click', () => {
    state.confirmedBooking = null;
    state.formError = null;
    state.selectedSlot = pickFirstAvailableSlot();
    render();
  });

  root.querySelector<HTMLElement>('[data-export-single-pdf]')?.addEventListener('click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.exportSinglePdf;
    const booking = state.bookings.find((b) => b.id === id);
    if (!booking) return;
    try {
      const res = await PulseBayBackend.exportSchedule(
        'pdf',
        [booking],
        `Confirmation ${booking.referenceCode}`,
        { searchQuery: booking.referenceCode }
      );
      if (res) {
        showToast(
          res.savedPath
            ? `Saved confirmation PDF to ${res.savedPath}`
            : `Downloaded ${res.filename} (${res.bytesWritten.toLocaleString()} bytes)`
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  });

  // Roster filters
  root.querySelector<HTMLInputElement>('[data-filter-search]')?.addEventListener('input', (e) => {
    const el = e.currentTarget as HTMLInputElement;
    const pos = el.selectionStart;
    state.rosterFilter.searchQuery = el.value || undefined;
    render();
    const fresh = document.querySelector<HTMLInputElement>('[data-filter-search]');
    if (fresh) {
      fresh.focus();
      if (pos !== null) fresh.setSelectionRange(pos, pos);
    }
  });

  root.querySelector<HTMLSelectElement>('[data-filter-dept]')?.addEventListener('change', (e) => {
    const val = (e.currentTarget as HTMLSelectElement).value;
    state.rosterFilter.departmentId = val || undefined;
    render();
  });

  root.querySelector<HTMLSelectElement>('[data-filter-status]')?.addEventListener('change', (e) => {
    const val = (e.currentTarget as HTMLSelectElement).value as BookingStatus | '';
    state.rosterFilter.status = val || undefined;
    render();
  });

  root.querySelector<HTMLInputElement>('[data-filter-date-from]')?.addEventListener('change', (e) => {
    const val = (e.currentTarget as HTMLInputElement).value;
    state.rosterFilter.dateFrom = val || undefined;
    render();
  });

  root.querySelectorAll<HTMLElement>('[data-clear-filters]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rosterFilter = {};
      render();
    });
  });

  // Roster status updates & delete
  root.querySelectorAll<HTMLElement>('[data-set-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.setStatus;
      const next = btn.dataset.nextStatus as BookingStatus | undefined;
      if (!id || !next) return;
      try {
        await PulseBayBackend.updateBookingStatus(id, next);
        state.bookings = await PulseBayBackend.listBookings();
        state.selectedSlot = pickFirstAvailableSlot();
        render();
        showToast(`Status updated to ${statusLabel(next)}.`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), true);
      }
    });
  });

  root.querySelectorAll<HTMLElement>('[data-delete-booking]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteBooking;
      if (!id) return;
      try {
        await PulseBayBackend.deleteBooking(id);
        state.bookings = await PulseBayBackend.listBookings();
        render();
        showToast('Booking permanently deleted.');
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), true);
      }
    });
  });

  root.querySelectorAll<HTMLElement>('[data-open-reschedule]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rescheduleTargetId = btn.dataset.openReschedule ?? null;
      render();
    });
  });

  root.querySelectorAll<HTMLElement>('[data-close-reschedule]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.rescheduleTargetId = null;
      render();
    });
  });

  root.querySelector<HTMLFormElement>('[data-reschedule-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.rescheduleTargetId) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const newDate = String(fd.get('newDate') ?? '');
    const newStartTime = String(fd.get('newStartTime') ?? '');
    try {
      await PulseBayBackend.rescheduleBooking(state.rescheduleTargetId, newDate, newStartTime);
      state.bookings = await PulseBayBackend.listBookings();
      state.rescheduleTargetId = null;
      state.selectedSlot = pickFirstAvailableSlot();
      render();
      showToast(`Rescheduled to ${formatHumanDate(newDate)} at ${formatSlotLabel(newStartTime)}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  });

  // Export Studio
  root.querySelectorAll<HTMLElement>('[data-export-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scope = btn.dataset.exportScope as ExportScope | undefined;
      if (!scope) return;
      state.exportScope = scope;
      render();
    });
  });

  root.querySelectorAll<HTMLElement>('[data-run-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fmt = btn.dataset.runExport as 'xlsx' | 'csv' | 'pdf' | undefined;
      if (!fmt) return;
      const scoped = getExportScopedBookings();
      try {
        const res = await PulseBayBackend.exportSchedule(fmt, scoped.bookings, scoped.label, scoped.filter);
        if (!res) return; // User cancelled native Save-As dialog
        showToast(
          res.savedPath
            ? `Exported ${res.recordCount} records to ${res.savedPath}`
            : `Downloaded ${res.filename} (${res.recordCount} records)`
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), true);
      }
    });
  });

  // Sample data reset & About modal
  root.querySelectorAll<HTMLElement>('[data-reset-sample]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        state.bookings = await PulseBayBackend.resetSampleData();
        state.confirmedBooking = null;
        state.selectedSlot = pickFirstAvailableSlot();
        render();
        showToast('Sample schedule restored around today.');
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), true);
      }
    });
  });

  root.querySelector<HTMLElement>('[data-open-about]')?.addEventListener('click', () => {
    state.aboutOpen = true;
    render();
  });

  root.querySelector<HTMLElement>('[data-close-about]')?.addEventListener('click', () => {
    state.aboutOpen = false;
    render();
  });

  // Mount native Top-Layer modal dialogs so Escape, backdrop click, and z-index work flawlessly
  const aboutDlg = root.querySelector<HTMLDialogElement>('[data-about-dialog]');
  if (aboutDlg && !aboutDlg.open) {
    aboutDlg.showModal();
    aboutDlg.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      state.aboutOpen = false;
      render();
    });
    aboutDlg.addEventListener('click', (ev) => {
      if (ev.target === aboutDlg) {
        state.aboutOpen = false;
        render();
      }
    });
  }

  const reschedDlg = root.querySelector<HTMLDialogElement>('[data-reschedule-dialog]');
  if (reschedDlg && !reschedDlg.open) {
    reschedDlg.showModal();
    reschedDlg.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      state.rescheduleTargetId = null;
      render();
    });
    reschedDlg.addEventListener('click', (ev) => {
      if (ev.target === reschedDlg) {
        state.rescheduleTargetId = null;
        render();
      }
    });
  }
}

async function bootstrap(): Promise<void> {
  try {
    state.runtime = await PulseBayBackend.getRuntimeInfo();
    state.bookings = await PulseBayBackend.listBookings();
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Failed to load bookings.', true);
  }
  state.selectedSlot = pickFirstAvailableSlot();
  render();
}

void bootstrap();
