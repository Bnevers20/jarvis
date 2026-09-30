import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryKind = "fact" | "preference" | "summary";

/** Embed text via the in-database gte-small edge function (384-dim). */
export async function embed(
  supabase: SupabaseClient,
  text: string,
): Promise<number[] | null> {
  const { data, error } = await supabase.functions.invoke("embed", {
    body: { text },
  });
  if (error || !data?.embedding) return null;
  return data.embedding as number[];
}

/** Top matching memories for a query, scoped to the caller by RLS + auth.uid(). */
export async function retrieveMemories(
  supabase: SupabaseClient,
  queryText: string,
  k = 6,
): Promise<string[]> {
  const embedding = await embed(supabase, queryText);
  if (!embedding) return [];
  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: embedding,
    match_count: k,
  });
  if (error || !data) return [];
  return (data as { content: string }[]).map((r) => r.content);
}

/** Persist a durable fact/preference with its embedding. */
export async function rememberFact(
  supabase: SupabaseClient,
  content: string,
  kind: MemoryKind = "fact",
): Promise<boolean> {
  const [embedding, { data: userData }] = await Promise.all([
    embed(supabase, content),
    supabase.auth.getUser(),
  ]);
  const uid = userData.user?.id;
  if (!uid) return false;
  const { error } = await supabase.from("memories").insert({
    user_id: uid,
    content,
    kind,
    embedding,
    source: "chat",
  });
  return !error;
}

/** Delete the single best-matching memory; returns its content, or null. */
export async function forgetFact(
  supabase: SupabaseClient,
  query: string,
): Promise<string | null> {
  const embedding = await embed(supabase, query);
  if (!embedding) return null;
  const { data } = await supabase.rpc("match_memories", {
    query_embedding: embedding,
    match_count: 1,
    min_similarity: 0.5,
  });
  const top = (data as { id: string; content: string }[] | null)?.[0];
  if (!top) return null;
  await supabase.from("memories").delete().eq("id", top.id);
  return top.content;
}
