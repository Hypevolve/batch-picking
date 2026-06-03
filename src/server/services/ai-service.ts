const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
const OPENROUTER_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "google/gemini-2.5-flash";

interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  error?: { message: string };
}

const SYSTEM_PROMPT = `Ti si skladišni asistent za Antikvarijat Libar. Pomažeš adminu s pitanjima o narudžbama, batchevima, lokacijama knjiga i skladišnom workflowu.

Odgovaraj isključivo na hrvatskom jeziku. Budi stručan, sažet i koristan.

Dostupne informacije:
- Narudžbe se uvode iz WooCommercea (status: processing / selling-payment)
- Batch picking grupira do 5 narudžbi po sličnosti SKU-ova
- Picker skuplja knjige po ruti (zone → police)
- Basket labels: A, B, C, D, E za koševe
- Autor knjige se vuče iz WooCommerce meta key "import_autori"

Nemoj izmišljati specifične podatke o narudžbama ako ih nemaš u kontekstu.`;

async function callOpenRouter(
  model: string,
  messages: OpenRouterMessage[]
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY nije postavljen");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "Batch Picking — Libar",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OpenRouterResponse;
  if (data.error?.message) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function generateAIReply(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<{ reply: string; model: string }> {
  const messages: OpenRouterMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];

  const models = [OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL];

  for (const model of models) {
    try {
      const reply = await callOpenRouter(model, messages);
      if (reply) return { reply, model };
    } catch (err) {
      console.warn(`[AI] Model ${model} failed:`, err);
      continue;
    }
  }

  throw new Error("Nijedan AI model nije dostupan.");
}
