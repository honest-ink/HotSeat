// services/geminiService.ts
import {
  CompanyProfile,
  GeminiResponse,
  AnswerCategory,
  AnswerOptions,
  AnswerOptionKey,
} from "../types";

let sessionId: string | null = null;

// Legacy backend format (if you ever hit an old deployment)
type LegacyGeminiResponse = {
  text: string;
  sentiment?: "positive" | "negative" | "neutral";
  stockChange?: number;
  isInterviewOver?: boolean;
};

type NewGeminiResponse = {
  text: string;
  category: AnswerCategory; // "good" | "evasive" | "bad"
  isContradiction: boolean;
  sentiment?: "positive" | "negative" | "neutral";
  reason?: string;
  options?: AnswerOptions;
  isInterviewOver?: boolean;
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
      options: hasOptions(raw.options) ? raw.options : undefined,
      isInterviewOver: Boolean(raw.isInterviewOver),
    };
  }

  // Fallback: legacy backend format.
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
    options: undefined,
    isInterviewOver: Boolean(legacy.isInterviewOver),
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

  sessionId = typeof data.sessionId === "string" ? data.sessionId : null;

  const payload = data?.response ?? data;
  return normaliseResponse(payload);
}

/**
 * UI tells backend which option button was picked.
 * selectedKey: "good" | "ok" | "evasive"
 */
export async function sendUserAnswer(
  answer: string,
  selectedKey: AnswerOptionKey
): Promise<GeminiResponse> {
  if (!sessionId) throw new Error("No sessionId (did you call initInterview first?)");

  const data = await postJson<any>("/api/chat", {
    sessionId,
    message: answer,
    selectedKey,
  });

  const payload = data?.response ?? data;
  return normaliseResponse(payload);
}

export function resetSession() {
  sessionId = null;
}
