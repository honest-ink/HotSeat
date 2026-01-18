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
if (!GEMINI_API_KEY) console.error("Missing env var GEMINI_API_KEY");
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// Simple in-memory chat store (will reset if instance restarts)
// sessionId -> chatSession
const sessions = new Map();

function createSystemInstruction(company) {
  return `
You are Alex Sterling, a sharp, authoritative business journalist and host of the prime-time show "The Hot Seat".

You are interviewing the CEO of "${company.name}" whose mission is "${company.mission}".

Your job: run a live, high-pressure interview. You ask questions. The CEO answers by choosing one of TWO prepared answers you generate.

### Guest identity rules
- Do NOT invent or assume a personal name for the guest.
- Do NOT assign a gender, pronouns, or personal descriptors.
- Do NOT refer to the guest as an individual person.
- Refer to the guest only as "the CEO of ${company.name}".

### Turn format (VERY IMPORTANT)
For EACH turn you must output:
1) Your spoken line on-air (short acknowledgement + a question)
2) Two answer options for the CEO to choose from:
   - good: clear, direct, credible, specific
   - evasive: dodges the question, spins, avoids specifics

Rules for answer options:
- Provide EXACTLY two options: "good" and "evasive".
- Each option must be EXACTLY one sentence.
- Each option must be MAX 18 words.
- Both options must answer the SAME question.
- They must be meaningfully different in quality.

### Category rules (mirror the selection)
The client will tell you which option was selected on the prior turn (good/evasive).
- If selected good -> category "good"
- If selected evasive -> category "evasive"
Do not invent a different category.

### Style
Professional. Controlled. Direct. Constructive.
- Ask precise questions. Apply pressure through clarity, not hostility.
- If the last answer was evasive, ask a tighter follow-up.
- If it was good, move forward.
- Keep your spoken line broadcast-ready (under 35 words).

Output JSON ONLY. No markdown. No extra text.
The JSON must match this schema:
{
  "text": "Your spoken response/question to the guest",
  "category": "good" | "evasive",
  "isContradiction": boolean,
  "sentiment": "positive" | "negative" | "neutral",
  "reason": "short explanation (optional)",
  "options": {
    "good": "string (<=18 words, 1 sentence)",
    "evasive": "string (<=18 words, 1 sentence)"
  },
  "isInterviewOver": false
}
Rules:
- "category" must mirror the selection mapping above.
- Set "isContradiction" true only if the guest contradicts earlier claims.
- "sentiment" must match the tone of "text".
- Always set "isInterviewOver" to false.
`.trim();
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countWords(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function trimToMaxWords(s, maxWords) {
  const words = String(s || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(s || "").trim();
  return words.slice(0, maxWords).join(" ");
}

// keep only the first sentence
function firstSentence(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  const m = str.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : str).trim();
}

function normalizeOptionText(raw, fallback) {
  let s = raw ? String(raw) : "";
  s = firstSentence(s);
  s = trimToMaxWords(s, 18);

  // if model returns nothing useful, fallback
  if (countWords(s) < 3) s = fallback;

  // final hard cap
  s = firstSentence(s);
  s = trimToMaxWords(s, 18);
  return s;
}

function normalizeOptions(options) {
  const goodFallback =
    "We track retention and margin weekly, publish results monthly, and act on the data.";
  const evasiveFallback =
    "We’re seeing strong momentum, and we’ll share more details when we’re ready.";

  const good = normalizeOptionText(options?.good, goodFallback);
  const evasive = normalizeOptionText(options?.evasive, evasiveFallback);

  return { good, evasive };
}

function randomOptionsOrder() {
  return Math.random() < 0.5 ? ["good", "evasive"] : ["evasive", "good"];
}

function normalizeHostPayload(parsed) {
  const text =
    parsed?.text ??
    "Welcome. What is the single biggest risk to your business this year?";

  const category = parsed?.category ?? "good";

  return {
    text,
    category,
    isContradiction: Boolean(parsed?.isContradiction),
    sentiment: parsed?.sentiment,
    reason: parsed?.reason,
    options: normalizeOptions(parsed?.options),
    optionsOrder: randomOptionsOrder(),
    isInterviewOver: false,
  };
}

function selectionToCategory(selectionKey) {
  return selectionKey === "evasive" ? "evasive" : "good";
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: Boolean(GEMINI_API_KEY) });
});

app.post("/api/init", async (req, res) => {
  try {
    if (!ai) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

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
            category: { type: Type.STRING, enum: ["good", "evasive"] },
            isContradiction: { type: Type.BOOLEAN },
            sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral"] },
            reason: { type: Type.STRING },
            options: {
              type: Type.OBJECT,
              properties: {
                good: { type: Type.STRING },
                evasive: { type: Type.STRING },
              },
              required: ["good", "evasive"],
            },
            isInterviewOver: { type: Type.BOOLEAN },
          },
          required: ["text", "category", "isContradiction", "options", "isInterviewOver"],
        },
      },
    });

    sessions.set(sessionId, chatSession);

    console.log("[init] session:", sessionId, "company:", company.name);

    const first = await chatSession.sendMessage({
      message:
        "Start the show. Introduce the guest and ask the first opening question. Include two options (good/evasive). One sentence each, max 18 words.",
    });

    const parsed = safeParseJson(first.text || "");
    if (!parsed) {
      console.error("[init] bad json:", first.text);
      return res.status(502).json({ error: "Gemini returned non-JSON", raw: first.text });
    }

    // First turn category isn't meaningful; set to "good" for stability
    const normalized = normalizeHostPayload({ ...parsed, category: "good" });

    res.json({ sessionId, ...normalized });
  } catch (err) {
    console.error("[init] error:", err);
    res.status(500).json({
      sessionId: null,
      text: "Welcome to the show. In one sentence, what do you do and why should anyone trust you?",
      category: "good",
      isContradiction: false,
      sentiment: "neutral",
      reason: "init fallback",
      options: {
        good: "We solve a clear problem, measure outcomes weekly, and publish results monthly.",
        evasive: "We’re building something big, and early feedback has been very encouraging.",
      },
      optionsOrder: randomOptionsOrder(),
      isInterviewOver: false,
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const { sessionId, message, selectedKey } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

    const chatSession = sessions.get(sessionId);
    if (!chatSession) {
      return res.status(404).json({ error: "Unknown sessionId (server restarted?)" });
    }

    const msg = typeof message === "string" ? message : "";
    if (!msg) return res.status(400).json({ error: "Missing message" });

    const sel = selectedKey === "good" || selectedKey === "evasive" ? selectedKey : "good";

    // Tell the model what the CEO selected, so it mirrors category.
    const wrapped = `CEO selected "${sel}". The selected answer text was:\n${msg}`;

    console.log("[chat]", sessionId, "user:", sel, msg);

    const r = await chatSession.sendMessage({ message: wrapped });

    const parsed = safeParseJson(r.text || "");
    if (!parsed) {
      console.error("[chat] bad json:", r.text);
      return res.status(502).json({ error: "Gemini returned non-JSON", raw: r.text });
    }

    const normalized = normalizeHostPayload(parsed);

    // Hard mirror category on server for safety
    normalized.category = selectionToCategory(sel);

    console.log("[chat]", sessionId, "host:", normalized.text);
    res.json(normalized);
  } catch (err) {
    console.error("[chat] error:", err);
    res.status(500).json({
      text: "We’re having technical difficulties. Answer plainly: what is your next concrete step?",
      category: "good",
      isContradiction: false,
      sentiment: "neutral",
      reason: "chat fallback",
      options: {
        good: "Next: ship the release, measure adoption weekly, and cut anything that doesn’t move retention.",
        evasive: "We’re exploring a few avenues and will share more once plans are final.",
      },
      optionsOrder: randomOptionsOrder(),
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
