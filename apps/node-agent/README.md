# JARVIS Node Agent (placeholder)

The "hands" — a **Tauri** (Rust + TypeScript) app compiled for macOS and
Windows. Each machine runs one instance that connects **outbound** to
Supabase Realtime (no open ports), executes the allowlisted command set
from `@jarvis/shared`, and reports results + heartbeats back to the brain.

**Not built yet — scheduled for Days 14-17** (Windows first, then macOS).
This folder is reserved so the monorepo layout is stable.

## When we build it
- `cargo` / Rust toolchain required (not yet installed on this machine)
- `npm create tauri-app` inside this folder, wired to `@jarvis/shared`
  for the command/result protocol
- Rust side: Realtime client, command executor, OS keychain for the
  device key, autostart-on-boot, auto-reconnect, Wake-on-LAN sender
- TS side: tiny tray/status UI + first-run permission setup
  (macOS Accessibility + Screen Recording; Windows service + UAC)

See section 6 + 7 of the project spec for the full command set and
security model.
