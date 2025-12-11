import React, { useState, useEffect } from 'react';
import { GamePhase, CompanyProfile, Message, InterviewState, GeminiResponse } from './types';
import { INITIAL_STOCK_PRICE, MAX_QUESTIONS } from './constants';
import * as GeminiService from './services/geminiService';
import BroadcastUI from './components/BroadcastUI';
import Studio3D from './components/Studio3D';
import { Monitor, Briefcase, Play, AlertCircle, Calendar, RefreshCcw } from 'lucide-react';

function App() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [company, setCompany] = useState<CompanyProfile>({ name: '', industry: '', mission: '' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isJournalistTalking, setIsJournalistTalking] = useState(false);
  
  const [interviewState, setInterviewState] = useState<InterviewState>({
    stockPrice: INITIAL_STOCK_PRICE,
    audienceSentiment: 50,
    questionCount: 0,
    maxQuestions: MAX_QUESTIONS
  });

  const handleSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (company.name && company.industry) {
      startInterview();
    }
  };

  const startInterview = async () => {
    setPhase(GamePhase.INTRO);
    
    // Simulate intro sequence
    setTimeout(async () => {
      setPhase(GamePhase.INTERVIEW);
      setIsLoading(true);
      
      const openingResponse = await GeminiService.initInterview(company);
      
      addMessage('journalist', openingResponse.text, openingResponse);
      setIsLoading(false);
    }, 3000);
  };

  const addMessage = (sender: 'user' | 'journalist', text: string, data?: GeminiResponse) => {
    if (sender === 'journalist') {
      setIsJournalistTalking(true);
      // Stop talking animation after text length duration approx
      setTimeout(() => setIsJournalistTalking(false), Math.min(text.length * 50, 3000));
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      sender,
      text,
      sentiment: data?.sentiment,
      stockImpact: data?.stockChange
    };

    setMessages(prev => [...prev, newMessage]);

    if (data) {
      setInterviewState(prev => {
        const newStock = Math.max(0, prev.stockPrice + (data.stockChange || 0));
        let newSentiment = prev.audienceSentiment;
        if (data.sentiment === 'positive') newSentiment += 10;
        if (data.sentiment === 'negative') newSentiment -= 10;
        
        return {
          ...prev,
          stockPrice: newStock,
          audienceSentiment: Math.min(100, Math.max(0, newSentiment)),
          questionCount: sender === 'journalist' ? prev.questionCount + 1 : prev.questionCount
        };
      });

      if (data.isInterviewOver || interviewState.questionCount >= MAX_QUESTIONS) {
        setTimeout(() => setPhase(GamePhase.SUMMARY), 3000);
      }
    }
  };

  const handleUserResponse = async (text: string) => {
    addMessage('user', text);
    setIsLoading(true);

    const response = await GeminiService.sendUserAnswer(text);
    
    setTimeout(() => {
        addMessage('journalist', response.text, response);
        setIsLoading(false);
    }, 1000 + Math.random() * 1000); // Artificial delay for realism
  };

  // Setup Screen
  if (phase === GamePhase.SETUP) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="scanlines"></div>
        
        {/* Background ambience */}
        <div className="absolute inset-0 bg-[url('https://picsum.photos/1920/1080?grayscale&blur=10')] opacity-20 bg-cover bg-center"></div>
        
        <div className="max-w-xl w-full relative z-10 bg-zinc-900/90 border border-zinc-800 p-8 rounded-2xl shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6 text-yellow-500">
             <Monitor size={32} />
             <h1 className="text-4xl font-black uppercase tracking-tighter">The Hot Seat</h1>
          </div>
          
          <p className="text-zinc-400 mb-8 text-lg">
            You are about to go live on the nation's most aggressive business news segment. 
            Prepare your talking points. The market is watching.
          </p>

          <form onSubmit={handleSetupSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">Company Name</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-3.5 text-zinc-500" size={18} />
                <input 
                  required
                  className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 pl-10 pr-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. OmniCorp"
                  value={company.name}
                  onChange={e => setCompany({...company, name: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">Industry</label>
              <input 
                required
                className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 px-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all"
                placeholder="e.g. Biotechnology, AI Defense, Fast Food"
                value={company.industry}
                onChange={e => setCompany({...company, industry: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-zinc-500 mb-2">Mission Statement (The Pitch)</label>
              <textarea 
                required
                className="w-full bg-black/50 border border-zinc-700 rounded-lg py-3 px-4 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all h-24 resize-none"
                placeholder="We make the world better by..."
                value={company.mission}
                onChange={e => setCompany({...company, mission: e.target.value})}
              />
            </div>

            <button 
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase py-4 rounded-lg tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform"
            >
              <Play size={20} fill="black" /> Go Live
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Intro Cinematic Screen
  if (phase === GamePhase.INTRO) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
        <div className="scanlines"></div>
        <div className="text-center animate-pulse">
           <h1 className="text-8xl font-black text-white tracking-[0.2em] mb-4 scale-150 transform transition-transform duration-[3000ms]">
             LIVE
           </h1>
           <p className="text-red-500 font-mono text-xl">CONNECTING TO SATELLITE...</p>
        </div>
      </div>
    );
  }

  // Summary Screen
  if (phase === GamePhase.SUMMARY) {
     const isSuccess = interviewState.stockPrice >= 100;
     
     return (
       <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-4 font-sans z-50 overflow-hidden">
         <div className="absolute inset-0 bg-red-900/10"></div>
         <div className="scanlines"></div>
         
         <div className="max-w-2xl w-full bg-zinc-900 p-6 md:p-10 rounded-3xl border-2 border-zinc-800 text-center relative z-10 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="shrink-0 flex justify-center">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${isSuccess ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>
                  <Monitor size={40} />
                </div>
            </div>
            
            <h2 className="text-3xl md:text-5xl font-black mb-2 uppercase tracking-tight shrink-0">Segment Over</h2>
            <p className="text-zinc-400 text-lg md:text-xl mb-8 shrink-0">The cameras are off. Here is the damage report.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 shrink-0">
               <div className="bg-black/40 p-6 rounded-xl border border-zinc-800">
                  <div className="text-zinc-500 text-sm uppercase font-bold mb-1">Final Stock Price</div>
                  <div className={`text-4xl font-mono font-bold ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                    ${interviewState.stockPrice.toFixed(2)}
                  </div>
               </div>
               <div className="bg-black/40 p-6 rounded-xl border border-zinc-800">
                  <div className="text-zinc-500 text-sm uppercase font-bold mb-1">Audience Sentiment</div>
                  <div className="text-4xl font-mono font-bold text-white">
                    {interviewState.audienceSentiment}%
                  </div>
               </div>
            </div>

            <div className="bg-zinc-800/50 p-6 rounded-xl text-left mb-8 border border-zinc-700/50 shrink-0">
               <div className="flex items-start gap-3">
                 <AlertCircle className="text-yellow-500 shrink-0 mt-1" />
                 <div>
                   <h3 className="font-bold text-lg mb-1">Analyst Rating: {isSuccess ? 'STRONG BUY' : 'SELL'}</h3>
                   <p className="text-zinc-400 leading-relaxed">
                     {isSuccess 
                       ? "You handled the pressure well. Investors are confident in your leadership despite the tough questioning." 
                       : "In today's media landscape, perception is reality—and yours just tanked. Don't go back on air unprepared. Speak with Honest Ink to control your narrative."}
                   </p>
                 </div>
               </div>
            </div>

            <div className="shrink-0 pb-2 flex flex-col items-center gap-4 w-full">
                <a 
                  href="https://calendar.app.google/F1z9UmnTGLYX3nhk7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-white hover:bg-yellow-500 text-black font-black uppercase px-8 py-4 rounded-full tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl w-full md:w-auto min-w-[300px]"
                >
                  <Calendar size={20} className="text-zinc-900 group-hover:text-black transition-colors" />
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

  // Main Game Loop (Interview)
  return (
    <div className="w-full h-screen relative flex overflow-hidden bg-transparent">
      <div className="scanlines"></div>
      
      {/* 
        LAYER 1: The "Video Feed" Backgrounds 
        (Rendered by Studio3D for both left and right panes) 
      */}
      <Studio3D 
        isTalking={isJournalistTalking} 
        sentiment={
           interviewState.audienceSentiment > 60 ? 'positive' :
           interviewState.audienceSentiment < 40 ? 'negative' : 'neutral'
        }
      />

      {/* 
        LAYER 2: The UI Overlay 
        (Includes Chat in right pane, Tickers, Live Bugs) 
      */}
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

export default App;