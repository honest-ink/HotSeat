import React, { useEffect, useState } from 'react';

interface Studio3DProps {
  isTalking: boolean;
  sentiment: 'positive' | 'negative' | 'neutral';
}

// A high-quality studio/stage background
const STUDIO_BG = "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1920&auto=format&fit=crop"; 

// Professional News Anchor Image
const ANCHOR_IMG = "https://raw.githubusercontent.com/honest-ink/HotSeat/a3d4c3352b95f9b13bd841806f882334f792a522/NewsAnchor2.png";

const Studio3D: React.FC<Studio3DProps> = ({ isTalking, sentiment }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate normalized mouse position (-1 to 1)
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePos({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Determine lighting color based on sentiment
  const lightColor = sentiment === 'negative' ? 'bg-red-600' : 'bg-blue-600';
  const ambientColor = sentiment === 'negative' ? 'from-red-900/40' : 'from-blue-900/40';

  return (
    <div className="absolute inset-0 bg-[#050510] overflow-hidden -z-10 [perspective:1000px]">
      
      {/* 3D Container - Moves slightly with mouse for parallax */}
      <div 
        className="w-full h-full relative transform-style-3d transition-transform duration-200 ease-out"
        style={{ 
          transform: `rotateY(${mousePos.x * 1}deg) rotateX(${-mousePos.y * 1}deg) translateZ(0px)` 
        }}
      >
        
        {/* Deep Background Wall */}
        <div 
           className="absolute inset-[-10%] bg-cover bg-center transform translate-z-[-400px] scale-125 transition-all duration-1000"
           style={{ 
             backgroundImage: `url('${STUDIO_BG}')`,
             filter: 'blur(8px) brightness(0.2)'
           }}
        />

        {/* Studio Atmosphere Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-t ${ambientColor} via-transparent to-black/90 mix-blend-overlay transition-colors duration-1000`}></div>

        {/* 3D Background Elements (Floating Screens) */}
        {/* Left Screen */}
        <div className="absolute top-[20%] left-[10%] w-[250px] h-[150px] bg-black/80 border border-white/10 backdrop-blur-sm transform rotate-y-12 translate-z-[-200px] flex flex-col items-center justify-center overflow-hidden shadow-[0_0_30px_rgba(0,100,255,0.1)] rounded-xl">
           <div className="w-full bg-red-600/80 text-white text-[10px] font-bold px-3 py-1 tracking-widest flex justify-between">
              <span>LIVE FEED</span>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
           </div>
           <div className="flex-1 w-full relative group">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1590856029826-c7a73142bbf1?q=80&w=400')] bg-cover opacity-60 grayscale group-hover:grayscale-0 transition-all duration-500"></div>
           </div>
        </div>

        {/* Right Screen (GNN Logo) */}
        <div className="absolute top-[15%] right-[15%] w-[350px] h-[200px] bg-black/60 border border-blue-500/20 backdrop-blur-md transform -rotate-y-12 translate-z-[-250px] rounded-lg overflow-hidden flex items-center justify-center">
             <div className="absolute inset-0 opacity-20 bg-[linear-gradient(0deg,transparent_24%,rgba(37,99,235,0.5)_25%,rgba(37,99,235,0.5)_26%,transparent_27%,transparent_74%,rgba(37,99,235,0.5)_75%,rgba(37,99,235,0.5)_76%,transparent_77%,transparent),linear-gradient(90deg,transparent_24%,rgba(37,99,235,0.5)_25%,rgba(37,99,235,0.5)_26%,transparent_27%,transparent_74%,rgba(37,99,235,0.5)_75%,rgba(37,99,235,0.5)_76%,transparent_77%,transparent)] bg-[length:30px_30px]"></div>
             <div className="text-blue-400/80 font-black text-6xl tracking-tighter italic z-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
               GNN
             </div>
        </div>

        {/* Main "THE HOT SEAT" Text Background */}
        <div className="absolute top-[5%] left-0 right-0 flex justify-center transform translate-z-[-300px]">
           <h1 className="text-[15vw] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white/5 to-transparent tracking-tighter select-none opacity-50" style={{ WebkitTextStroke: '2px rgba(255,255,255,0.05)' }}>
              HOT SEAT
           </h1>
        </div>

        {/* Dynamic Studio Lights (Beams) */}
        <div 
          className={`absolute top-[-50%] left-[10%] w-[200px] h-[200%] ${lightColor} blur-[120px] opacity-30 transform -rotate-[20deg] pointer-events-none transition-colors duration-1000 mix-blend-screen`}
        ></div>
        <div 
          className={`absolute top-[-50%] right-[10%] w-[200px] h-[200%] ${lightColor} blur-[120px] opacity-30 transform rotate-[20deg] pointer-events-none transition-colors duration-1000 mix-blend-screen`}
        ></div>


        {/* --- NEWS ANCHOR CHARACTER --- */}
        <div 
           className="absolute bottom-0 right-[-42%] md:right-[35%] w-[80vh] h-[90vh] pointer-events-none transition-all duration-500 ease-out origin-bottom"
           style={{
             transform: `translateZ(-150px) scale(${isTalking ? 1.02 : 1})`,
             filter: isTalking ? 'brightness(1.05)' : 'brightness(0.95)'
           }}
        >
             {/* Character Image */}
             <img 
               src={ANCHOR_IMG}
               alt="News Anchor"
               className="w-full h-full object-cover object-top"
               style={{
                 // Mask to fade bottom (behind desk) and sides (blend with room)
                 maskImage: 'linear-gradient(to bottom, black 50%, transparent 95%), radial-gradient(circle at center top, black 50%, transparent 100%)',
                 WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 95%), radial-gradient(circle at center top, black 50%, transparent 100%)',
                 maskComposite: 'intersect',
                 WebkitMaskComposite: 'source-in'
               }}
             />
        </div>


        {/* The Anchor's Desk (Foreground) */}
        <div 
          className="absolute bottom-[-120px] left-[-10%] right-[-10%] h-[300px] transform translate-z-[100px]"
        >
           {/* Desk Surface Glass */}
           <div className="w-full h-full bg-gradient-to-b from-blue-900/30 to-black/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] rounded-[100%_100%_0_0/20%] overflow-hidden relative">
              {/* Reflection of "screens" on desk */}
              <div className="absolute top-10 left-1/4 w-32 h-20 bg-blue-500/20 blur-xl rounded-full opacity-50"></div>
              <div className="absolute top-10 right-1/4 w-32 h-20 bg-red-500/10 blur-xl rounded-full opacity-50"></div>
           </div>
           
           {/* Rim Light on Desk Edge */}
           <div className="absolute top-0 left-[20%] right-[20%] h-[1px] bg-gradient-to-r from-transparent via-blue-300/60 to-transparent shadow-[0_0_15px_rgba(147,197,253,0.5)]"></div>
        </div>

      </div>
      
      {/* Cinematic Overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-10"></div>
      
      {/* Floating Dust Particles */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none z-20 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen animate-pulse"></div>

    </div>
  );
};

export default Studio3D;
