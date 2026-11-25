# PulseBay — Operations & Booking Console

**PulseBay** is an original, offline-first clinic and operations scheduling console written in **Rust**, paired with an interactive **Companion Web Demo** and a **user-level Windows installer**.

Designed with a playful-yet-crisp clinical console visual system (rounded tactile cards, high-contrast status pills, clear bay/wing indicators, and tabular time slots), PulseBay helps teams manage daily schedules, prevent slot conflicts, and export clean reports without cloud lock-in.

- **Author:** Jean Seenivasagam
- **GitHub:** https://github.com/jeanseenivasagam/
- **LinkedIn:** https://www.linkedin.com/in/jeanseenivasagam/

---

## Key Features

- **Interactive Calendar & Slot Booking:** Browse months, inspect per-day queue indicators, select a clinic wing/department (`General Intake`, `Diagnostics Lab`, `Mobility & Recovery`, `Express Follow-Up`), pick open 30-minute time slots (`08:30 AM`–`05:00 PM`) with live conflict prevention, and receive a tactile confirmation ticket with reference code (`PB-YYYYMMDD-XXXX`).
- **Shift Roster Management:** Filter and search bookings by visitor, reference code, department, status, or date; transition records across `Confirmed → Checked In → Completed` or `Cancelled`; and reschedule bookings with automatic conflict checks.
- **Multi-Format Schedule Exports (`.xlsx`, `.csv`, `.pdf`):**
  - **Excel (`.xlsx`):** Multi-sheet OOXML workbook (`Schedule` + `Summary` sheets with styled cobalt headers, frozen top row, status styling, and KPI/department counts).
  - **CSV (`.csv`):** RFC-4180 CSV with UTF-8 BOM so Microsoft Excel on Windows opens Unicode names cleanly.
  - **PDF (`.pdf`):** Print-ready landscape schedule report with PulseBay banner, 5 KPI status tiles, tabular roster, and automatic multi-page pagination.
- **Local SQLite Persistence (Desktop) & Browser Sandbox (Web Demo):** Desktop stores records locally in `%APPDATA%\PulseBay\pulsebay.db`; the companion web demo runs in the browser with `localStorage` persistence and instant demo reset.

---

## Architecture (Modular Rust Workspace)

```text
pulsebay/
├── Cargo.toml                         # Rust workspace root
├── crates/
│   ├── pulsebay-core/                 # Domain models, slot rules, conflict checks, validation
│   ├── pulsebay-store/                # Embedded SQLite persistence (rusqlite bundled)
│   └── pulsebay-export/               # Native .xlsx (rust_xlsxwriter), .csv, and .pdf exporters
├── apps/
│   ├── web-ui/                        # Shared Two Point-inspired UI + standalone Companion Web Demo
│   └── desktop/
│       └── src-tauri/                 # Tauri v2 native Windows desktop host & NSIS installer config
├── docs/
│   └── INSTALL_WINDOWS.md             # Safe Windows install, SmartScreen & SHA-256 verification guide
└── scripts/
    ├── generate-icons.mjs             # Programmatic PNG + multi-size Windows ICO generator
    └── generate-checksums.ps1         # Deterministic SHA256SUMS.txt generator
```

---

## Local Development & Verification

### 1. Run Rust Workspace Tests
```powershell
cargo test --workspace
```

### 2. Run the Companion Web Demo Locally
```powershell
cd apps/web-ui
npm install
npm run dev
```
Open `http://localhost:5175` to test calendar booking, roster actions, and browser `.xlsx` / `.csv` / `.pdf` downloads.

### 3. Build the Windows Desktop App & Installer
```powershell
cd apps/web-ui
npm run build

cd ../desktop
npm install
npm run tauri:build
```

The user-level Windows installer is generated at:
`apps/desktop/src-tauri/target/release/bundle/nsis/PulseBay_0.1.0_x64-setup.exe`

To generate checksums for release verification:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-checksums.ps1
```

---

## Safe Windows Installation

See [docs/INSTALL_WINDOWS.md](./docs/INSTALL_WINDOWS.md) for transparent installation steps, per-user path details (`%LOCALAPPDATA%\Programs\PulseBay`), uninstaller behavior, and SHA-256 checksum verification for Windows SmartScreen.

---

## License

MIT — see [LICENSE](./LICENSE).
