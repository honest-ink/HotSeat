// services/geminiService.ts
import { CompanyProfile, GeminiResponse } from "../types";

let sessionId: string | null = null;

export async function initInterview(company: CompanyProfile): Promise<GeminiResponse> {
  const r = await fetch("/api/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company })
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`initInterview failed: ${r.status} ${txt}`);
  }

  const data = await r.json();
  sessionId = data.sessionId;
  return data as GeminiResponse;
}

export async function sendUserAnswer(answer: string): Promise<GeminiResponse> {
  if (!sessionId) throw new Error("No sessionId (did you call initInterview first?)");

  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message: answer })
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`sendUserAnswer failed: ${r.status} ${txt}`);
  }

  return (await r.json()) as GeminiResponse;
}
