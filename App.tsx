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

// With 2 options, the score bucket is just the key.
function optionKeyToScoreCategory(key: AnswerOptionKey): AnswerCategory {
  return key === "good" ? "good" : "evasive";
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

// ---- Tutorial timing control ----
const TUTORIAL_TIME_MULTIPLIER = 3.3;
const tut = (ms: number) => Math.round(ms * TUTORIAL_TIME_MULTIPLIER);

function App() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [company, setCompany] = useState<CompanyProfile>({ name: "", mission: "" });

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isJournalistTalking, setIsJournalistTalking] = useState(false);

  const [answerOptions, setAnswerOptions] = useState<AnswerOptions | null>(null);
  const [optionsOrder, setOptionsOrder] = useState<AnswerOptionKey[] | null>(null);
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

// ---- NEW: Download guide modal state + sessionId capture ----
const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
const [guideEmail, setGuideEmail] = useState("");
const [guideError, setGuideError] = useState<string | null>(null);
const [isGuideLoading, setIsGuideLoading] = useState(false);
const sessionIdRef = useRef<string | null>(null);

const sendGuideEmailToN8n = async (email: string) => {
  const webhookUrl = "https://honest-ink.app.n8n.cloud/webhook/hot-seat";
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "guide_email_submitted",
        email,
        timestamp: new Date().toISOString(),
        sessionId: sessionIdRef.current,
        finalScore: interviewState.stockPrice,
        companyName: company.name,
        companyPitch: company.mission,
      }),
      keepalive: true,
    });
  } catch {
    // ignore logging failures
  }
};

const requestInterviewGuide = async () => {
  setGuideError(null);

  const email = guideEmail.trim();
  if (!email || !email.includes("@")) {
    setGuideError("Enter a valid email.");
    return;
  }

  // non-blocking: don’t wait for this
  void sendGuideEmailToN8n(email);

  setIsGuideLoading(true);
  try {
    const r = await fetch("/api/interview-guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        sessionId: sessionIdRef.current,
        finalScore: interviewState.stockPrice,
        companyName: company.name,
        companyPitch: company.mission,
      }),
    });

    const data = await r.json().catch(() => ({} as any));
    if (!r.ok || !data?.url) {
      throw new Error(data?.error || "Download failed");
    }

    setIsGuideModalOpen(false);
    setGuideEmail("");
    window.location.assign(data.url);
  } catch (e) {
    setGuideError("Couldn’t generate the download. Try again.");
  } finally {
    setIsGuideLoading(false);
  }
};

  // ---- INTRO TUTORIAL ----
  const [isIntroTutorialActive, setIsIntroTutorialActive] = useState(false);
  const introTutorialRanRef = useRef(false);

  // Tutorial overlay UI
  const [tutorialText, setTutorialText] = useState<string>("");
  const [highlightAnswerKey, setHighlightAnswerKey] = useState<AnswerOptionKey | null>(null);
  const [tickerDirectionOverride, setTickerDirectionOverride] = useState<"up" | "down" | null>(null);
  const [showTickerPointer, setShowTickerPointer] = useState(false);

  // increments to re-trigger ticker pulse animation on demand
  const [tickerPulseSeq, setTickerPulseSeq] = useState(0);

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

  const startFirstGeminiQuestion = async () => {
    setIsLoading(true);

    try {
      const opening = (await GeminiService.initInterview(company)) as GeminiResponse;

      // NEW: store sessionId for the download endpoint (if returned)
      sessionIdRef.current = (opening as any)?.sessionId ?? null;

      postJournalistLine(opening.text);
      lastQuestionRef.current = opening.text;

      setAnswerOptions(opening.options ?? null);
      setOptionsOrder(opening.optionsOrder ?? null);
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
      setOptionsOrder(null);
      setInterviewState((prev) => ({ ...prev, awaitingAnswer: false }));
    } finally {
      setIsLoading(false);
    }
  };

  const tickPrice = async (
    from: number,
    to: number,
    steps: number,
    totalMs: number
  ) => {
    const stepMs = Math.max(1, Math.floor(totalMs / steps));
    for (let i = 1; i <= steps; i++) {
      const next = from + ((to - from) * i) / steps;
      const nextFixed = Number(next.toFixed(2));
      setInterviewState((prev) => ({ ...prev, stockPrice: nextFixed }));
      await sleep(stepMs);
    }
  };

  const pulseHighlight = (key: AnswerOptionKey, ms = 350) => {
    setHighlightAnswerKey(key);
    window.setTimeout(() => setHighlightAnswerKey(null), ms);
  };

  const pulseTicker = () => {
    setTickerPulseSeq((n) => n + 1);
  };

  const runIntroTutorialThenStart = async () => {
    if (introTutorialRanRef.current) return;
    introTutorialRanRef.current = true;

    const played =
      window.localStorage.getItem("hotseat_intro_tutorial_played") === "1";
    if (played) {
      await startFirstGeminiQuestion();
      return;
    }

    setIsIntroTutorialActive(true);

    // keep the overlay clean (no spotlight / arrows)
    setShowTickerPointer(false);

    const baselinePrice = STARTING_STOCK_PRICE;

    // reset state for the intro (no answer options, no changes to price)
    setAnswerOptions(null);
    setOptionsOrder(null);
    setIsAnswerLocked(true);

    setInterviewState((prev) => ({
      ...prev,
      stockPrice: baselinePrice,
      lowestPrice: baselinePrice,
      audienceSentiment: 50,
      awaitingAnswer: false,
      startedAtMs: undefined,
      questionAskedAtMs: undefined,
      questionCount: 0,
      maxQuestions: TOTAL_QUESTIONS,
      outcome: undefined,
      worstAnswer: undefined,
      evasiveStreak: 0,
    }));

    // One line, one green pulse (no number change)
    setTutorialText(
      "Remember, clear and sincere answers will boost your stock price. Good luck!"
    );
    setTickerDirectionOverride("up");
    //pulseTicker();

    // hold long enough to read
    await sleep(tut(1000));

    // cleanup
    setTutorialText("");
    setTickerDirectionOverride(null);
    setHighlightAnswerKey(null);
    setIsIntroTutorialActive(false);

    window.localStorage.setItem("hotseat_intro_tutorial_played", "1");

    // optional: keep feed clean
    setMessages([]);

    await startFirstGeminiQuestion();
  };

  const startInterview = async () => {
    clearTimers();
    setMessages([]);
    lastQuestionRef.current = undefined;

    setAnswerOptions(null);
    setOptionsOrder(null);
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

    // reset tutorial UI state
    setShowTickerPointer(false);
    setTickerDirectionOverride(null);
    setHighlightAnswerKey(null);
    setTutorialText("");
    introTutorialRanRef.current = false;

    setPhase(GamePhase.INTRO);
    await startAudio();

    window.setTimeout(async () => {
      setPhase(GamePhase.INTERVIEW);
      setIsLoading(false);
      await runIntroTutorialThenStart();
    }, 3000);
  };

  const resolveSelectedAnswer = async (selectedText: string, selectedKey: AnswerOptionKey) => {
    setInterviewState((prev) => ({ ...prev, awaitingAnswer: false }));
    setIsAnswerLocked(true);
    setIsLoading(true);

    const scoreCategory = optionKeyToScoreCategory(selectedKey);

    try {
      const response: any = await GeminiService.sendUserAnswer(selectedText, selectedKey);

      const ctx = {
        category: scoreCategory,
        isContradiction: Boolean(response?.isContradiction),
        evasiveStreakBefore: interviewState.evasiveStreak,
        timeLeftMs: 60_000,
        answerText: selectedText,
      };

      const scored = scoreAnswer(ctx);

      let finalDelta = clamp(scored.delta, -5, 5);

      if (selectedKey === "good") finalDelta = clamp(finalDelta, 0.8, 3.5);
      if (selectedKey === "evasive") finalDelta = clamp(finalDelta, -3.5, -0.1);

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
      setOptionsOrder(response.optionsOrder ?? null);
      setIsAnswerLocked(false);
    } catch (err) {
      console.error(err);
      postJournalistLine("I can’t get a response right now. Try again.", { category: "bad" });
      setAnswerOptions(null);
      setOptionsOrder(null);
      setIsAnswerLocked(false);
      setInterviewState((prev) => ({ ...prev, awaitingAnswer: true }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAnswer = async (key: AnswerOptionKey) => {
    if (phase !== GamePhase.INTERVIEW) return;
    if (isIntroTutorialActive) return;

    if (isLoading || isAnswerLocked) return;
    if (!interviewState.awaitingAnswer) return;
    if (!answerOptions) return;

    const selectedText = answerOptions[key];

    postUserLine(selectedText);
    await resolveSelectedAnswer(selectedText, key);
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
                <span className="text-yellow-500 font-semibold">Every answer moves markets.</span>
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

  // SUMMARY (updated)
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

          <div className="text-white text-2xl md:text-3xl font-black uppercase tracking-tight mb-3">
            {company.name}
            </div>
            
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
            <button
              type="button"
              onClick={() => {
                setGuideError(null);
                setIsGuideModalOpen(true);
              }}
              className={`group text-black font-black uppercase px-8 py-4 rounded-full tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl w-full md:w-auto min-w-[300px] ${
                isUp ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
              }`}
            >
              <Calendar size={20} className="text-zinc-900" />
              DOWNLOAD YOUR INTERVIEW GUIDE
            </button>

            <button
              onClick={() => window.location.reload()}
              className="text-zinc-600 hover:text-white text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2 transition-colors py-2"
            >
              <RefreshCcw size={12} />
              Replay
            </button>
          </div>

          {isGuideModalOpen && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Download interview guide"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/70"
                onClick={() => !isGuideLoading && setIsGuideModalOpen(false)}
                aria-label="Close"
              />

              <div className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-sm font-bold uppercase tracking-widest text-zinc-400">
                      Download
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight">
                      Your interview guide
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => !isGuideLoading && setIsGuideModalOpen(false)}
                    className="text-zinc-500 hover:text-white font-bold"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
                  Email
                </label>

                <input
                  type="email"
                  value={guideEmail}
                  onChange={(e) => setGuideEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl bg-black/40 border border-zinc-700 px-4 py-3 text-white outline-none focus:border-zinc-400"
                  disabled={isGuideLoading}
                  autoFocus
                />

                {guideError && <div className="mt-3 text-sm text-red-300">{guideError}</div>}

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsGuideModalOpen(false)}
                    className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-300 hover:text-white"
                    disabled={isGuideLoading}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={requestInterviewGuide}
                    className={`flex-1 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-black ${
                      isUp ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
                    } ${isGuideLoading ? "opacity-70 cursor-not-allowed" : ""}`}
                    disabled={isGuideLoading}
                  >
                    {isGuideLoading ? "Generating…" : "Download"}
                  </button>
                </div>

                <div className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
                  We’ll use this email to send the guide link.
                </div>
              </div>
            </div>
          )}
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
          optionsOrder={optionsOrder ?? undefined}
          isAnswerLocked={
            isIntroTutorialActive ||
            isAnswerLocked ||
            isLoading ||
            !interviewState.awaitingAnswer
          }
          onSelectAnswer={handleSelectAnswer}
          onSendMessage={() => {}}
          highlightAnswerKey={highlightAnswerKey}
          tickerDirectionOverride={tickerDirectionOverride}
          showTickerPointer={showTickerPointer}
          tickerPulseSeq={tickerPulseSeq}
          flashDurationMs={isIntroTutorialActive ? 350 : 600}
        />

        {/* Tutorial overlay */}
        {isIntroTutorialActive && (
          <div className="absolute inset-0 z-[90] pointer-events-none">
            <div className="absolute inset-0 bg-black/35 backdrop-blur-[3px]" />
            <div className="absolute left-1/2 top-[18%] -translate-x-1/2 w-[min(820px,92vw)]">
              <div className="bg-black/70 border border-white/10 rounded-2xl shadow-2xl px-5 py-4 md:px-7 md:py-5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 font-bold mb-2">
                  Assistant's Note
                </div>
                <div className="text-white text-lg md:text-2xl font-medium leading-snug">
                  {tutorialText}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
