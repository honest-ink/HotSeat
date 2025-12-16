import React, { useEffect, useRef, useState } from "react";
import {
  GamePhase,
  CompanyProfile,
  Message,
  InterviewState,
  AnswerCategory,
  WorstAnswer,
} from "./types";
import {
  STARTING_STOCK_PRICE,
  FAIL_STOCK_PRICE,
  INTERVIEW_DURATION_MS,
  SILENCE_MS,
  NEXT_QUESTION_MIN_MS,
  NEXT_QUESTION_MAX_MS,
  SILENCE_LINES,
} from "./constants";
import * as GeminiService from "./services/geminiService";
import BroadcastUI from "./components/BroadcastUI";
import Studio3D from "./components/Studio3D";
import { scoreAnswer } from "./game-rules";
import {
  Monitor,
  Briefcase,
  Play,
  AlertCircle,
  Calendar,
  RefreshCcw,
} from "lucide-react";

function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pickOne<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [company, setCompany] = useState<CompanyProfile>({
    name: "",
    industry: "",
    mission: "",
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isJournalistTalking, setIsJournalistTalking] = useState(false);

  const [interviewState, setInterviewState] = useState<InterviewState>({
    stockPrice: STARTING_STOCK_PRICE,
    lowestPrice: STARTING_STOCK_PRICE,
    timeLeftMs: INTERVIEW_DURATION_MS,
    awaitingAnswer: false,
    evasiveStreak: 0,
    audienceSentiment: 50,
  });

  const lastQuestionRef = useRef<string>();
  const timerIntervalRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<number | null>(null);
  const nextQuestionTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ---------------- AUDIO ---------------- */

  useEffect(() => {
    const audio = new Audio("/audio/news-agency.mp3");
    audio.loop = true;
    audio.volume = 0.6;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const startAudio = async () => {
    try {
      await audioRef.current?.play();
    } catch {}
  };

  const stopAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  /* ---------------- TIMERS ---------------- */

  const clearTimers = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (nextQuestionTimeoutRef.current) {
      clearTimeout(nextQuestionTimeoutRef.current);
      nextQuestionTimeoutRef.current = null;
    }
  };

  useEffect(() => clearTimers, []);

  const beginInterviewClock = () => {
    if (timerIntervalRef.current) return;

    setInterviewState((prev) => ({
      ...prev,
      timeLeftMs: INTERVIEW_DURATION_MS,
      awaitingAnswer: true,
    }));

    timerIntervalRef.current = window.setInterval(() => {
      setInterviewState((prev) => {
        if (phase !== GamePhase.INTERVIEW) return prev;

        const next = Math.max(0, prev.timeLeftMs - 200);

        if (next === 0 && prev.stockPrice >= FAIL_STOCK_PRICE) {
          clearTimers();
          stopAudio();
          setPhase(GamePhase.SUMMARY);
          return { ...prev, timeLeftMs: 0, outcome: "success" };
        }

        return { ...prev, timeLeftMs: next };
      });
    }, 200);
  };

  /* ---------------- FLOW ---------------- */

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (company.name && company.industry && company.mission) {
      startInterview();
    }
  };

  const startInterview = async () => {
    clearTimers();
    setMessages([]);
    lastQuestionRef.current = undefined;

    setInterviewState({
      stockPrice: STARTING_STOCK_PRICE,
      lowestPrice: STARTING_STOCK_PRICE,
      timeLeftMs: INTERVIEW_DURATION_MS,
      awaitingAnswer: false,
      evasiveStreak: 0,
      audienceSentiment: 50,
    });

    setPhase(GamePhase.INTRO);
    await startAudio();

    setTimeout(async () => {
      setPhase(GamePhase.INTERVIEW);
      setIsLoading(true);

      const opening = await GeminiService.initInterview(company);

      postJournalistLine(opening.text);
      lastQuestionRef.current = opening.text;

      beginInterviewClock();
      startSilenceTimer();

      setIsLoading(false);
    }, 3000);
  };

  const startSilenceTimer = () => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    silenceTimeoutRef.current = window.setTimeout(() => {
      handleSilence();
    }, SILENCE_MS);
  };

  /* ---------------- MESSAGES ---------------- */

  const postMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  };

  const postJournalistLine = (
    text: string,
    opts?: {
      stockImpact?: number;
      microcopy?: string;
      flash?: "red";
      tick?: "up" | "down";
      category?: AnswerCategory;
    }
  ) => {
    setIsJournalistTalking(true);
    setTimeout(() => setIsJournalistTalking(false), Math.min(3000, text.length * 40));

    postMessage({
      id: Date.now().toString(),
      sender: "journalist",
      text,
      ...opts,
    });
  };

  const postUserLine = (text: string) => {
    postMessage({
      id: Date.now().toString(),
      sender: "user",
      text,
    });
  };

  /* ---------------- ANSWERS ---------------- */

  const applyDeltaAndCheck = (delta: number, worst?: WorstAnswer) => {
    setInterviewState((prev) => {
      const price = Math.max(0, Number((prev.stockPrice + delta).toFixed(2)));
      const lowest = Math.min(prev.lowestPrice, price);

      if (price < FAIL_STOCK_PRICE) {
        clearTimers();
        stopAudio();
        setPhase(GamePhase.SUMMARY);
        return {
          ...prev,
          stockPrice: price,
          lowestPrice: lowest,
          outcome: "failure",
          worstAnswer: worst,
        };
      }

      return {
        ...prev,
        stockPrice: price,
        lowestPrice: lowest,
        worstAnswer: worst ?? prev.worstAnswer,
      };
    });
  };

  const resolveAnswer = async (text: string) => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    setInterviewState((p) => ({ ...p, awaitingAnswer: false }));
    setIsLoading(true);

    const response = await GeminiService.sendUserAnswer(text);

    const scored = scoreAnswer({
      category: response.category,
      isContradiction: response.isContradiction,
      evasiveStreakBefore: interviewState.evasiveStreak,
      timeLeftMs: interviewState.timeLeftMs,
    });

    postJournalistLine(response.text, {
      stockImpact: scored.delta,
      microcopy: scored.microcopy,
      flash: scored.flash,
      tick: scored.tick,
      category: response.category,
    });

    const worst =
      scored.delta < 0
        ? {
            userText: text,
            questionText: lastQuestionRef.current,
            delta: scored.delta,
            category: response.category,
            atTimeLeftMs: interviewState.timeLeftMs,
          }
        : undefined;

    applyDeltaAndCheck(scored.delta, worst);

    setIsLoading(false);

    scheduleNextQuestion();
  };

  const handleUserResponse = async (text: string) => {
    if (phase !== GamePhase.INTERVIEW || !interviewState.awaitingAnswer) return;
    postUserLine(text);
    await resolveAnswer(text);
  };

  const handleSilence = () => {
    if (phase !== GamePhase.INTERVIEW) return;

    const line = pickOne(SILENCE_LINES);

    postJournalistLine(line, {
      stockImpact: -0.75,
      microcopy: "CEO fails to respond",
      flash: "red",
      tick: "down",
      category: "evasive",
    });

    applyDeltaAndCheck(-0.75);

    scheduleNextQuestion();
  };

  const scheduleNextQuestion = () => {
    if (nextQuestionTimeoutRef.current)
      clearTimeout(nextQuestionTimeoutRef.current);

    nextQuestionTimeoutRef.current = window.setTimeout(async () => {
      setIsLoading(true);
      const response = await GeminiService.sendUserAnswer("[NEXT]");
      postJournalistLine(response.text);
      lastQuestionRef.current = response.text;
      startSilenceTimer();
      setInterviewState((p) => ({ ...p, awaitingAnswer: true }));
      setIsLoading(false);
    }, randInt(NEXT_QUESTION_MIN_MS, NEXT_QUESTION_MAX_MS));
  };

  /* ---------------- RENDER ---------------- */

  if (phase === GamePhase.SETUP) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
        <form onSubmit={handleSetupSubmit} className="max-w-xl w-full p-6">
          <h1 className="text-4xl font-black mb-4">The Hot Seat</h1>
          <p className="text-zinc-400 mb-6">
            You’re live on the country’s toughest business news show. Every
            answer moves the market. Keep your company’s share price above
            95.00 for 60 seconds. Fail, and the board will be calling for your
            head.
          </p>
          <input
            placeholder="Company name"
            className="w-full mb-3 p-3 bg-zinc-800"
            onChange={(e) =>
              setCompany((c) => ({ ...c, name: e.target.value }))
            }
          />
          <input
            placeholder="Industry"
            className="w-full mb-3 p-3 bg-zinc-800"
            onChange={(e) =>
              setCompany((c) => ({ ...c, industry: e.target.value }))
            }
          />
          <textarea
            placeholder="Mission"
            className="w-full mb-6 p-3 bg-zinc-800"
            onChange={(e) =>
              setCompany((c) => ({ ...c, mission: e.target.value }))
            }
          />
          <button className="bg-yellow-500 text-black w-full py-3 font-bold">
            Go Live
          </button>
        </form>
      </div>
    );
  }

  if (phase === GamePhase.INTRO) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <h1 className="text-7xl font-black tracking-widest">LIVE</h1>
      </div>
    );
  }

  if (phase === GamePhase.SUMMARY) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
        <button onClick={() => window.location.reload()}>
          Replay Simulation
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <Studio3D isTalking={isJournalistTalking} sentiment="neutral" />
      <BroadcastUI
        messages={messages}
        state={interviewState}
        onSendMessage={handleUserResponse}
        isLoading={isLoading}
        companyName={company.name}
      />
    </div>
  );
}
