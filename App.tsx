import React, { useEffect, useRef, useState } from "react";
import {
  GamePhase,
  CompanyProfile,
  Message,
  InterviewState,
  AnswerCategory,
  WorstAnswer,
  AnswerOptions,
  AnswerOptionKey,
  GeminiResponse,
} from "./types";
import { STARTING_STOCK_PRICE, TOTAL_QUESTIONS } from "./constants";
import * as GeminiService from "./services/geminiService";
import BroadcastUI from "./components/BroadcastUI";
import Studio3D from "./components/Studio3D";

import { scoreAnswer } from "./game-rules";

import {
  Monitor,
  Briefcase,
  Play,
  Calendar,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Map button -> scoring bucket (keep categories as 3 buckets for host + rules)
function optionKeyToScoreCategory(key: AnswerOptionKey): AnswerCategory {
  if (key === "good") return "good";
  if (key === "evasive") return "evasive";
  // ok
  return "good";
}

function App() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [company, setCompany] = useState<CompanyProfile>({ name: "", mission: "" });

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isJournalistTalking, setIsJournalistTalking] = useState(false);

  const [answerOptions, setAnswerOptions] = useState<AnswerOptions | null>(null);
  const [isAnswerLocked, setIsAnswerLocked] = useState(false);

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
    questionCount: 0,
    maxQuestions: TOTAL_QUESTIONS,
  });

  const lastQuestionRef = useRef<string | undefined>(undefined);

  // ---- AUDIO ----
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

  const clearTimers = () => {};

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (company.name && company.mission) startInterview();
  };

  const startInterview = async () => {
    clearTimers();
    setMessages([]);
    lastQuestionRef.current = undefined;

    setAnswerOptions(null);
    setIsAnswerLocked(false);

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
      questionCount: 0,
      maxQuestions: TOTAL_QUESTIONS,
    });

    setPhase(GamePhase.INTRO);
    await startAudio();

    window.setTimeout(async () => {
      setPhase(GamePhase.INTERVIEW);
      setIsLoading(true);

      try {
        const opening = (await GeminiService.initInterview(company)) as GeminiResponse;

        postJournalistLine(opening.text);
        lastQuestionRef.current = opening.text;

        setAnswerOptions(opening.options ?? null);
        setIsAnswerLocked(false);

        setInterviewState((prev) => ({
          ...prev,
          startedAtMs: Date.now(),
          questionAskedAtMs: Date.now(),
          awaitingAnswer: true,
          questionCount: 1,
          maxQuestions: TOTAL_QUESTIONS,
        }));
      } catch (err) {
        console.error(err);
        postJournalistLine(
          "We’ve hit a technical issue. Refresh and try again in a moment.",
          { category: "bad" }
        );
        setAnswerOptions(null);
        setInterviewState((prev) => ({ ...prev, awaitingAnswer: false }));
      } finally {
        setIsLoading(false);
      }
    }, 3000);
  };

  const postMessage = (msg: Message) => setMessages((prev) => [...prev, msg]);

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
    postMessage({ id: Date.now().toString(), sender: "user", text });
  };

  const applyDeltaAndCheck = (delta: number, worst?: WorstAnswer) => {
    setInterviewState((prev) => {
      const nextPrice = Number((prev.stockPrice + delta).toFixed(2));
      const clamped = Math.max(0, nextPrice);
      const lowestPrice = Math.min(prev.lowestPrice, clamped);

      let worstAnswer = prev.worstAnswer;
      if (worst && (worstAnswer == null || worst.delta > worstAnswer.delta)) {
        worstAnswer = worst;
      }

      let audienceSentiment = prev.audienceSentiment;
      if (delta > 0) audienceSentiment += 6;
      if (delta < 0) audienceSentiment -= 8;
      audienceSentiment = Math.max(0, Math.min(100, audienceSentiment));

      return { ...prev, stockPrice: clamped, lowestPrice, audienceSentiment, worstAnswer };
    });
  };

  const resolveSelectedAnswer = async (
    selectedText: string,
    selectedKind: AnswerOptionKey
  ) => {
    setInterviewState((prev) => ({ ...prev, awaitingAnswer: false }));
    setIsAnswerLocked(true);
    setIsLoading(true);

    const scoreCategory = optionKeyToScoreCategory(selectedKind);

    try {
      const response = (await GeminiService.sendUserAnswer(selectedText)) as GeminiResponse;

      const ctx = {
        category: scoreCategory,
        isContradiction: Boolean(response?.isContradiction),
        evasiveStreakBefore: interviewState.evasiveStreak,
        timeLeftMs: 60_000,
        answerText: selectedText,
      };

      const scored = scoreAnswer(ctx);

      let finalDelta = clamp(scored.delta, -5, 5);

      // Button-specific move bands
      if (selectedKind === "good") finalDelta = clamp(finalDelta, 0.8, 3.5);
      if (selectedKind === "ok") finalDelta = clamp(finalDelta, 0.1, 0.8);
      if (selectedKind === "evasive") finalDelta = clamp(finalDelta, -3.5, -0.1);

      // Contradiction should always hurt, regardless of button
      if (response?.isContradiction) {
        finalDelta = Math.min(finalDelta, -0.8);
      }

      setInterviewState((prev) => ({ ...prev, evasiveStreak: scored.nextEvasiveStreak }));

      const worst: WorstAnswer | undefined =
        finalDelta < 0
          ? {
              userText: selectedText,
              questionText: lastQuestionRef.current,
              category: scoreCategory,
              delta: finalDelta,
              reason: response?.reason,
              atTimeLeftMs: 0,
            }
          : undefined;

      postJournalistLine(response.text, {
        stockImpact: finalDelta,
        microcopy: scored.microcopy,
        flash: scored.flash,
        tick: scored.tick,
        category: scoreCategory,
      });

      applyDeltaAndCheck(finalDelta, worst);

      setInterviewState((prev) => {
        if (prev.outcome === "failure") return prev;

        if (prev.questionCount >= prev.maxQuestions) {
          clearTimers();
          stopAudio();
          setPhase(GamePhase.SUMMARY);
          return { ...prev, awaitingAnswer: false, outcome: "success" };
        }

        lastQuestionRef.current = response.text;

        return {
          ...prev,
          awaitingAnswer: true,
          questionCount: prev.questionCount + 1,
          questionAskedAtMs: Date.now(),
        };
      });

      setAnswerOptions(response.options ?? null);
      setIsAnswerLocked(false);
    } catch (err) {
      console.error(err);
      postJournalistLine("I can’t get a response right now. Try again.", { category: "bad" });
      setAnswerOptions(null);
      setIsAnswerLocked(false);
      setInterviewState((prev) => ({ ...prev, awaitingAnswer: true }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAnswer = async (kind: AnswerOptionKey) => {
    if (phase !== GamePhase.INTERVIEW) return;
    if (isLoading || isAnswerLocked) return;
    if (!interviewState.awaitingAnswer) return;
    if (!answerOptions) return;

    const selectedText = answerOptions[kind];

    postUserLine(selectedText);
    await resolveSelectedAnswer(selectedText, kind);
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
                You're live on the nation&apos;s toughest news channel.{" "}
                <span className="text-yellow-500 font-semibold">
                  Every answer moves markets.
                </span>
              </p>
            </div>

            <div className="px-6 md:px-8 flex-1 overflow-y-auto">
              <form onSubmit={handleSetupSubmit} className="space-y-5 pb-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">
                    Company Name
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-3.5 text-zinc-500" size={18} />
                    <input
                      required
                      className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 pl-10 pr-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                      placeholder="e.g. OmniCorp"
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    />
                  </div>
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
                    onChange={(e) => setCompany({ ...company, mission: e.target.value })}
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

            <form id="__setupForm__" onSubmit={handleSetupSubmit} className="hidden" />
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

  // SUMMARY (unchanged)
  if (phase === GamePhase.SUMMARY) {
    const finalPrice = interviewState.stockPrice;
    const delta = Number((finalPrice - STARTING_STOCK_PRICE).toFixed(2));
    const isUp = delta >= 0;

    const head = isUp ? "A STAR IS BORN" : "CUT TO COMMERCIAL";
    const subhead = isUp ? "The board want to congratulate you" : "Confidence collapsed on air.";

    const producerNote = isUp
      ? "The market just responded to your vision. Now, let’s transform that narrative into a content strategy that lands with your ideal clients."
      : "Your vision is there, but the delivery is getting lost in translation. Let's fix your narrative before the market tunes out for good.";

    const ScoreIcon = isUp ? TrendingUp : TrendingDown;

    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-4 font-sans z-50 overflow-hidden">
        <div className={`absolute inset-0 ${isUp ? "bg-emerald-900/10" : "bg-red-900/10"}`}></div>
        <div className="scanlines"></div>

        <div className="max-w-2xl w-full bg-zinc-900 p-6 md:p-10 rounded-3xl border-2 border-zinc-800 text-center relative z-10 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
          <div className="shrink-0 flex justify-center">
            <div
              className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${
                isUp ? "bg-emerald-500 text-black" : "bg-red-500 text-white"
              }`}
            >
              <Monitor size={40} />
            </div>
          </div>

          <h2 className="text-3xl md:text-5xl font-black mb-2 uppercase tracking-tight shrink-0">
            {head}
          </h2>
          <p className="text-zinc-400 text-lg md:text-xl mb-8 shrink-0">{subhead}</p>

          <div className="bg-black/40 p-6 rounded-xl border border-zinc-800 mb-6 shrink-0">
            <div className="text-zinc-500 text-sm uppercase font-bold mb-2">Final Score</div>

            <div className="flex items-center justify-center gap-3">
              <ScoreIcon size={22} className={isUp ? "text-emerald-400" : "text-red-400"} />
              <div
                className={`text-4xl md:text-5xl font-mono font-bold ${
                  isUp ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {finalPrice.toFixed(2)}
              </div>
            </div>

            <div className="mt-3 text-sm font-mono text-zinc-400">
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(2)} from {STARTING_STOCK_PRICE.toFixed(2)}
            </div>
          </div>

          <div className="bg-zinc-800/50 p-6 rounded-xl text-left mb-8 border border-zinc-700/50 shrink-0">
            <div className="text-zinc-500 text-xs font-bold uppercase mb-2">Producer&apos;s Note</div>
            <div className="text-zinc-200 text-base leading-relaxed">{producerNote}</div>
          </div>

          <div className="shrink-0 pb-2 flex flex-col items-center gap-4 w-full">
            <a
              href="https://www.honest-ink.com/contact"
              target="_blank"
              rel="noopener noreferrer"
              className={`group text-black font-black uppercase px-8 py-4 rounded-full tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl w-full md:w-auto min-w-[300px] ${
                isUp ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
              }`}
            >
              <Calendar size={20} className="text-zinc-900" />
              BOOK YOUR EDITORIAL BRIEFING
            </a>

            <button
              onClick={() => window.location.reload()}
              className="text-zinc-600 hover:text-white text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2 transition-colors py-2"
            >
              <RefreshCcw size={12} />
              Replay
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
          isLoading={isLoading}
          companyName={company.name}
          answerOptions={answerOptions ?? undefined}
          isAnswerLocked={isAnswerLocked || isLoading || !interviewState.awaitingAnswer}
          onSelectAnswer={handleSelectAnswer}
        />
      </div>
    </div>
  );
}

export default App;
