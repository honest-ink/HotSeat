// services/geminiService.ts
import { CompanyProfile, GeminiResponse, AnswerCategory } from "../types";

let sessionId: string | null = null;

// The backend may still return the old shape (stockChange/sentiment/isInterviewOver).
// We normalise it into the new GeminiResponse shape your app uses now.
type LegacyGeminiResponse = {
  text: string;
  sentiment?: "positive" | "negative" | "neutral";
  stockChange?: number;
  isInterviewOver?: boolean;
};

type NewGeminiResponse = {
  text: string;
  category: AnswerCategory;
  isContradiction: boolean;
  sentiment?: "positive" | "negative" | "neutral";
  reason?: string;
};

function isNewShape(x: any): x is NewGeminiResponse {
  return (
    x &&
    typeof x === "object" &&
    typeof x.text === "string" &&
    (x.category === "good" || x.category === "evasive" || x.category === "bad") &&
    typeof x.isContradiction === "boolean"
  );
}

function normaliseResponse(raw: any): GeminiResponse {
  // Preferred: new backend format
  if (isNewShape(raw)) {
    return {
      text: raw.text,
      category: raw.category,
      isContradiction: raw.isContradiction,
      sentiment: raw.sentiment,
      reason: raw.reason,
    };
  }

  // Fallback: legacy backend format.
  // Map legacy sentiment/stockChange into a rough category.
  const legacy = raw as LegacyGeminiResponse;

  const stockChange = typeof legacy.stockChange === "number" ? legacy.stockChange : 0;
  let category: AnswerCategory = "evasive";

  if (stockChange >= 0.5 || legacy.sentiment === "positive") category = "good";
  else if (stockChange <= -2.5 || legacy.sentiment === "negative") category = "bad";
  else category = "evasive";

  return {
    text: typeof legacy.text === "string" ? legacy.text : "",
    category,
    isContradiction: false,
    sentiment: legacy.sentiment,
    reason: "Normalised from legacy Gemini response",
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`${url} failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as T;
}

export async function initInterview(company: CompanyProfile): Promise<GeminiResponse> {
  const data = await postJson<any>("/api/init", { company });

  // current backend returns { sessionId, ...payload }
  sessionId = typeof data.sessionId === "string" ? data.sessionId : null;

  // Some backends may return the message under a nested key.
  const payload = data?.response ?? data;

  return normaliseResponse(payload);
}

export async function sendUserAnswer(answer: string): Promise<GeminiResponse> {
  if (!sessionId) throw new Error("No sessionId (did you call initInterview first?)");

  const data = await postJson<any>("/api/chat", { sessionId, message: answer });

  const payload = data?.response ?? data;

  return normaliseResponse(payload);
}

// Optional helper if you ever want to restart cleanly in-app (without reload)
export function resetSession() {
  sessionId = null;
}
