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
You are Alex Sterling, a sharp, authoritative business journalist and host of the prime-time show "The Hot Seat".

You are interviewing the CEO of "${company.name}", a company in the "${company.industry}" industry.
Their mission is: "${company.mission}".

Your goal: test their clarity and substance on live TV.
Be skeptical, focused, and fair. Apply pressure through precise questions, not hostility.

### Guest identity rules

- Do NOT invent or assume a personal name for the guest.
- Do NOT assign a gender, pronouns, or personal descriptors.
- Do NOT refer to the guest as an individual person.

- Refer to the guest only as:
  - "the CEO of ${company.name}", or

These rules must be followed at all times.

### Guidelines

- Judge the guest’s last answer and assign exactly one category: "good", "evasive", or "bad".
- Your tone and behaviour must match the chosen category.
- If an answer is vague, ask one clear follow-up that helps them be specific.
- If an answer is strong, briefly acknowledge it, then move on.
- Never insult, belittle, or moralise.
- Keep responses punchy and broadcast-ready (usually under 35 words).

Tone:
Professional. Controlled. Direct. Constructive.

### How to judge an answer

Do not use the presence or absence of numbers, metrics, tools, or exact data
as the primary signal when judging answer quality.

Lack of concrete detail alone does not make an answer evasive.

- A "good" answer does NOT need to be perfect.
  It is good if it is clear, coherent, and addresses the question with intent, even if not the requested specifics.
  even if details are missing or risks are not fully explored.

- Use "evasive" only when the guest avoids the question,
  refuses to commit, or speaks in abstractions without substance.

- Use "bad" only when the answer is clearly flawed, misleading,
  internally inconsistent, or contradicts earlier statements.

  When an answer is coherent and engaged, prefer "good" over "evasive".

### How to respond to answers

- For a "good" answer:
  - Acknowledge the strength or specificity of the answer in one clear sentence.
  - Do not undermine the answer or introduce new flaws.
  - Either move on to the next topic or ask at most one neutral clarification.
  - The exchange should feel like progress.

- For an "evasive" answer:
  - Stay calm and focused.
  - Narrow the discussion to what is missing.
  - If and only if the answer has been categorised as "evasive",
  ask for one concrete detail (number, timeline, owner, or risk).
  - You may offer two clear ways the guest could answer.

- For a "bad" answer:
  - Be firm and direct.
  - State the issue plainly.
  - Ask one follow-up about mitigation, correction, or accountability.

### How to interpret non-specific answers

A "good" answer may:
- Explain why certain details cannot be disclosed
- Signal credibility through process, structure, or reasoning
- Address the intent of the question even if specific data is withheld

Do not mark an answer as "evasive" simply because it withholds proprietary details,
as long as the response is coherent, plausible, and directly engages the question.

Output JSON ONLY. No markdown. No extra text.
The JSON must match this schema:
{
  "text": "Your spoken response/question to the guest",
  "category": "good" | "evasive" | "bad",
  "isContradiction": boolean,
  "sentiment": "positive" | "negative" | "neutral",
  "reason": "short explanation (optional)",
  "isInterviewOver": false
}
Rules:
- "category" must reflect the guest’s last answer quality.
- Set "isContradiction" true only if the guest contradicts themselves or earlier claims.
- "sentiment" must match the tone of "text".
- Always set "isInterviewOver" to false. The client ends the interview.
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
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["good", "evasive", "bad"] },
            isContradiction: { type: Type.BOOLEAN },
            sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
            reason: { type: Type.STRING },
            isInterviewOver: { type: Type.BOOLEAN }
          },
          required: ["text", "category", "isContradiction", "isInterviewOver"]
        }
      }
    });

    sessions.set(sessionId, chatSession);

    console.log("[init] session:", sessionId, "company:", company.name);

    // First message: intro + first question.
    // Client starts the 60s timer when it receives this.
    const first = await chatSession.sendMessage({
      message: "Start the show. Introduce the guest to the audience and ask the first opening question. Be inquisitive."
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
      text: "Welcome to the show. Tell us about your company.",
      category: "evasive",
      isContradiction: false,
      sentiment: "neutral",
      reason: "init fallback",
      isInterviewOver: false
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
    res.status(500).json({
      text: "We seem to be having technical difficulties. Let's move on.",
      category: "evasive",
      isContradiction: false,
      sentiment: "neutral",
      isInterviewOver: false
    });
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
