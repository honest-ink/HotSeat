import React, { useEffect, useRef, useState } from "react";
import {
  Send,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Timer,
} from "lucide-react";
import { Message, InterviewState } from "../types";
import { FAIL_STOCK_PRICE, NEWS_TICKER_HEADLINES } from "../constants";

interface BroadcastUIProps {
  messages: Message[];
  state: InterviewState;
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  companyName: string;
}

function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds.toString().padStart(2, "0");
}

const BroadcastUI: React.FC<BroadcastUIProps> = ({
  messages,
  state,
  onSendMessage,
  isLoading,
  companyName,
}) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const canType = state.awaitingAnswer && !isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canType) return;

    const text = input.trim();
    if (!text) return;

    onSendMessage(text);
    setInput("");
  };

  const tickerSymbol = companyName.substring(0, 4).toUpperCase() || "XXXX";

  const secondsLeft = formatSeconds(state.timeLeftMs);
  const isCriticalTime = state.timeLeftMs <= 15_000;

  const isFailZone = state.stockPrice < FAIL_STOCK_PRICE;
  const isNearFail = state.stockPrice < FAIL_STOCK_PRICE + 1.5;

  return (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none h-full max-h-[100dvh]">
      {/* TOP HEADER */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-start z-50">
        <div className="flex flex-col drop-shadow-lg">
          <div className="bg-[#cc0000] text-white px-3 py-1 font-bold text-xs md:text-sm tracking-widest inline-flex items-center gap-2 shadow-lg rounded-sm">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
          <div className="bg-black/80 text-white text-[10px] px-2 py-0.5 tracking-wider uppercase backdrop-blur-sm">
            London
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* TIMER */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md text-white px-3 py-2 rounded-lg border border-white/10 shadow-2xl">
            <Timer
              size={16}
              className={isCriticalTime ? "text-red-400" : "text-white"}
            />
            <div
              className={`font-mono font-bold text-lg tracking-widest ${
                isCriticalTime ? "text-red-400 animate-pulse" : ""
              }`}
            >
              {secondsLeft}s
            </div>
          </div>

          {/* STOCK */}
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

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        <div className="pointer-events-auto flex flex-col absolute bottom-0 left-0 right-0 h-[60dvh] md:h-full md:static md:w-7/12 z-40 md:bg-gradient-to-r md:from-black/80 md:via-black/40 md:to-transparent bg-gradient-to-t from-black via-black/90 to-transparent">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 pt-12 pb-2 md:p-8 md:pt-32 md:pb-8 space-y-4 md:space-y-6"
          >
            <div className="flex justify-center mb-8 opacity-50">
              <div className="bg-white/10 text-white/60 px-4 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Secure Connection Established
              </div>
            </div>

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[90%] md:max-w-[80%] p-3 md:p-5 rounded-2xl border backdrop-blur-md ${
                    msg.sender === "journalist"
                      ? "bg-white/90 text-gray-900 rounded-tl-none"
                      : "bg-blue-600/80 text-white rounded-tr-none"
                  }`}
                >
                  <p className="text-sm md:text-xl">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* INPUT */}
          <div className="p-4 md:p-8 pt-0">
            <form onSubmit={handleSubmit} className="relative">
              <div className="relative flex items-center bg-zinc-900 rounded-xl border border-white/10">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={!canType}
                  placeholder={
                    isLoading
                      ? "Listen to the question..."
                      : state.awaitingAnswer
                      ? "Type your response..."
                      : "Waiting for the next question..."
                  }
                  className="flex-1 bg-transparent px-4 py-4 text-white"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || !canType}
                  className="px-6 py-4 text-blue-400"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="hidden md:block md:w-5/12" />
      </div>
    </div>
  );
};

export default BroadcastUI;
