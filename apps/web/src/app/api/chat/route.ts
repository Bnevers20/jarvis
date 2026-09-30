import Anthropic from "@anthropic-ai/sdk";
import { JARVIS_MODEL, JARVIS_SYSTEM } from "@/lib/claude";
import { createClient } from "@/lib/supabase/server";
import {
  retrieveMemories,
  rememberFact,
  forgetFact,
  type MemoryKind,
} from "@/lib/memory";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "remember",
    description:
      "Save a durable fact or preference about the user to long-term memory. Use when the user shares something worth recalling in future conversations, or explicitly asks you to remember it. Phrase the content as a standalone statement.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The fact to remember, as a standalone statement.",
        },
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
      properties: {
        query: {
          type: "string",
          description: "A description of what to forget.",
        },
      },
      required: ["query"],
    },
  },
];

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

  // Personalization: how the owner wants to be addressed + tone.
  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user!.id)
    .single();
  const prefs = (profile?.settings ?? {}) as { call_me?: string; tone?: string };
  const persona =
    (prefs.call_me && prefs.call_me.toLowerCase() !== "sir"
      ? `\n\nAddress the user as "${prefs.call_me}" (in place of "sir").`
      : "") +
    (prefs.tone === "warm"
      ? "\nLean warmer and more encouraging than your usual dry default."
      : prefs.tone === "brief"
        ? "\nBe extra brief and all-business — skip pleasantries."
        : "");

  // Recall relevant long-term memories for the latest user turn.
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const memories = lastUser ? await retrieveMemories(supabase, lastUser) : [];
  const system =
    JARVIS_SYSTEM +
    persona +
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
        // Agentic loop: stream text each turn; run memory tools between turns.
        for (let turn = 0; turn < 6; turn++) {
          const stream = anthropic.messages.stream({
            model: JARVIS_MODEL,
            max_tokens: 4096,
            system,
            messages: convo,
            tools: TOOLS,
          });
          stream.on("text", (d) => controller.enqueue(encoder.encode(d)));
          const final = await stream.finalMessage();
          convo.push({ role: "assistant", content: final.content });
          if (final.stop_reason !== "tool_use") break;

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            let out = "Done.";
            if (block.name === "remember") {
              const input = block.input as { content: string; kind?: MemoryKind };
              const ok = await rememberFact(supabase, input.content, input.kind);
              out = ok ? "Saved to memory." : "Could not save that.";
            } else if (block.name === "forget") {
              const input = block.input as { query: string };
              const gone = await forgetFact(supabase, input.query);
              out = gone ? `Forgotten: "${gone}"` : "Nothing matching to forget.";
            }
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: out,
            });
          }
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
