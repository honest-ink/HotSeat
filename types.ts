export enum GamePhase {
  SETUP = "SETUP",
  INTRO = "INTRO",
  INTERVIEW = "INTERVIEW",
  SUMMARY = "SUMMARY",
}

// Scoring categories (what rules + server judgement use)
export type AnswerCategory = "good" | "evasive" | "bad";

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

  // optional UI decoration for host lines
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

  // Server judgement of the *previous* user answer (still 3 buckets)
  category: AnswerCategory;

  isContradiction: boolean;
  sentiment?: "positive" | "negative" | "neutral";
  reason?: string;

  // NEW: options for the next answer selection
  options?: AnswerOptions;

  // Keep for compatibility (you still end client-side)
  isInterviewOver: boolean;
}

