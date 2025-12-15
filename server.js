// server.js (CommonJS)
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI, Type } = require("@google/genai");

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: "1mb" }));

// ---- Gemini setup (SERVER ONLY) ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Missing env var GEMINI_API_KEY");
}
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Simple in-memory chat store (will reset if instance restarts)
const sessions = new Map();

function createSystemInstruction(company) {
  return `
You are "Diane", the ruthless but charismatic host of a live business news show called "The Hot Seat".
You are interviewing the CEO of "${company.name}" in the "${company.industry}" industry.
Their mission is: "${company.mission}".

Hard constraints:
- Keep output under ~40 words unless absolutely needed.
- Ask one sharp question at a time.
- Keep the tone tense, skeptical, fast.

Game classification task:
After each CEO answer, classify that answer into one category:
- "good": clear, direct, credible, addresses the question, plain language, acknowledges risk where needed, does not contradict earlier statements.
- "evasive": deflects, vague, over-scripted, dodges the question, corporate language without substance.
- "bad": contradictory, dismissive, careless, admits fault without control, undermines the company’s stated position.

Contradiction rule:
- If the CEO contradicts their earlier statements in this interview, set isContradiction = true.

Special messages:
- If the user message is exactly "[NEXT_QUESTION]" then DO NOT classify an answer. Just continue the interview with the next question.
  In that case, still output "category": "evasive" and "isContradiction": false (placeholders), because the client expects those fields.

Output JSON ONLY. No markdown. No extra text.
The JSON must match this schema:
{
  "text": string,
  "category": "good" | "evasive" | "bad",
  "isContradiction": boolean,
  "sentiment": "positive" | "negative" | "neutral",
  "reason": string
}

- sentiment is optional flavour.
- reason is a short dev-only note (do not address the CEO directly with it).
`.trim();
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function fallbackResponse(text) {
  return {
    text,
    category: "evasive",
    isContradiction: false,
    sentiment: "neutral",
    reason: "fallback",
  };
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    category: { type: Type.STRING, enum: ["good", "evasive", "bad"] },
    isContradiction: { type: Type.BOOLEAN },
    sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
    reason: { type: Type.STRING },
  },
  required: ["text", "category", "isContradiction"],
};

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: Boolean(GEMINI_API_KEY) });
});

app.post("/api/init", async (req, res) => {
  try {
    if (!ai) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const company = req.body?.company;
    if (!company?.name || !company?.industry || !company?.mission) {
      return res.status(400).json({ error: "Missing company fields" });
    }

    const sessionId = crypto.randomUUID();

    const chatSession = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: createSystemInstruction(company),
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    sessions.set(sessionId, chatSession);

    console.log("[init] session:", sessionId, "company:", company.name);

    // First message: intro + first question.
    // Client starts the 60s timer when it receives this.
    const first = await chatSession.sendMessage({
      message:
        'Start the show. Introduce the guest in one line and ask the first hard opening question. Output JSON only.',
    });

    const parsed = safeParseJson(first.text || "");
    if (!parsed) {
      console.error("[init] bad json:", first.text);
      return res.status(502).json({ error: "Gemini returned non-JSON", raw: first.text });
    }

    // If Gemini forgets placeholders, force them so the client doesn't crash.
    const normalized = {
      text: parsed.text ?? "Welcome. Let’s start. What’s your core business risk right now?",
      category: parsed.category ?? "evasive",
      isContradiction: Boolean(parsed.isContradiction),
      sentiment: parsed.sentiment,
      reason: parsed.reason,
    };

    res.json({ sessionId, ...normalized });
  } catch (err) {
    console.error("[init] error:", err);
    res.status(500).json({
      sessionId: crypto.randomUUID(),
      ...fallbackResponse("Welcome. Let’s start. Why should investors trust you today?"),
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const { sessionId, message } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const chatSession = sessions.get(sessionId);
    if (!chatSession) return res.status(404).json({ error: "Unknown sessionId (server restarted?)" });

    const msg = typeof message === "string" ? message : "";
    if (!msg) return res.status(400).json({ error: "Missing message" });

    console.log("[chat]", sessionId, "user:", msg);

    const r = await chatSession.sendMessage({ message: msg });

    const parsed = safeParseJson(r.text || "");
    if (!parsed) {
      console.error("[chat] bad json:", r.text);
      return res.status(502).json({ error: "Gemini returned non-JSON", raw: r.text });
    }

    const normalized = {
      text: parsed.text ?? "Answer the question directly. What are you hiding?",
      category: parsed.category ?? "evasive",
      isContradiction: Boolean(parsed.isContradiction),
      sentiment: parsed.sentiment,
      reason: parsed.reason,
    };

    console.log("[chat]", sessionId, "host:", normalized.text);
    res.json(normalized);
  } catch (err) {
    console.error("[chat] error:", err);
    res.status(500).json(
      fallbackResponse("Technical glitch. Short answer: what went wrong this quarter?")
    );
  }
});

// ---- Static hosting ----
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
