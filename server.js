const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 8080;

// Parse JSON bodies for /api requests
app.use(express.json());

// API route: browser -> your server -> Gemini
app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const message = req.body?.message;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message" });
    }

    // Import in a way that works from CommonJS
    const { GoogleGenerativeAI } = await import("@google/generative-ai");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(message);
    const text = result.response.text();

    return res.json({ text });
  } catch (err) {
    console.error("Gemini error:", err);
    return res.status(500).json({ error: "Gemini call failed" });
  }
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback (keep LAST)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Bind for Cloud Run
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
