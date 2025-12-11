export enum GamePhase {
  SETUP = 'SETUP',
  INTRO = 'INTRO',
  INTERVIEW = 'INTERVIEW',
  SUMMARY = 'SUMMARY',
}

export interface CompanyProfile {
  name: string;
  industry: string;
  mission: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'journalist';
  text: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  stockImpact?: number;
}

export interface InterviewState {
  stockPrice: number;
  audienceSentiment: number; // 0-100
  questionCount: number;
  maxQuestions: number;
}

export interface GeminiResponse {
  text: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  stockChange: number;
  isInterviewOver: boolean;
}
