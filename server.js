// server.js (CommonJS)
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json({ limit: "1mb" }));

// ---- Gemini setup ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Store sessions in memory
const sessions = new Map();

/**
 * Creates the dynamic System Instruction based on the Company Name/Mission.
 */
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

### Interview Structure (The 3 Stages)
You must count the number of questions you (the host) have ALREADY asked in the conversation history to determine your current stage.

**Turn 1 (0 previous questions) -> Stage 1: The Mission Challenge**
- **Your Pivot:** You MUST start with this exact template: "Today in the Hotseat we have the CEO of ${company.name}. Tell me, [insert question about ${company.mission} in >10 words]?"
- **Good Option:** The value is clear in real human terms.
- **Evasive Option:** The value is framed in generic "marketing speak."

**Turn 2 (1 previous question) -> Stage 2: The Performance Check**
- **Your Pivot:** Acknowledge the last answer briefly, then HARD PIVOT to finances. Ask how the company has been performing.
- **Good Option:** Cites quantifiable metrics or specific targets.
- **Evasive Option:** Cites vague processes or general marketing language.

**Turn 3 (2 previous questions) -> Stage 3: The Crisis**
- **Your Pivot:** Acknowledge briefly, then HARD PIVOT to a problem. Confront the CEO about a specific failure or something that has gone wrong.
- **Good Option:** Takes direct responsibility.
- **Evasive Option:** Shirks responsibility (blames context, market, or others).

**Turn 4+ -> Wrap up**
- If the interview goes beyond 3 questions, thank the guest and set "isInterviewOver": true.

### Turn format (VERY IMPORTANT)
For EACH turn you must output:
1) Your spoken line on-air (short acknowledgement + the specific question for the current Stage)
2) Two answer options for the CEO to choose from:
   - good: clear, direct, credible, specific
   - evasive: dodges the question (based on the Stage rules above)

### Rules for answer options
- Provide EXACTLY two options: "good" and "evasive".
- Each option must be EXACTLY one sentence.
- Each option must be MAX 18 words.
- Both options must answer the SAME question.
- They must be meaningfully different in quality based on the Stage rules defined above.

### Category rules (mirror the selection)
The client will tell you which option was selected on the prior turn (good/evasive).
- If selected good -> category "good"
- If selected evasive -> category "evasive"
Do not invent a different category.

### Style
Professional. Controlled. Direct. Constructive.
- Ask precise questions.
- **CRITICAL:** Prioritize the "Interview Structure" over conversational flow. When the Turn count changes, you MUST switch topics, even if the previous topic feels unresolved.
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
- Set "isInterviewOver" to true ONLY if you have completed Stage 3.
`;
}

// --- HELPER FUNCTIONS ---

function safeParseJson(text) {
  try {
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
}

function countWords(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

function trimToMaxWords(s, maxWords) {
  const words = String(s || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(s || "").trim();
  return words.slice(0, maxWords).join(" ");
}

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
  if (countWords(s) < 3) s = fallback;
  s = firstSentence(s);
  s = trimToMaxWords(s, 18);
  return s;
}

function normalizeOptions(options) {
  const goodFallback = "We track retention weekly and act on the data.";
  const evasiveFallback = "We’re seeing strong momentum and will share details soon.";
  return {
    good: normalizeOptionText(options?.good, goodFallback),
    evasive: normalizeOptionText(options?.evasive, evasiveFallback),
  };
}

function randomOptionsOrder() {
  return Math.random() < 0.5 ? ["good", "evasive"] : ["evasive", "good"];
}

function normalizeHostPayload(parsed) {
  const text = parsed?.text ?? "Welcome. What is the single biggest risk to your business?";
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

// --- ENDPOINTS ---

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: Boolean(GEMINI_API_KEY) });
});

app.post("/api/init", async (req, res) => {
  try {
    if (!genAI) {
      console.error("Missing API Key");
      return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });
    }

    const company = req.body?.company;
    if (!company?.name || !company?.mission) {
      return res.status(400).json({ error: "Missing company fields" });
    }

    const sessionId = crypto.randomUUID();

    // 1. Get the Model (UPDATED MODEL NAME)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash", // <--- UPDATED HERE
      systemInstruction: createSystemInstruction(company),
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // 2. Start Chat
    const chat = model.startChat({
        history: [] 
    });
    
    sessions.set(sessionId, chat);

    console.log("[init] session:", sessionId, "company:", company.name);

    // 3. Send First Message
    const result = await chat.sendMessage(
      "Start the show. Introduce the guest and ask the first opening question (Stage 1). Include two options (good/evasive)."
    );
    
    // 4. Parse Response
    const responseText = result.response.text();
    const parsed = safeParseJson(responseText);
    
    if (!parsed) {
      console.error("[init] bad json:", responseText);
      throw new Error("Invalid JSON from Gemini");
    }

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
    if (!genAI) return res.status(500).json({ error: "Server missing GEMINI_API_KEY" });

    const { sessionId, message, selectedKey } = req.body || {};
    const chatSession = sessions.get(sessionId);

    if (!sessionId || !chatSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    const sel = selectedKey === "evasive" ? "evasive" : "good";
    const msg = typeof message === "string" ? message : "";
    const wrapped = `CEO selected "${sel}". The selected answer text was:\n${msg}`;

    console.log("[chat]", sessionId, "user:", sel);

    const result = await chatSession.sendMessage(wrapped);
    const responseText = result.response.text();

    const parsed = safeParseJson(responseText);

    if (!parsed) {
      console.error("[chat] bad json:", responseText);
      throw new Error("Invalid JSON from Gemini");
    }

    const normalized = normalizeHostPayload(parsed);
    normalized.category = selectionToCategory(sel);

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

app.post("/api/summary", async (req, res) => {
  try {
    const { sessionId, wrongAnswerText } = req.body;
    
    if (!wrongAnswerText) {
      return res.json({ producerNote: "Flawless execution. You stayed on message and controlled the narrative perfectly." });
    }

    const chatSession = sessions.get(sessionId);
    if (!chatSession) {
      return res.json({ producerNote: "Great effort, but try to avoid vague answers next time." });
    }

    const prompt = `
      The interview is over. I need a "Producer's Note" based on the user's mistake.
      The user selected this EVASIVE answer: "${wrongAnswerText}"
      
      Identify the trap (Emotional, Process, or Status) and output JSON:
      {
        "producerNote": "Great work! One thing for future interviews: The market reacted negatively to '${wrongAnswerText}'. That's usually because you [INSERT REASON]. Next time try and always link your answers to something tangible."
      }
    `;

    const result = await chatSession.sendMessage(prompt);
    const responseText = result.response.text();
    const parsed = safeParseJson(responseText);

    if (!parsed) throw new Error("Summary parsing failed");
    res.json(parsed);

  } catch (err) {
    console.error("[summary] error:", err);
    res.json({ producerNote: "Great effort. You had strong moments, but watch out for evasive answers." });
  }
});

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
