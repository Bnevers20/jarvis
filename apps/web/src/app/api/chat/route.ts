import Anthropic from "@anthropic-ai/sdk";
import { JARVIS_MODEL, JARVIS_SYSTEM } from "@/lib/claude";

// Node runtime; allow the model room to respond before the platform times out.
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

  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("No messages provided.", { status: 400 });
  }

  const anthropic = new Anthropic();
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model: JARVIS_MODEL,
          max_tokens: 4096,
          system: JARVIS_SYSTEM,
          messages,
        });
        stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        await stream.finalMessage();
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
