import { CompanyProfile, GeminiResponse } from "../types";

let companyProfile: CompanyProfile | null = null;

const createSystemInstruction = (company: CompanyProfile) => `
You are Alex Sterling, the ruthless but charismatic host of the prime-time business news show "The Hot Seat".
You are interviewing the CEO of "${company.name}", a company in the "${company.industry}" industry.
Their mission is: "${company.mission}".

Your Goal: Grill them. Be skeptical but fair. React to their answers dynamically.
- If they give a vague answer, press them.
- If they give a great answer, acknowledge it but move to the next hard hitting question.
- Keep your responses punchy and suitable for TV (under 40 words usually).

You must output your response in JSON format ONLY.
The JSON structure must be:
{
  "text": "Your spoken response/question to the guest",
  "sentiment": "positive" | "negative" | "neutral" (How the audience/market reacts to the user's last answer),
  "stockChange": number (Between -5.0 and +5.0, representing immediate stock price impact),
  "isInterviewOver": boolean (Set to true only after 8-10 exchanges or if they crash and burn completely)
}
`;

// Helper: call your server (Cloud Run) instead of calling Gemini in the browser
async function callServer(prompt: string): Promise<GeminiResponse> {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `Request failed: ${r.status}`);
  }

  const data = (await r.json()) as { text: string };

  // Server returns { text: "..." }. That text should be JSON per your prompt.
  const parsed = JSON.parse(data.text || "{}") as GeminiResponse;

  // Basic safety defaults
  return {
    text: parsed.text ?? "",
    sentiment: parsed.sentiment ?? "neutral",
    stockChange: typeof parsed.stockChange === "number" ? parsed.stockChange : 0,
    isInterviewOver: !!parsed.isInterviewOver,
  };
}

export const initInterview = async (company: CompanyProfile): Promise<GeminiResponse> => {
  companyProfile = company;

  const system = createSystemInstruction(company);
  const prompt =
    system +
    `

Start the show. Introduce the guest to the audience and ask the first opening question. Be dramatic.`;

  try {
    return await callServer(prompt);
  } catch (err) {
    console.error("Failed to start interview", err);
    return {
      text: "Welcome to the show. Tell us about your company.",
      sentiment: "neutral",
      stockChange: 0,
      isInterviewOver: false,
    };
  }
};

export const sendUserAnswer = async (answer: string): Promise<GeminiResponse> => {
  if (!companyProfile) throw new Error("Interview not initialized");

  const system = createSystemInstruction(companyProfile);
  const prompt =
    system +
    `

The guest just answered:
"${answer}"

Respond with the next question/comment in the required JSON format.`;

  try {
    return await callServer(prompt);
  } catch (err) {
    console.error("Gemini Error", err);
    return {
      text: "We seem to be having technical difficulties. Let's move on.",
      sentiment: "neutral",
      stockChange: -1.5,
      isInterviewOver: false,
    };
  }
};
