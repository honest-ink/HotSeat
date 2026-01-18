import React, { useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, AlertCircle, Mic } from "lucide-react";
import { Message, InterviewState, AnswerOptions, AnswerOptionKey } from "../types";
import { FAIL_STOCK_PRICE, NEWS_TICKER_HEADLINES } from "../constants";

interface BroadcastUIProps {
  messages: Message[];
  state: InterviewState;
  onSendMessage: (text: string, selected: AnswerOptionKey) => void;
  isLoading: boolean;
  companyName: string;
  options?: AnswerOptions; // NEW: options for the current question
}

const BroadcastUI: React.FC<BroadcastUIProps> = ({
  messages,
  state,
  onSendMessage,
  isLoading,
  companyName,
  options,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const canChoose = state.awaitingAnswer && !isLoading && Boolean(options);

  const sendAnswerToN8n = async (userAnswer: string) => {
    const webhookUrl = "https://honest-ink.app.n8n.cloud/webhook/Hot Seat";

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userAnswer,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error("Failed to send to n8n:", error);
    }
  };

  const handlePick = (key: AnswerOptionKey) => {
    if (!canChoose || !options) return;

    const text = options[key];
    onSendMessage(text, key);
    sendAnswerToN8n(text);
  };

  const tickerSymbol = companyName.substring(0, 4).toUpperCase() || "XXXX";

  // Progress (answered / total)
  const answered = state.awaitingAnswer
    ? Math.max(0, state.questionCount - 1)
    : state.questionCount;

  const progressLabel = `${Math.max(0, Math.min(answered, state.maxQuestions))}/${state.maxQuestions}`;

  const isFailZone = state.stockPrice < FAIL_STOCK_PRICE;
  const isNearFail = state.stockPrice < FAIL_STOCK_PRICE + 1.5;

  return (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none h-full max-h-[100dvh]">
      {/* --- TOP HEADER (Global) --- */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-start z-50">
        {/* Live Bug */}
        <div className="flex flex-col drop-shadow-lg">
          <div className="bg-[#cc0000] text-white px-3 py-1 font-bold text-xs md:text-sm tracking-widest inline-flex items-center gap-2 shadow-lg rounded-sm">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            LIVE
          </div>
          <div className="bg-black/80 text-white text-[10px] px-2 py-0.5 tracking-wider uppercase backdrop-blur-sm">
            London
          </div>
        </div>

        {/* Right cluster: Progress + Stock */}
        <div className="flex flex-col items-end gap-2">
          {/* Progress */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md text-white px-3 py-2 rounded-lg border border-white/10 shadow-2xl">
            <Mic size={16} className="text-white" />
            <div className="font-mono font-bold text-lg tracking-widest">
              {progressLabel}
            </div>
          </div>

          {/* Stock */}
          <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-lg border border-white/10 shadow-2xl">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-600 pr-3 mr-1">
              {tickerSymbol}
            </div>
            <div
              className={`font-mono font-bold text-lg flex items-center gap-2 ${
                isFailZone ? "text-red-400" : "text-white"
              }`}
            >
              {state.stockPrice.toFixed(2)}
              {isFailZone ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
            </div>
          </div>

          {isNearFail && !isFailZone && (
            <div className="bg-yellow-500/90 text-black text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
              <AlertCircle size={12} />
              AT RISK
            </div>
          )}
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col md:flex-row-reverse relative overflow-hidden">
        {/* LEFT COLUMN */}
        <div
          className={`
            pointer-events-auto flex flex-col
            absolute bottom-0 left-0 right-0 h-[60dvh] md:h-full md:static md:w-1/2
            z-40
            md:bg-gradient-to-r md:from-black/80 md:via-black/40 md:to-transparent
            bg-gradient-to-t from-black via-black/90 to-transparent
            <div className="... md:pb-24 ...">
          `}
        >
          {/* Messages Container */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 pt-12 pb-2 md:p-8 md:pt-32 md:pb-8 space-y-4 md:space-y-6 scroll-smooth"
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 90px, rgba(0,0,0,1) 100%)",
              maskImage:
                "linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,1) 90px, rgba(0,0,0,1) 100%)",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
            }}
          >
            {/* Feed Intro Marker */}
            <div className="flex justify-center mb-8 opacity-50">
              <div className="bg-white/10 text-white/60 px-4 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                Secure Connection Established
              </div>
            </div>

            {messages.map((msg) => {
              const showImpact =
                msg.sender === "journalist" &&
                typeof msg.stockImpact === "number" &&
                msg.stockImpact !== 0;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col group ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`
                      relative max-w-[90%] md:max-w-[80%] p-3 md:p-5 rounded-2xl shadow-lg border backdrop-blur-md transition-all duration-300
                      ${
                        msg.sender === "journalist"
                          ? "bg-white/90 text-gray-900 border-white/50 rounded-tl-none mr-8 md:mr-20 shadow-[0_4px_20px_rgba(255,255,255,0.1)]"
                          : "bg-blue-600/80 text-white border-blue-400/30 rounded-tr-none ml-8 md:ml-20 shadow-[0_4px_20px_rgba(37,99,235,0.2)]"
                      }
                      ${msg.flash === "red" ? "ring-2 ring-red-500 animate-pulse" : ""}
                    `}
                  >
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider block mb-1 opacity-70 ${
                        msg.sender === "journalist"
                          ? "text-blue-900"
                          : "text-blue-100"
                      }`}
                    >
                      {msg.sender === "journalist"
                        ? "Diane (Host)"
                        : "You (Guest)"}
                    </span>

                    <p className="text-sm md:text-xl leading-relaxed font-medium">
                      {msg.text}
                    </p>

                    {/* Microcopy */}
                    {msg.sender === "journalist" && msg.microcopy && (
                      <div className="mt-2 text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-70">
                        {msg.microcopy}
                      </div>
                    )}

                    {/* Stock Impact Badge (delta points, not %) */}
                    {showImpact && (
                      <div
                        className={`
                          absolute -bottom-3 -right-2 px-2 py-1 rounded-md text-[10px] font-mono font-bold shadow-sm border border-black/5 flex items-center gap-1
                          ${msg.stockImpact! > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}
                        `}
                      >
                        {msg.stockImpact! > 0 ? (
                          <TrendingUp size={10} />
                        ) : (
                          <TrendingDown size={10} />
                        )}
                        {msg.stockImpact! > 0 ? "+" : ""}
                        {msg.stockImpact!.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-3 rounded-2xl rounded-tl-none text-xs md:text-sm font-medium italic flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div>
                  </div>
                  Diane is speaking...
                </div>
              </div>
            )}
          </div>

          {/* Answer Buttons */}
          <div className="p-4 md:p-8 pt-0 md:pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pointer-events-auto">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl opacity-50 blur group-hover:opacity-75 transition duration-200"></div>

              <div className="relative bg-zinc-900 rounded-xl border border-white/10 shadow-2xl overflow-hidden p-3 md:p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">
                  {isLoading
                    ? "Listen to the question..."
                    : state.awaitingAnswer
                    ? "Choose your answer"
                    : "Waiting for the next question..."}
                </div>

                <div className="grid grid-cols-1 gap-2 md:gap-3">
                  <button
                    type="button"
                    onClick={() => handlePick("good")}
                    disabled={!canChoose}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      canChoose
                        ? "bg-emerald-500/15 border-emerald-400/20 hover:bg-emerald-500/20 text-white"
                        : "bg-white/5 border-white/10 text-zinc-500"
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-1">
                      Good
                    </div>
                    <div className="text-sm md:text-base leading-snug font-medium">
                      {options?.good ?? "…"}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePick("ok")}
                    disabled={!canChoose}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      canChoose
                        ? "bg-white/5 border-white/15 hover:bg-white/10 text-white"
                        : "bg-white/5 border-white/10 text-zinc-500"
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-200 mb-1">
                      OK
                    </div>
                    <div className="text-sm md:text-base leading-snug font-medium">
                      {options?.ok ?? "…"}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePick("evasive")}
                    disabled={!canChoose}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      canChoose
                        ? "bg-red-500/10 border-red-400/20 hover:bg-red-500/15 text-white"
                        : "bg-white/5 border-white/10 text-zinc-500"
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-red-300 mb-1">
                      Evasive
                    </div>
                    <div className="text-sm md:text-base leading-snug font-medium">
                      {options?.evasive ?? "…"}
                    </div>
                  </button>
                </div>

                {!options && state.awaitingAnswer && !isLoadin
