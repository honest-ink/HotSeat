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

You are interviewing the CEO of "${company.name}" whose mission is "${company.mission}".

Your job: run a live, high-pressure interview. You ask questions. The CEO answers by choosing one of three prepared answers you generate.

### Guest identity rules

- Do NOT invent or assume a personal name for the guest.
- Do NOT assign a gender, pronouns, or personal descriptors.
- Do NOT refer to the guest as an individual person.

- Refer to the guest only as:
  - "the CEO of ${company.name}"

These rules must be followed at all times.

### Turn format (VERY IMPORTANT)

For EACH turn you must output:
1) Your spoken line on-air (this can be a short acknowledgement + a question)
2) Three answer options for the CEO to choose from:
   - good: clear, direct, credible, specific
   - ok: plausible but generic, light on detail
   - evasive: dodges the question, spins, avoids specifics

Rules for answer options:
- Each option must be 1–2 sentences, short enough to fit on a button.
- The three options must feel like three realistic ways a CEO might answer the SAME question.
- The options must be meaningfully different in quality (good > ok > evasive).

### Category + scoring rules

- Set "category" to the quality of the option the CEO selected on the last turn.
  - If they selected the "good" option, category must be "good".
  - If they selected the "ok" option, category must be "neutral".
  - If they selected the "evasive" option, category must be "evasive".

- Do NOT invent a different category based on your own judgement. Mirror the selection.

### Style

Tone:
Professional. Controlled. Direct. Constructive.

- Ask precise questions. Apply pressure through clarity, not hostility.
- If the last answer was evasive, ask a tighter follow-up.
- If it was good, move forward.
- Keep your spoken line broadcast-ready (usually under 35 words).

Output JSON ONLY. No markdown. No extra text.
The JSON must match this schema:
{
  "text": "Your spoken response/question to the guest",
  "category": "good" | "neutral" | "evasive",
  "isContradiction": boolean,
  "sentiment": "positive" | "negative" | "neutral",
  "reason": "short explanation (optional)",
  "options": {
    "good": "string",
    "ok": "string",
    "evasive": "string"
  },
  "isInterviewOver": false
}
Rules:
- "category" must mirror the option chosen by the CEO on the prior turn.
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

function normalizeOptions(options) {
  const good = options?.good || "We can be specific: our core metric is retention and we report it monthly.";
  const ok = options?.ok || "We track a few metrics and review performance regularly across the team.";
  const evasive = options?.evasive || "It’s early days, but we’re seeing strong interest and momentum.";
  return { good, ok, evasive };
}

function normalizeHostPayload(parsed) {
  const text =
    parsed?.text ??
    "Welcome. Let’s start. What is the single biggest risk to your business this year?";

  // allow model to output category as good/neutral/evasive
  const category = parsed?.category ?? "neutral";

  return {
    text,
    category,
    isContradiction: Boolean(parsed?.isContradiction),
    sentiment: parsed?.sentiment,
    reason: parsed?.reason,
    options: normalizeOptions(parsed?.options),
    isInterviewOver: false,
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: Boolean(GEMINI_API_KEY) });
});

app.post("/api/init", async (req, res) => {
  try {
    if (!ai)
      return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const company = req.body?.company;
    if (!company?.name || !company?.mission) {
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
            category: {
              type: Type.STRING,
              enum: ["good", "neutral", "evasive"],
            },
            isContradiction: { type: Type.BOOLEAN },
            sentiment: {
              type: Type.STRING,
              enum: ["positive", "negative", "neutral"],
            },
            reason: { type: Type.STRING },
            options: {
              type: Type.OBJECT,
              properties: {
                good: { type: Type.STRING },
                ok: { type: Type.STRING },
                evasive: { type: Type.STRING },
              },
              required: ["good", "ok", "evasive"],
            },
            isInterviewOver: { type: Type.BOOLEAN },
          },
          required: ["text", "category", "isContradiction", "options", "isInterviewOver"],
        },
      },
    });

    sessions.set(sessionId, chatSession);

    console.log("[init] session:", sessionId, "company:", company.name);

    // First message: intro + first question + three answer options.
    const first = await chatSession.sendMessage({
      message:
        "Start the show. Introduce the guest to the audience and ask the first opening question. Include three answer options (good/ok/evasive).",
    });

    const parsed = safeParseJson(first.text || "");
    if (!parsed) {
      console.error("[init] bad json:", first.text);
      return res
        .status(502)
        .json({ error: "Gemini returned non-JSON", raw: first.text });
    }

    const normalized = normalizeHostPayload(parsed);
    res.json({ sessionId, ...normalized });
  } catch (err) {
    console.error("[init] error:", err);
    res.status(500).json({
      text: "Welcome to the show. What’s the clearest way to describe what your company does?",
      category: "neutral",
      isContradiction: false,
      sentiment: "neutral",
      reason: "init fallback",
      options: {
        good: "We solve a specific problem for a defined customer group, and we measure success by retention and revenue per user.",
        ok: "We help customers improve outcomes, and we track progress across a few metrics.",
        evasive: "We’re building something big and the market response so far has been very encouraging.",
      },
      isInterviewOver: false,
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!ai)
      return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const { sessionId, message, selectedCategory } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const chatSession = sessions.get(sessionId);
    if (!chatSession)
      return res
        .status(404)
        .json({ error: "Unknown sessionId (server restarted?)" });

    const msg = typeof message === "string" ? message : "";
    if (!msg) return res.status(400).json({ error: "Missing message" });

    // Tell the model which option was selected so it can mirror category.
    // selectedCategory should be "good" | "ok" | "evasive"
    const selectionLabel =
      selectedCategory === "good"
        ? "good"
        : selectedCategory === "evasive"
        ? "evasive"
        : "ok";

    const wrapped = `CEO selected the "${selectionLabel}" option. The selected answer was:\n${msg}`;

    console.log("[chat]", sessionId, "user:", selectionLabel, msg);

    const r = await chatSession.sendMessage({ message: wrapped });

    const parsed = safeParseJson(r.text || "");
    if (!parsed) {
      console.error("[chat] bad json:", r.text);
      return res
        .status(502)
        .json({ error: "Gemini returned non-JSON", raw: r.text });
    }

    const normalized = normalizeHostPayload(parsed);

    // Hard mirror category (server-side safety):
    // good -> good, ok -> neutral, evasive -> evasive
    normalized.category =
      selectionLabel === "good"
        ? "good"
        : selectionLabel === "evasive"
        ? "evasive"
        : "neutral";

    console.log("[chat]", sessionId, "host:", normalized.text);
    res.json(normalized);
  } catch (err) {
    console.error("[chat] error:", err);
    res.status(500).json({
      text: "We seem to be having technical difficulties. Let’s keep going. What’s your next concrete step?",
      category: "neutral",
      isContradiction: false,
      sentiment: "neutral",
      reason: "chat fallback",
      options: {
        good: "Our next step is clear: ship the next release, measure adoption, and adjust based on the data.",
        ok: "We’ll keep improving the product and listening to customers as we go.",
        evasive: "We’re exploring a few exciting avenues and will share more soon.",
      },
      isInterviewOver: false,
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

