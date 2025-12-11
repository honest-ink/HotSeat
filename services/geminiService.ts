import { GoogleGenAI, Type, Chat } from "@google/genai";
import { CompanyProfile, GeminiResponse } from "../types";

let chatSession: Chat | null = null;

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

export const initInterview = async (company: CompanyProfile): Promise<GeminiResponse> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });

  chatSession = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: createSystemInstruction(company),
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          sentiment: { type: Type.STRING, enum: ['positive', 'negative', 'neutral'] },
          stockChange: { type: Type.NUMBER },
          isInterviewOver: { type: Type.BOOLEAN },
        },
        required: ["text", "sentiment", "stockChange", "isInterviewOver"]
      }
    }
  });

  // Initial trigger to start the conversation
  try {
    const response = await chatSession.sendMessage({ 
      message: "Start the show. Introduce the guest to the audience and ask the first opening question. Be dramatic." 
    });
    
    // Parse the JSON
    const data = JSON.parse(response.text || "{}") as GeminiResponse;
    return data;
  } catch (err) {
    console.error("Failed to start interview", err);
    return {
      text: "Welcome to the show. Tell us about your company.",
      sentiment: "neutral",
      stockChange: 0,
      isInterviewOver: false
    };
  }
};

export const sendUserAnswer = async (answer: string): Promise<GeminiResponse> => {
  if (!chatSession) throw new Error("Chat session not initialized");

  try {
    const response = await chatSession.sendMessage({ message: answer });
    const text = response.text || "{}";
    const data = JSON.parse(text) as GeminiResponse;
    return data;
  } catch (err) {
    console.error("Gemini Error", err);
    return {
      text: "We seem to be having technical difficulties. Let's move on.",
      sentiment: "neutral",
      stockChange: -1.5,
      isInterviewOver: false
    };
  }
};