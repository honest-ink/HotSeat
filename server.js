// server.js (CommonJS)
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenAI, Type } = require("@google/genai");

const app = express();
const port = process.env.PORT || 8080;

// Parse JSON bodies
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

Your goal: test their credibility on live TV.
Be skeptical, focused, and fair. Apply pressure through precise questions, not hostility.

Guidelines:
- If an answer is vague, ask one clear follow-up that helps them be specific.
- If an answer is strong, briefly acknowledge it, then move on.
- Challenge claims using numbers, risks, or timelines.
- Never insult, belittle, or moralise.
- Keep responses punchy and broadcast-ready (usually under 40 words).

Tone:
Professional. Controlled. Direct. Constructive.

You must output your response in JSON format ONLY.
The JSON structure must be:
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

    const first = await chatSession.sendMessage({
      message: "Start the show. Introduce the guest to the audience and ask the first opening question. Be inquisitive."
    });

    const parsed = safeParseJson(first.text || "");
    if (!parsed) {
      console.error("[init] bad json:", first.text);
      return res.status(502).json({ error: "Gemini returned non-JSON", raw: first.text });
    }

    res.json({ sessionId, ...parsed });
  } catch (err) {
    console.error("[init] error:", err);
    res.status(500).json({
      text: "Welcome to the show. Tell us about your company.",
      category: "evasive",
      isContradiction: false,
      sentiment: "neutral",
      isInterviewOver: false
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const { sessionId, message } = req.body || {};
    if (!sessionId || !message) return res.status(400).json({ error: "Missing sessionId or message" });

    const chatSession = sessions.get(sessionId);
    if (!chatSession) return res.status(404).json({ error: "Unknown sessionId (server restarted?)" });

    console.log("[chat]", sessionId, "user:", message);

    const r = await chatSession.sendMessage({ message });
    const parsed = safeParseJson(r.text || "");
    if (!parsed) {
      console.error("[chat] bad json:", r.text);
      return res.status(502).json({ error: "Gemini returned non-JSON", raw: r.text });
    }

    console.log("[chat]", sessionId, "host:", parsed.text);
    res.json(parsed);
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
