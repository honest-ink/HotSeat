// services/geminiService.ts
import { CompanyProfile, GeminiResponse, AnswerCategory } from "../types";

let sessionId: string | null = null;

type AnswerOptions = {
  good: string;
  ok: string;
  evasive: string;
};

// The backend may still return the old shape.
// We normalise it into the current GeminiResponse shape.
type LegacyGeminiResponse = {
  text: string;
  sentiment?: "positive" | "negative" | "neutral";
  stockChange?: number;
  isInterviewOver?: boolean;
};

type NewGeminiResponse = {
  text: string;
  category: AnswerCategory | "neutral"; // server now uses neutral in places
  isContradiction: boolean;
  sentiment?: "positive" | "negative" | "neutral";
  reason?: string;
  options?: AnswerOptions;
};

function hasOptions(x: any): x is AnswerOptions {
  return (
    x &&
    typeof x === "object" &&
    typeof x.good === "string" &&
    typeof x.ok === "string" &&
    typeof x.evasive === "string"
  );
}

function isNewShape(x: any): x is NewGeminiResponse {
  return (
    x &&
    typeof x === "object" &&
    typeof x.text === "string" &&
    (x.category === "good" ||
      x.category === "evasive" ||
      x.category === "bad" ||
      x.category === "neutral") &&
    typeof x.isContradiction === "boolean"
  );
}

function normaliseResponse(raw: any): GeminiResponse {
  // Preferred: new backend format
  if (isNewShape(raw)) {
    // Some parts of your frontend still treat category as AnswerCategory.
    // If your types don't include "neutral", map it to a safe existing value.
    const cat: any = raw.category === "neutral" ? "neutral" : raw.category;

    return {
      text: raw.text,
      category: cat,
      isContradiction: raw.isContradiction,
      sentiment: raw.sentiment,
      reason: raw.reason,
      options: hasOptions(raw.options) ? raw.options : undefined,
    } as any;
  }

  // Fallback: legacy backend format.
  const legacy = raw as LegacyGeminiResponse;

  const stockChange =
    typeof legacy.stockChange === "number" ? legacy.stockChange : 0;

  let category: AnswerCategory = "evasive";

  if (stockChange >= 0.5 || legacy.sentiment === "positive") category = "good";
  else if (stockChange <= -2.5 || legacy.sentiment === "negative")
    category = "bad";
  else category = "evasive";

  return {
    text: typeof legacy.text === "string" ? legacy.text : "",
    category,
    isContradiction: false,
    sentiment: legacy.sentiment,
    reason: "Normalised from legacy Gemini response",
    options: undefined,
  } as any;
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

  sessionId = typeof data.sessionId === "string" ? data.sessionId : null;

  const payload = data?.response ?? data;

  return normaliseResponse(payload);
}

/**
 * Now expects the UI to tell us what the user picked:
 * selectedCategory: "good" | "ok" | "evasive"
 */
export async function sendUserAnswer(
  answer: string,
  selectedCategory: "good" | "ok" | "evasive"
): Promise<GeminiResponse> {
  if (!sessionId)
    throw new Error("No sessionId (did you call initInterview first?)");

  const data = await postJson<any>("/api/chat", {
    sessionId,
    message: answer,
    selectedCategory,
  });

  const payload = data?.response ?? data;

  return normaliseResponse(payload);
}

export function resetSession() {
  sessionId = null;
}
