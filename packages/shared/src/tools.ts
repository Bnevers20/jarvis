/**
 * The brain's Claude tool registry — names + which ones are irreversible.
 * Concrete JSON schemas and handlers live in apps/web/src/lib/tools/.
 */

export type ToolName =
  // memory
  | "memory_remember"
  | "memory_forget"
  // productivity
  | "calendar_read"
  | "calendar_create"
  | "gmail_read"
  | "gmail_draft"
  | "gmail_send"
  | "task_list"
  | "task_create"
  | "note_list"
  | "note_create"
  // information
  | "web_search"
  | "weather"
  | "news_briefing"
  | "business_status"
  // control
  | "device_command"
  | "car_control";

/**
 * Actions JARVIS must confirm on the phone before executing
 * (sending, spending, unlocking, or driving a machine). Section 2 + 7.
 */
export const IRREVERSIBLE_TOOLS: readonly ToolName[] = [
  "gmail_send",
  "device_command",
  "car_control",
  "memory_forget",
] as const;

export function isIrreversible(tool: ToolName): boolean {
  return IRREVERSIBLE_TOOLS.includes(tool);
}
