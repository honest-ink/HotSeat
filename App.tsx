import React, { useEffect, useRef, useState } from "react";
import {
  GamePhase,
  CompanyProfile,
  Message,
  InterviewState,
  GeminiResponse,
  AnswerCategory,
  WorstAnswer,
} from "./types";
import {
  STARTING_STOCK_PRICE,
  FAIL_STOCK_PRICE,
  TOTAL_QUESTIONS,
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

// ADDED: small clamp helper for stock moves
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function App() {
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
    awaitingAnswer: false,
    evasiveStreak: 0,
    audienceSentiment: 50,
    outcome: undefined,
    worstAnswer: undefined,
    startedAtMs: undefined,
    questionAskedAtMs: undefined,

    // turn-based
    questionCount: 0,
    maxQuestions: TOTAL_QUESTIONS,
  });

  const lastQuestionRef = useRef<string | undefined>(undefined);

  // ---- AUDIO (created on mount, started on "Go Live") ----
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/audio/news-agency.mp3");
    audio.preload = "auto";
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
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
    } catch {
      // ignore autoplay blocks
    }
  };

  const stopAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };

  // timer cleanup no longer needed, but keep a no-op for existing calls
  const clearTimers = () => {};

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (company.name && company.industry && company.mission) {
      startInterview();
    }
  };

  const startInterview = async () => {
    // reset state for a clean run
    clearTimers();
    setMessages([]);
    lastQuestionRef.current = undefined;

    setInterviewState({
      stockPrice: STARTING_STOCK_PRICE,
      lowestPrice: STARTING_STOCK_PRICE,
      awaitingAnswer: false,
      evasiveStreak: 0,
      audienceSentiment: 50,
      outcome: undefined,
      worstAnswer: undefined,
      startedAtMs: undefined,
      questionAskedAtMs: undefined,

      // turn-based
      questionCount: 0,
      maxQuestions: TOTAL_QUESTIONS,
    });

    setPhase(GamePhase.INTRO);

    await startAudio();

    // Keep your 3s intro screen
    window.setTimeout(async () => {
      setPhase(GamePhase.INTERVIEW);
      setIsLoading(true);

      const opening = await GeminiService.initInterview(company);

      // first journalist message = first question delivered
      postJournalistLine(opening.text, {
        category: undefined,
        microcopy: undefined,
        stockImpact: undefined,
        flash: undefined,
        tick: undefined,
      });

      // mark first turn as active
      lastQuestionRef.current = opening.text;
      setInterviewState((prev) => ({
        ...prev,
        startedAtMs: Date.now(),
        questionAskedAtMs: Date.now(),
        awaitingAnswer: true,
        questionCount: 1,
        maxQuestions: TOTAL_QUESTIONS,
      }));

      setIsLoading(false);
    }, 3000);
  };

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
    window.setTimeout(
      () => setIsJournalistTalking(false),
      Math.min(text.length * 50, 3000)
    );

    postMessage({
      id: Date.now().toString(),
      sender: "journalist",
      text,
      stockImpact: opts?.stockImpact,
      microcopy: opts?.microcopy,
      flash: opts?.flash,
      tick: opts?.tick,
      category: opts?.category,
    });
  };

  const postUserLine = (text: string) => {
    postMessage({
      id: Date.now().toString(),
      sender: "user",
      text,
    });
  };

  const applyDeltaAndCheck = (delta: number, worst?: WorstAnswer) => {
    setInterviewState((prev) => {
      const nextPrice = Number((prev.stockPrice + delta).toFixed(2));
      const clamped = Math.max(0, nextPrice);
      const lowestPrice = Math.min(prev.lowestPrice, clamped);

      let worstAnswer = prev.worstAnswer;
      if (worst && (worstAnswer == null || worst.delta > worstAnswer.delta)) {
        // "worst" has negative delta; smaller means worse (e.g. -4 < -2).
        worstAnswer = worst;
      }

      // cosmetic sentiment (optional)
      let audienceSentiment = prev.audienceSentiment;
      if (delta > 0) audienceSentiment += 6;
      if (delta < 0) audienceSentiment -= 8;
      audienceSentiment = Math.max(0, Math.min(100, audienceSentiment));

      return {
        ...prev,
        stockPrice: clamped,
        lowestPrice,
        audienceSentiment,
        worstAnswer,
      };
    });
  };

  const resolveAnswer = async (userText: string) => {
    setInterviewState((prev) => ({ ...prev, awaitingAnswer: false }));

    setIsLoading(true);

    const response = await GeminiService.sendUserAnswer(userText);

    // compute delta using your rules
    const ctx = {
      category: response.category,
      isContradiction: response.isContradiction,
      evasiveStreakBefore: interviewState.evasiveStreak,
      timeLeftMs: undefined,
    };

    const scored = scoreAnswer(ctx);

    // Market move comes only from your deterministic rules now
    let finalDelta = clamp(scored.delta, -5, 5);

    // Optional consistency guard: don't allow "good" to drop or "bad" to rise unless contradiction
    if (!response.isContradiction) {
      if (response.category === "good") finalDelta = Math.max(0, finalDelta);
      if (response.category === "bad") finalDelta = Math.min(0, finalDelta);
      if (response.category === "evasive") finalDelta = clamp(finalDelta, -1, 1);
    }

    // update evasive streak + apply delta
    setInterviewState((prev) => ({
      ...prev,
      evasiveStreak: scored.nextEvasiveStreak,
    }));

    const worst: WorstAnswer | undefined =
      finalDelta < 0
        ? {
            userText,
            questionText: lastQuestionRef.current,
            category: response.isContradiction ? "bad" : response.category,
            delta: finalDelta,
            reason: response.reason,
            atTimeLeftMs: 0,
          }
        : undefined;

    // journalist replies (your current backend returns a line here)
    postJournalistLine(response.text, {
      stockImpact: finalDelta,
      microcopy: scored.microcopy,
      flash: scored.flash,
      tick: scored.tick,
      category: response.category,
    });

    applyDeltaAndCheck(finalDelta, worst);

    setIsLoading(false);

    // turn-based progression + success condition
    setInterviewState((prev) => {
      // If we already failed, phase is SUMMARY and awaitingAnswer is false.
      if (prev.outcome === "failure") return prev;

      // If we just answered the last question, end the interview successfully.
      if (prev.questionCount >= prev.maxQuestions) {
        clearTimers();
        stopAudio();
        setPhase(GamePhase.SUMMARY);
        return {
          ...prev,
          awaitingAnswer: false,
          outcome: "success",
        };
      }

      // Otherwise, advance to next question turn.
      // The backend response text above is assumed to contain the next prompt.
      lastQuestionRef.current = response.text;

      return {
        ...prev,
        awaitingAnswer: true,
        questionCount: prev.questionCount + 1,
        questionAskedAtMs: Date.now(),
      };
    });
  };

  const handleUserResponse = async (text: string) => {
    // only accept if awaiting answer + not loading + still in interview
    if (phase !== GamePhase.INTERVIEW) return;

    setInterviewState((prev) => {
      if (!prev.awaitingAnswer) return prev;
      return prev;
    });

    postUserLine(text);
    await resolveAnswer(text);
  };

  // SETUP
  if (phase === GamePhase.SETUP) {
    return (
      <div className="fixed inset-0 h-[100dvh] w-screen bg-black text-white font-sans overflow-hidden">
        <div className="scanlines"></div>
        <div className="absolute inset-0 bg-[url('https://picsum.photos/1920/1080?grayscale&blur=10')] opacity-20 bg-cover bg-center"></div>

        <div className="relative z-10 h-full w-full flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden max-h-[calc(100dvh-32px)] flex flex-col">
            <div className="p-6 md:p-8 pb-4 md:pb-6">
              <div className="flex items-center gap-3 mb-4 text-yellow-500">
                <Monitor size={32} />
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter">
                  The Hot Seat
                </h1>
              </div>

              <p className="text-zinc-400 text-base md:text-lg">
                You’re live on the nation's toughest network.{" "}
                <span className="text-yellow-500 font-semibold">
                  Every answer moves markets.
                </span>
                  Stay sharp and watch your share price climb. Slip up and the board will be
                calling for your head.
              </p>
            </div>

            <div className="px-6 md:px-8 flex-1 overflow-y-auto">
              <form onSubmit={handleSetupSubmit} className="space-y-5 pb-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">
                    Company Name
                  </label>
                  <div className="relative">
                    <Briefcase
                      className="absolute left-3 top-3.5 text-zinc-500"
                      size={18}
                    />
                    <input
                      required
                      className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 pl-10 pr-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                      placeholder="e.g. OmniCorp"
                      value={company.name}
                      onChange={(e) =>
                        setCompany({ ...company, name: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">
                    Industry
                  </label>
                  <input
                    required
                    className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 px-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                    placeholder="e.g. Biotechnology, AI Defense, Fast Food"
                    value={company.industry}
                    onChange={(e) =>
                      setCompany({ ...company, industry: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">
                    Mission Statement (The Pitch)
                  </label>
                  <textarea
                    required
                    className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 px-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all h-24 resize-none"
                    placeholder="We make the world better by..."
                    value={company.mission}
                    onChange={(e) =>
                      setCompany({ ...company, mission: e.target.value })
                    }
                  />
                </div>

                <div className="h-2" />
              </form>
            </div>

            <div className="px-6 md:px-8 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 bg-gradient-to-t from-black/70 via-black/40 to-transparent border-t border-white/5">
              <button
                type="submit"
                form="__setupForm__"
                onClick={handleSetupSubmit as any}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase py-4 rounded-lg tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
              >
                <Play size={20} /> Go Live
              </button>
            </div>

            <form
              id="__setupForm__"
              onSubmit={handleSetupSubmit}
              className="hidden"
            />
          </div>
        </div>
      </div>
    );
  }

  // INTRO
  if (phase === GamePhase.INTRO) {
    return (
      <div className="fixed inset-0 h-[100dvh] w-screen bg-black flex items-center justify-center overflow-hidden">
        <div className="scanlines"></div>

        <div className="flex flex-col items-center justify-center text-center px-6">
          <h1
            className="
              font-black text-white uppercase
              text-[18vw] sm:text-[14vw] md:text-8xl
              tracking-[0.15em]
              leading-none
              whitespace-nowrap
              max-w-full
            "
          >
            LIVE
          </h1>

          <p className="mt-4 text-red-500 font-mono text-sm md:text-xl tracking-widest">
            CONNECTING TO SATELLITE...
          </p>
        </div>
      </div>
    );
  }

  // SUMMARY
  if (phase === GamePhase.SUMMARY) {
    const outcome =
      interviewState.outcome ??
      (interviewState.stockPrice >= FAIL_STOCK_PRICE ? "success" : "failure");
    const isSuccess = outcome === "success";

    const worst = interviewState.worstAnswer;

    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-4 font-sans z-50 overflow-hidden">
        <div className="absolute inset-0 bg-red-900/10"></div>
        <div className="scanlines"></div>

        <div className="max-w-2xl w-full bg-zinc-900 p-6 md:p-10 rounded-3xl border-2 border-zinc-800 text-center relative z-10 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
          <div className="shrink-0 flex justify-center">
            <div
              className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${
                isSuccess ? "bg-yellow-500 text-black" : "bg-red-500 text-white"
              }`}
            >
              <Monitor size={40} />
            </div>
          </div>

          <h2 className="text-3xl md:text-5xl font-black mb-2 uppercase tracking-tight shrink-0">
            {isSuccess ? "Segment Survived" : "Cut To Commercial"}
          </h2>
          <p className="text-zinc-400 text-lg md:text-xl mb-8 shrink-0">
            {isSuccess
              ? "You survived the interview — barely."
              : "Confidence collapsed on-air."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 shrink-0">
            <div className="bg-black/40 p-6 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-sm uppercase font-bold mb-1">
                Starting Price
              </div>
              <div className="text-3xl font-mono font-bold">
                {STARTING_STOCK_PRICE.toFixed(2)}
              </div>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-sm uppercase font-bold mb-1">
                Lowest Price
              </div>
              <div className="text-3xl font-mono font-bold text-white">
                {interviewState.lowestPrice.toFixed(2)}
              </div>
            </div>

            <div className="bg-black/40 p-6 rounded-xl border border-zinc-800">
              <div className="text-zinc-500 text-sm uppercase font-bold mb-1">
                Final Price
              </div>
              <div
                className={`text-3xl font-mono font-bold ${
                  isSuccess ? "text-yellow-400" : "text-red-400"
                }`}
              >
                {interviewState.stockPrice.toFixed(2)}
              </div>
            </div>
          </div>

          {worst && (
            <div className="bg-zinc-800/50 p-6 rounded-xl text-left mb-8 border border-zinc-700/50 shrink-0">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-yellow-500 shrink-0 mt-1" />
                <div className="w-full">
                  <h3 className="font-bold text-lg mb-2">
                    Worst Answer ({worst.category.toUpperCase()}{" "}
                    {worst.delta.toFixed(2)})
                  </h3>
                  {worst.questionText && (
                    <div className="text-zinc-300 text-sm mb-2">
                      <span className="font-bold">Q:</span> {worst.questionText}
                    </div>
                  )}
                  <div className="text-zinc-300 text-sm">
                    <span className="font-bold">A:</span> {worst.userText}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="shrink-0 pb-2 flex flex-col items-center gap-4 w-full">
            <a
              href="https://calendar.app.google/F1z9UmnTGLYX3nhk7"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-white hover:bg-yellow-500 text-black font-black uppercase px-8 py-4 rounded-full tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl w-full md:w-auto min-w-[300px]"
            >
              <Calendar size={20} className="text-zinc-900" />
              Speak to a Journalist
            </a>

            <button
              onClick={() => window.location.reload()}
              className="text-zinc-600 hover:text-white text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2 transition-colors py-2"
            >
              <RefreshCcw size={12} />
              Replay Simulation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // INTERVIEW
  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-transparent pb-[env(safe-area-inset-bottom)]">
      <div className="scanlines"></div>

      <div className="absolute inset-0 z-0">
        <Studio3D
          isTalking={isJournalistTalking}
          sentiment={
            interviewState.audienceSentiment > 60
              ? "positive"
              : interviewState.audienceSentiment < 40
              ? "negative"
              : "neutral"
          }
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 z-10"
        style={{
          top: "28%",
          bottom: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 22%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.85) 78%, rgba(0,0,0,1) 100%)",
        }}
      />

      <div className="absolute inset-0 z-20">
        <BroadcastUI
          messages={messages}
          state={interviewState}
          onSendMessage={handleUserResponse}
          isLoading={isLoading}
          companyName={company.name}
        />
      </div>
    </div>
  );
}

export default App;
