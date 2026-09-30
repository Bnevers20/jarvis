import Anthropic from "@anthropic-ai/sdk";
import { JARVIS_MODEL, JARVIS_SYSTEM } from "@/lib/claude";
import { createClient } from "@/lib/supabase/server";
import { retrieveMemories } from "@/lib/memory";
import { ALL_TOOLS, runTool } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "JARVIS is offline, sir — my brain isn't wired up yet (ANTHROPIC_API_KEY is unset).",
      { status: 503 },
    );
  }

  // Owner-only: the brain never answers an unauthenticated caller.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("No messages provided.", { status: 400 });
  }

  // Personalization: how the owner wants to be addressed + tone + timezone.
  const { data: profile } = await supabase
    .from("profiles")
    .select("settings, timezone")
    .eq("id", user!.id)
    .single();
  const prefs = (profile?.settings ?? {}) as { call_me?: string; tone?: string };
  const tz = profile?.timezone || "America/Detroit";
  const persona =
    (prefs.call_me && prefs.call_me.toLowerCase() !== "sir"
      ? `\n\nAddress the user as "${prefs.call_me}" (in place of "sir").`
      : "") +
    (prefs.tone === "warm"
      ? "\nLean warmer and more encouraging than your usual dry default."
      : prefs.tone === "brief"
        ? "\nBe extra brief and all-business — skip pleasantries."
        : "");

  const nowStr = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
  const clock = `\n\nThe current date and time is ${nowStr} (${tz}). Use this for reminders and any time-based questions; compute ISO 8601 values for tool calls from it.`;

  // Recall relevant long-term memories for the latest user turn.
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const memories = lastUser ? await retrieveMemories(supabase, lastUser) : [];
  const system =
    JARVIS_SYSTEM +
    persona +
    clock +
    (memories.length
      ? `\n\nRelevant things you remember about the user (use naturally; don't recite verbatim):\n${memories
          .map((m) => `- ${m}`)
          .join("\n")}`
      : "");

  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  const anthropic = new Anthropic(
    workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {},
  );
  const encoder = new TextEncoder();

  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Agentic loop: stream text each turn; run tools between turns.
        // web_search runs server-side (may pause_turn); custom tools run here.
        for (let turn = 0; turn < 8; turn++) {
          const stream = anthropic.messages.stream({
            model: JARVIS_MODEL,
            max_tokens: 4096,
            system,
            messages: convo,
            tools: ALL_TOOLS,
          });
          stream.on("text", (d) => controller.enqueue(encoder.encode(d)));
          const final = await stream.finalMessage();
          convo.push({ role: "assistant", content: final.content });

          // Server tool paused mid-loop — resend to let it continue.
          if (final.stop_reason === "pause_turn") continue;
          if (final.stop_reason !== "tool_use") break;

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            const out = await runTool(
              supabase,
              user!.id,
              block.name,
              block.input as Record<string, string | undefined>,
            );
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: out,
            });
          }
          if (!results.length) break;
          convo.push({ role: "user", content: results });
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(encoder.encode(`\n\n[JARVIS error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
