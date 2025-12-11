import React, { useEffect, useRef, useState } from 'react';
import { Send, TrendingUp, TrendingDown, Clock, MessageSquare } from 'lucide-react';
import { Message, InterviewState } from '../types';
import { NEWS_TICKER_HEADLINES } from '../constants';

interface BroadcastUIProps {
  messages: Message[];
  state: InterviewState;
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  companyName: string;
}

const BroadcastUI: React.FC<BroadcastUIProps> = ({ 
  messages, 
  state, 
  onSendMessage, 
  isLoading,
  companyName
}) => {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput("");
    }
  };

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
                  Washington D.C.
              </div>
          </div>

          {/* Stock Ticker Overlay */}
          <div className="flex flex-col items-end gap-1">
             <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-lg border border-white/10 shadow-2xl">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-r border-gray-600 pr-3 mr-1">
                    {companyName.substring(0, 4).toUpperCase()}
                </div>
                <div className={`font-mono font-bold text-lg flex items-center gap-2 ${state.stockPrice >= 100 ? 'text-green-400' : 'text-red-400'}`}>
                    {state.stockPrice.toFixed(2)}
                    {state.stockPrice >= 100 ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
                </div>
             </div>
             {state.stockPrice < 80 && (
                 <div className="bg-red-500/90 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse">
                    TRADING HALT RISK
                 </div>
             )}
          </div>
      </div>


      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        
        {/* LEFT COLUMN: CHAT / TELEPROMPTER INTERFACE (Now on Left) */}
        <div className={`
           pointer-events-auto flex flex-col 
           absolute bottom-0 left-0 right-0 h-[60dvh] md:h-full md:static md:w-7/12 
           z-40
           md:bg-gradient-to-r md:from-black/80 md:via-black/40 md:to-transparent
           bg-gradient-to-t from-black via-black/90 to-transparent
        `}>
           
           {/* Messages Container - Styled like a holographic feed */}
           <div 
             ref={scrollRef}
             className="flex-1 overflow-y-auto px-4 pt-12 pb-2 md:p-8 md:pt-32 md:pb-8 space-y-4 md:space-y-6 scroll-smooth"
           >
             {/* Feed Intro Marker */}
             <div className="flex justify-center mb-8 opacity-50">
                <div className="bg-white/10 text-white/60 px-4 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                   Secure Connection Established
                </div>
             </div>

             {messages.map((msg) => (
               <div 
                 key={msg.id} 
                 className={`flex flex-col group ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
               >
                 <div 
                   className={`
                     relative max-w-[90%] md:max-w-[80%] p-3 md:p-5 rounded-2xl shadow-lg border backdrop-blur-md transition-all duration-300
                     ${msg.sender === 'journalist' 
                       ? 'bg-white/90 text-gray-900 border-white/50 rounded-tl-none mr-8 md:mr-20 shadow-[0_4px_20px_rgba(255,255,255,0.1)]' 
                       : 'bg-blue-600/80 text-white border-blue-400/30 rounded-tr-none ml-8 md:ml-20 shadow-[0_4px_20px_rgba(37,99,235,0.2)]'}
                   `}
                 >
                   <span className={`text-[9px] font-black uppercase tracking-wider block mb-1 opacity-70 ${msg.sender === 'journalist' ? 'text-blue-900' : 'text-blue-100'}`}>
                     {msg.sender === 'journalist' ? 'Diane (Host)' : 'You (Guest)'}
                   </span>
                   
                   <p className="text-sm md:text-xl leading-relaxed font-medium">
                     {msg.text}
                   </p>

                   {/* Stock Impact Badge */}
                   {msg.sender === 'journalist' && msg.stockImpact !== undefined && msg.stockImpact !== 0 && (
                     <div className={`
                        absolute -bottom-3 -right-2 px-2 py-1 rounded-md text-[10px] font-mono font-bold shadow-sm border border-black/5 flex items-center gap-1
                        ${msg.stockImpact > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
                     `}>
                        {msg.stockImpact > 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                        {msg.stockImpact > 0 ? '+' : ''}{msg.stockImpact}%
                     </div>
                   )}
                 </div>
               </div>
             ))}

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

           {/* Input Area */}
           <div className="p-4 md:p-8 pt-0 md:pt-4">
              <form onSubmit={handleSubmit} className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl opacity-50 blur group-hover:opacity-75 transition duration-200"></div>
                <div className="relative flex items-center bg-zinc-900 rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={isLoading}
                      placeholder={isLoading ? "Listen to the question..." : "Type your response..."}
                      className="flex-1 bg-transparent px-4 py-4 text-white placeholder-zinc-500 focus:outline-none font-medium text-base md:text-lg min-w-0"
                    />
                    <button 
                      type="submit" 
                      disabled={!input.trim() || isLoading}
                      className="px-6 py-4 bg-white/5 hover:bg-white/10 text-blue-400 disabled:text-zinc-600 disabled:hover:bg-transparent transition-colors border-l border-white/5"
                    >
                      <Send size={20} className={isLoading ? 'opacity-0' : 'opacity-100'} />
                    </button>
                </div>
              </form>
           </div>
        </div>

        {/* RIGHT COLUMN: The "View" of the Journalist (Mostly transparent to show Studio3D) - Now on Right */}
        <div className="w-full md:w-5/12 h-full relative z-0 hidden md:block">
           {/* This area is intentionally empty to let the 3D Studio and "Journalist" be visible on the right */}
        </div>
      </div>

      {/* --- LOWER THIRDS (News Ticker) --- */}
      <div className="hidden md:block pointer-events-none z-50 fixed bottom-0 left-0 right-0">
         <div className="flex items-stretch mx-8 lg:mx-16 mb-6 shadow-[0_10px_50px_rgba(0,0,0,0.5)] transform translate-y-2">
            
            {/* Show Logo */}
            <div className="w-40 bg-[#002855] flex flex-col items-center justify-center text-white border-r border-white/10 shrink-0 relative overflow-hidden">
               <div className="absolute inset-0 bg-blue-500/20 animate-pulse"></div>
               <h1 className="font-black text-3xl italic leading-none relative z-10">GNN</h1>
               <div className="text-[9px] uppercase tracking-[0.2em] relative z-10 text-blue-200">Business</div>
            </div>

            {/* Headline Area */}
            <div className="flex-1 bg-white flex flex-col justify-center px-6 relative overflow-hidden border-l-4 border-yellow-500">
               {/* Scanline pattern on white */}
               <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/grid-noise.png')] opacity-10"></div>
               
               <div className="flex items-center gap-3 relative z-10">
                  <div className="bg-[#cc0000] text-white text-[10px] font-black px-1.5 py-0.5 uppercase tracking-wide">
                     Breaking News
                  </div>
                  <div className="text-2xl font-black uppercase text-[#002855] leading-none tracking-tight truncate">
                     {companyName} CEO: "We Have Nothing To Hide"
                  </div>
               </div>
            </div>
         </div>

         {/* Crawling Ticker */}
         <div className="bg-[#00152e] text-white h-10 w-full flex items-center relative border-t border-blue-900 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 bg-[#002855] px-8 z-20 flex items-center text-xs font-bold uppercase tracking-widest text-yellow-400 shadow-xl">
               Market Watch
            </div>
            <div className="ticker-wrap w-full">
              <div className="ticker-move text-sm font-medium flex items-center">
                {NEWS_TICKER_HEADLINES.map((item, i) => (
                  <span key={i} className="inline-flex items-center px-8">
                    {item} <span className="text-blue-500 mx-4 text-xs">▲ 0.4%</span>
                  </span>
                ))}
              </div>
            </div>
         </div>
      </div>

    </div>
  );
};

export default BroadcastUI;