/**
 * Shared message protocol between the brain (apps/web) and the node
 * agents (apps/node-agent), carried over Supabase Realtime channels.
 *
 * Types only — no logic. Both sides import from "@jarvis/shared" so a
 * command shape can never drift between the dispatcher and the executor.
 */

export type NodeOS = "macos" | "windows";

/** Allowlisted command set (section 6). No freeform shell by default. */
export type DeviceCommandType =
  | "open_app"
  | "close_app"
  | "open_url"
  | "lock"
  | "sleep"
  | "restart"
  | "shutdown"
  | "volume"
  | "media" // play / pause / next / prev
  | "brightness"
  | "screenshot"
  | "find_file"
  | "status" // CPU, RAM, battery, storage, running apps
  | "run_routine"
  | "wake_on_lan";

/** A command dispatched to one device (friendly name) or "all". */
export interface DeviceCommand {
  id: string;
  device: string; // friendly name ("ROG", "MacBook", "HP", "Samsung") or "all"
  type: DeviceCommandType;
  args?: Record<string, unknown>;
  /** Confirmation gate is decided by the brain, enforced on the phone. */
  requiresConfirmation: boolean;
  issuedAt: string; // ISO
}

/** Result returned by a node after executing (or refusing) a command. */
export interface DeviceResult {
  commandId: string;
  device: string;
  status: "done" | "error" | "denied";
  data?: unknown;
  error?: string;
  completedAt: string; // ISO
}

/** Periodic presence + telemetry a node pushes so the brain knows it's alive. */
export interface DeviceHeartbeat {
  device: string;
  os: NodeOS;
  online: true;
  battery?: number;
  capabilities: DeviceCommandType[];
  sentAt: string; // ISO
}

/** Kill switch broadcast — every node disables remote control on receipt. */
export interface KillSwitch {
  type: "kill_switch";
  issuedAt: string;
}
