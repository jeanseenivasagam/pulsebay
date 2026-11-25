# Installing PulseBay Safely on Windows

PulseBay is packaged as a clean, transparent, **per-user Windows application** with zero hidden background services, zero telemetry, and no administrator privileges required.

---

## 1. What the Installer Does (Full Transparency)

| Property | Behavior |
| :--- | :--- |
| **Installer File** | `PulseBay_0.1.0_x64-setup.exe` (NSIS user-level installer) |
| **Install Directory** | `%LOCALAPPDATA%\Programs\PulseBay` (no UAC admin prompt required) |
| **Local Data Directory** | `%APPDATA%\PulseBay\pulsebay.db` (embedded SQLite database) |
| **Shortcuts** | Adds a Start Menu entry (`PulseBay`) and optional Desktop shortcut |
| **Background Services** | **None.** PulseBay only runs while its window is open. |
| **Outbound Network Calls** | **None** for data storage or exports. All scheduling and `.xlsx`/`.csv`/`.pdf` exports execute 100% locally. |
| **Uninstaller** | Standard Windows entry under **Settings → Apps → Installed apps → PulseBay → Uninstall** |

---

## 2. Verifying the Download Checksum (SHA-256)

Before running the installer, verify its integrity against the published `SHA256SUMS.txt` file using PowerShell:

```powershell
Get-FileHash .\PulseBay_0.1.0_x64-setup.exe -Algorithm SHA256
```

Compare the printed `Hash` value (case-insensitive) with the matching line in `SHA256SUMS.txt`. They must match character for character.

---

## 3. About Windows Defender SmartScreen

Because PulseBay is an independent open-source release built without a commercial EV code-signing certificate, Windows Defender SmartScreen may display a blue prompt on first run saying **"Windows protected your PC"**.

This warning means the binary is new and unsigned — not that it contains malware. After confirming the SHA-256 hash matches (or building directly from source with `cargo`):

1. Click **More info** in the SmartScreen prompt.
2. Verify the file name is `PulseBay_0.1.0_x64-setup.exe`.
3. Click **Run anyway** to start the guided user-level installer.

Prefer zero installer steps? Download `PulseBay_0.1.0_x64-portable.zip`, extract both `pulsebay-desktop.exe` and `WebView2Loader.dll` into the same folder, and double-click `pulsebay-desktop.exe` (keeping `WebView2Loader.dll` beside the executable is required by Windows WebView2 on the GNU toolchain). You can also compile from source directly with `cargo`.

---

## 4. First-Run Experience

1. Launch **PulseBay** from the Start Menu.
2. PulseBay automatically creates its local SQLite database at `%APPDATA%\PulseBay\pulsebay.db` and seeds 7 sample bookings anchored around today so you can explore the calendar immediately.
3. Ready for real schedules? Open **Shift Roster** or create new bookings directly in **Calendar & Booking**, and export your schedule anytime via **Export Studio** (`.xlsx`, `.csv`, or `.pdf`).

---

## 5. Clean Uninstall

1. Open **Windows Settings → Apps → Installed apps**.
2. Search for **PulseBay** and select **Uninstall**.
3. The uninstaller cleanly removes `%LOCALAPPDATA%\Programs\PulseBay` and Start Menu shortcuts.
4. *(Optional)* To also remove your local SQLite database, delete `%APPDATA%\PulseBay\`.

---

Built by **Jean Seenivasagam** — [GitHub](https://github.com/jeanseenivasagam/) · [LinkedIn](https://www.linkedin.com/in/jeanseenivasagam/)
