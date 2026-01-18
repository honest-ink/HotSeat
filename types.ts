export enum GamePhase {
  SETUP = "SETUP",
  INTRO = "INTRO",
  INTERVIEW = "INTERVIEW",
  SUMMARY = "SUMMARY",
}

// Main scoring categories you use in the app/rules
export type AnswerCategory = "good" | "ok" | "evasive" | "bad";

// The 3 button choices presented to the user
export type AnswerOptionKey = "good" | "ok" | "evasive";

export type AnswerOptions = {
  good: string;
  ok: string;
  evasive: string;
};

export interface CompanyProfile {
  name: string;
  mission: string;
}

export interface Message {
  id: string;
  sender: "user" | "journalist";
  text: string;
  sentiment?: "positive" | "negative" | "neutral";
  stockImpact?: number;
  category?: AnswerCategory;
  microcopy?: string;
  flash?: "red";
  tick?: "up" | "down";
}

export interface WorstAnswer {
  userText: string;
  questionText?: string;
  category: AnswerCategory;
  delta: number;
  reason?: string;
  atTimeLeftMs?: number;
}

export interface InterviewState {
  stockPrice: number;
  lowestPrice: number;
  awaitingAnswer: boolean;
  evasiveStreak: number;
  audienceSentiment: number; // 0-100
  outcome?: "success" | "failure";
  worstAnswer?: WorstAnswer;

  startedAtMs?: number;
  questionAskedAtMs?: number;

  // Turn-based interview progress
  questionCount: number; // current turn (1..maxQuestions)
  maxQuestions: number; // total turns (e.g. 3)
}

export interface GeminiResponse {
  // Host spoken line (acknowledgement + next question)
  text: string;

  // Category of the last user answer (or what the server mirrored)
  category: AnswerCategory;

  isContradiction: boolean;
  sentiment?: "positive" | "negative" | "neutral";
  reason?: string;

  // NEW: options for the next answer selection
  options?: AnswerOptions;

  // Turn-based completion (you still control this client-side, but keep it)
  isInterviewOver: boolean;
}
