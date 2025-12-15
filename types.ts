export enum GamePhase {
  SETUP = "SETUP",
  INTRO = "INTRO",
  INTERVIEW = "INTERVIEW",
  SUMMARY = "SUMMARY",
}

export interface CompanyProfile {
  name: string;
  industry: string;
  mission: string;
}

export type Sender = "user" | "journalist";

export type AnswerCategory = "good" | "evasive" | "bad";

export type SummaryOutcome = "success" | "failure";

export interface WorstAnswer {
  userText: string;
  questionText?: string;
  category: AnswerCategory;
  delta: number; // negative number
  reason?: string; // optional internal/debug, not player-facing
  atTimeLeftMs: number;
}

export interface Message {
  id: string;
  sender: Sender;
  text: string;

  // keep if you want Studio3D / tone
  sentiment?: "positive" | "negative" | "neutral";

  // now: use this for the computed delta you applied, not Gemini's raw value
  stockImpact?: number;

  // helpful for UI + summary
  category?: AnswerCategory;
  microcopy?: string;
  flash?: "red";
  tick?: "up" | "down";
}

export interface InterviewState {
  // core
  stockPrice: number;
  lowestPrice: number;

  // timer
  timeLeftMs: number;
  startedAtMs?: number;

  // gating
  awaitingAnswer: boolean;
  questionAskedAtMs?: number;

  // pressure rules
  evasiveStreak: number;

  // result tracking
  outcome?: SummaryOutcome;
  worstAnswer?: WorstAnswer;

  // optional: keep if you like your Studio3D mood mapping
  audienceSentiment: number; // 0–100
}

/**
 * Gemini should no longer dictate the stock change.
 * It should:
 * - ask the next question (text)
 * - classify the user's answer
 * - flag contradictions
 */
export interface GeminiResponse {
  text: string; // journalist next question or response line
  category: AnswerCategory;
  isContradiction: boolean;

  // optional extras
  sentiment?: "positive" | "negative" | "neutral";
  reason?: string; // for debugging during dev, don’t show to player
}
