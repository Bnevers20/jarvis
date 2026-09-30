import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { rememberFact, forgetFact, type MemoryKind } from "./memory";

/** Custom (client-executed) tools JARVIS can call. */
const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: "remember",
    description:
      "Save a durable fact or preference about the user to long-term memory. Use when they share something worth recalling later, or explicitly ask you to remember it. Phrase content as a standalone statement.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact, as a standalone statement." },
        kind: { type: "string", enum: ["fact", "preference", "summary"] },
      },
      required: ["content"],
    },
  },
  {
    name: "forget",
    description:
      "Delete the single memory that best matches a description. Use when the user asks you to forget something.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What to forget." } },
      required: ["query"],
    },
  },
  {
    name: "task_create",
    description:
      "Add a task or reminder. If the user wants to be notified at a specific time, set remind_at to an ISO 8601 datetime (use the current date/time given in your instructions to compute it).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        due_at: { type: "string", description: "ISO 8601 datetime the task is due." },
        remind_at: {
          type: "string",
          description: "ISO 8601 datetime to push a reminder to the user's phone.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "task_list",
    description: "List the user's tasks/reminders.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["open", "done", "snoozed"] } },
    },
  },
  {
    name: "note_create",
    description: "Save a note for the user.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
      required: ["body"],
    },
  },
  {
    name: "note_list",
    description: "List or search the user's notes.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Optional search text." } },
    },
  },
];

/** Full tool set: custom tools + Anthropic's server-side web search. */
export const ALL_TOOLS = [
  ...CUSTOM_TOOLS,
  { type: "web_search_20260209", name: "web_search" },
] as Anthropic.Messages.ToolUnion[];

type ToolInput = Record<string, string | undefined>;

/** Execute a client-side tool call; returns text for the tool_result. */
export async function runTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  input: ToolInput,
): Promise<string> {
  switch (name) {
    case "remember": {
      const ok = await rememberFact(
        supabase,
        input.content ?? "",
        (input.kind as MemoryKind) ?? "fact",
      );
      return ok ? "Saved to memory." : "Could not save that.";
    }
    case "forget": {
      const gone = await forgetFact(supabase, input.query ?? "");
      return gone ? `Forgotten: "${gone}"` : "Nothing matching to forget.";
    }
    case "task_create": {
      const { error } = await supabase.from("tasks").insert({
        user_id: userId,
        title: input.title,
        notes: input.notes ?? null,
        due_at: input.due_at ?? null,
        remind_at: input.remind_at ?? null,
      });
      if (error) return `Couldn't add that (${error.message}).`;
      return `Added: ${input.title}${input.remind_at ? " — I'll remind you." : ""}`;
    }
    case "task_list": {
      const { data } = await supabase
        .from("tasks")
        .select("title, due_at, remind_at")
        .eq("status", input.status ?? "open")
        .order("remind_at", { nullsFirst: false })
        .limit(25);
      if (!data?.length) return "No tasks.";
      return data
        .map(
          (t) =>
            `- ${t.title}${t.remind_at ? ` (remind ${t.remind_at})` : t.due_at ? ` (due ${t.due_at})` : ""}`,
        )
        .join("\n");
    }
    case "note_create": {
      const { error } = await supabase
        .from("notes")
        .insert({ user_id: userId, title: input.title ?? null, body: input.body });
      return error ? "Couldn't save the note." : "Noted.";
    }
    case "note_list": {
      let q = supabase
        .from("notes")
        .select("title, body")
        .order("created_at", { ascending: false })
        .limit(20);
      if (input.query) {
        q = q.or(`title.ilike.%${input.query}%,body.ilike.%${input.query}%`);
      }
      const { data } = await q;
      if (!data?.length) return "No notes.";
      return data
        .map((n) => `- ${n.title ? n.title + ": " : ""}${(n.body ?? "").slice(0, 140)}`)
        .join("\n");
    }
    default:
      return "Unknown tool.";
  }
}
