# Installing & Upgrading PulseBay Safely on Windows

PulseBay is packaged as a clean, transparent, **per-user Windows application** with zero hidden background services, zero telemetry, safe in-place upgrades, and no administrator privileges required.

---

## 1. What the Installer Does (Full Transparency)

| Property | Behavior |
| :--- | :--- |
| **Installer File** | `PulseBay_<version>_x64-setup.exe` (e.g. `PulseBay_0.1.1_x64-setup.exe`, NSIS user-level installer) |
| **Install Directory** | `%LOCALAPPDATA%\PulseBay` (no UAC admin prompt required) |
| **Persistent User Data** | `%APPDATA%\io.jeanseenivasagam.pulsebay\pulsebay.db` (embedded SQLite database — outside the install folder) |
| **Registry Identity** | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\PulseBay` (single consistent entry across all versions) |
| **Shortcuts** | Adds a Start Menu entry (`PulseBay`) and optional Desktop shortcut |
| **Background Services** | **None.** PulseBay only runs while its window is open. |
| **Outbound Network Calls** | **None** for data storage or exports. All scheduling and `.xlsx`/`.csv`/`.pdf` exports execute 100% locally. |
| **Uninstaller** | Standard Windows entry under **Settings → Apps → Installed apps → PulseBay → Uninstall** |

---

## 2. Upgrading an Existing Installation

You do **not** need to manually uninstall PulseBay before installing a newer version:

1. Download the newer `PulseBay_<version>_x64-setup.exe` and verify its SHA-256 hash against `SHA256SUMS.txt`.
2. Double-click the newer installer. It automatically detects your existing PulseBay installation via `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\PulseBay` and restores your existing install path (`%LOCALAPPDATA%\PulseBay`).
3. **If PulseBay is currently open:** The installer uses Windows Restart Manager to detect `pulsebay-desktop.exe` and prompts you to close it cleanly before replacing the executable.
4. **Your data is preserved 100%:** Bookings, Shift Roster statuses, Protocol Checklists, and Visit Notes stored in `%APPDATA%\io.jeanseenivasagam.pulsebay\pulsebay.db` are **never deleted or overwritten during upgrades** (and `v0.1.1+` automatically migrates databases created by early `0.1.0` local builds).
5. **Verify the updated version:** Once finished, check the updated version badge in the app footer / **About & Windows App** modal (`PulseBay v0.1.1`) and in **Windows Settings → Apps → Installed apps** (single updated entry — zero duplicates).

*(Accidental silent downgrades are blocked automatically via `allowDowngrades: false`.)*

---

## 3. Verifying the Download Checksum (SHA-256)

Before running the installer, verify its integrity against the published `SHA256SUMS.txt` file using PowerShell:

```powershell
Get-FileHash .\PulseBay_0.1.1_x64-setup.exe -Algorithm SHA256
```

Compare the printed `Hash` value (case-insensitive) with the matching line in `SHA256SUMS.txt`. They must match character for character.

---

## 4. About Windows Defender SmartScreen

Because PulseBay is an independent open-source release built without a commercial EV code-signing certificate, Windows Defender SmartScreen may display a blue prompt on first run saying **"Windows protected your PC"**.

This warning means the binary is new and unsigned — not that it contains malware. After confirming the SHA-256 hash matches (or building directly from source with `cargo`):

1. Click **More info** in the SmartScreen prompt.
2. Verify the file name matches `PulseBay_<version>_x64-setup.exe`.
3. Click **Run anyway** to start the guided user-level installer.

Prefer zero installer steps? Download `PulseBay_<version>_x64-portable.zip`, extract both `pulsebay-desktop.exe` and `WebView2Loader.dll` into the same folder, and double-click `pulsebay-desktop.exe` (keeping `WebView2Loader.dll` beside the executable is required by Windows WebView2 on the GNU toolchain). You can also compile from source directly with `cargo`.

---

## 5. Clean Uninstall

1. Open **Windows Settings → Apps → Installed apps**.
2. Search for **PulseBay** and select **Uninstall**.
3. The uninstaller cleanly removes `%LOCALAPPDATA%\PulseBay` and Start Menu shortcuts.
4. **Optional Data Removal:** By default, your bookings database in `%APPDATA%\io.jeanseenivasagam.pulsebay\` is kept safe in case you reinstall later. Tick **"Delete app data"** on the uninstall confirmation screen only if you want your local SQLite database removed as well.

---

Built by **Jean Seenivasagam** — [GitHub](https://github.com/jeanseenivasagam/) · [LinkedIn](https://www.linkedin.com/in/jeanseenivasagam/)
