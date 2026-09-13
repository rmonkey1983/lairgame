import "@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "@supabase/server";
import { isStructuredBrainAIResponse, validateBrainAIRequestEnvelope } from "./validation.ts";

type ProviderConfig = { apiKey: string; model: string; endpoint: string; timeoutMs: number };

function getProviderConfig(): ProviderConfig | null {
  const apiKey = Deno.env.get("BRAIN_AI_PROVIDER_API_KEY")?.trim();
  const model = Deno.env.get("BRAIN_AI_PROVIDER_MODEL")?.trim();
  const endpoint = Deno.env.get("BRAIN_AI_PROVIDER_URL")?.trim();
  const timeoutMs = Number(Deno.env.get("BRAIN_AI_PROVIDER_TIMEOUT_MS") ?? "1500");
  return apiKey && model && endpoint && Number.isFinite(timeoutMs) && timeoutMs > 0 ? { apiKey, model, endpoint, timeoutMs } : null;
}

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function errorResponse(status: number, code: string): Response { return Response.json({ code }, { status, headers: corsHeaders }); }

async function callProvider(request: Record<string, unknown>, prompt: string, provider: ProviderConfig): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        messages: [
          { role: "system", content: "Choose only from supplied proposal/mission options. NO_INTERVENTION is allowed. Do not invent actions. Do not change roles or game truth. Do not issue commands. Return strict structured JSON only." },
          { role: "user", content: `${prompt}\n${JSON.stringify(request)}` },
        ],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (response.status === 429) throw new Error("RATE_LIMIT");
    if (!response.ok) throw new Error("PROVIDER_UNAVAILABLE");
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error("MALFORMED_PROVIDER_RESPONSE");
    const choices = body.choices;
    const content = Array.isArray(choices) && isRecord(choices[0]) && isRecord(choices[0].message) ? choices[0].message.content : undefined;
    if (typeof content !== "string") throw new Error("MALFORMED_PROVIDER_RESPONSE");
    try { return JSON.parse(content) as unknown; } catch { throw new Error("MALFORMED_PROVIDER_RESPONSE"); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("PROVIDER_TIMEOUT", { cause: error });
    throw new Error(error instanceof Error ? error.message : "PROVIDER_UNAVAILABLE", { cause: error });
  } finally { clearTimeout(timer); }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: "user" });
    if (authError || !ctx) return errorResponse(401, "AUTH_REQUIRED");
    if (req.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED");
    const body: unknown = await req.json().catch(() => undefined);
    const validation = validateBrainAIRequestEnvelope(body);
    if (!validation.valid) return errorResponse(400, validation.reason);

    const { data: staff, error: staffError } = await ctx.supabase.rpc("get_my_staff_access");
    if (staffError || !Array.isArray(staff) || staff.length === 0) return errorResponse(403, "STAFF_ACCESS_DENIED");
    const provider = getProviderConfig();
    if (!provider) return errorResponse(503, "AI_UNAVAILABLE");

    try {
      const envelope = body as { request: Record<string, unknown>; prompt: string };
      const rawResponse = await callProvider(envelope.request, envelope.prompt, provider);
      if (!isStructuredBrainAIResponse(rawResponse)) return errorResponse(502, "AI_INVALID_RESPONSE");
      return Response.json(rawResponse, { status: 200, headers: corsHeaders });
    } catch (error) {
      const code = error instanceof Error && error.message === "RATE_LIMIT" ? "AI_RATE_LIMIT" : error instanceof Error && error.message === "PROVIDER_TIMEOUT" ? "AI_TIMEOUT" : "AI_UNAVAILABLE";
      return errorResponse(code === "AI_RATE_LIMIT" ? 429 : 502, code);
    }
  },
};
