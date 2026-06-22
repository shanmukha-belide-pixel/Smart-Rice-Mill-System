import React, { useState, useEffect } from 'react';
import { Play, TrendingUp, Users, Clock } from 'lucide-react';
import { translations } from '../utils/translations';

export default function PublicDisplay({ backendUrl, language }) {
  const [tokens, setTokens] = useState([]);
  const [stock, setStock] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  const t = translations[language || 'te'];

  // Fetch prices and tokens
  const fetchData = async () => {
    try {
      const tokenRes = await fetch(`${backendUrl}/api/tokens`);
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setTokens(tokenData);
      }
      
      const stockRes = await fetch(`${backendUrl}/api/stock`);
      if (stockRes.ok) {
        const stockData = await stockRes.json();
        setStock(stockData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 15 seconds
    const interval = setInterval(fetchData, 15000);
    
    // Clock tick
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    // WebSocket for real-time immediate updates
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanHost = backendUrl.replace('http://', '').replace('https://', '');
    const wsUrl = `${wsProto}//${cleanHost}/api/ws/queue`;
    
    let socket;
    function connect() {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (e) => {
        if (e.data === 'REFRESH_QUEUE') {
          fetchData();
        }
      };
      socket.onclose = () => setTimeout(connect, 3000);
    }
    connect();

    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
      if (socket) socket.close();
    };
  }, [backendUrl]);

  // Extract states
  const activeTokens = tokens.filter(t => t.status === 'active');
  const waitingTokens = tokens.filter(t => t.status === 'waiting');
  
  const nowServingText = activeTokens.length > 0 
    ? activeTokens.map(t => t.token_number).join(', ') 
    : (language === 'te' ? 'ఎవరూ లేరు' : 'None');
    
  const nextTokenText = waitingTokens.length > 0 
    ? waitingTokens[0].token_number 
    : (language === 'te' ? 'ఎవరూ లేరు' : 'None');

  const totalWaiting = waitingTokens.length;
  const totalWaitTime = totalWaiting * 8; // minutes

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-8 font-sans antialiased relative overflow-hidden">
      {/* Decorative large glows */}
      <div className="absolute top-1/4 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-6 z-10">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-extrabold uppercase tracking-wide bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              {t.appName}
            </h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold font-mono">{language === 'te' ? 'లైవ్ పబ్లిక్ ప్రదర్శన టీవీ' : 'Live Public Display Screen'}</p>
          </div>
        </div>
        
        {/* Dynamic Clock */}
        <div className="text-right font-mono">
          <div className="text-2xl font-bold text-slate-200">
            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">
            {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
          </div>
        </div>
      </div>

      {/* Main Grid: Left (Queue status), Right (Today's Prices) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 my-8 flex-1 items-stretch z-10">
        
        {/* Queue Board */}
        <div className="glass-panel rounded-[2rem] p-8 flex flex-col justify-between border border-slate-800 shadow-2xl relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
          
          <div className="space-y-6">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest font-mono">{t.workspaceConsole}</span>
            
            {/* Now Serving Big Box */}
            <div className="space-y-3">
              <span className="text-sm text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                {language === 'te' ? 'ప్రస్తుత పిలుపు' : 'Now Serving'}
              </span>
              <div className="text-9xl font-black text-slate-100 font-mono tracking-tighter select-none py-2 drop-shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                {nowServingText}
              </div>
            </div>

            {/* Next Up / Wait details */}
            <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-900">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold block">{t.nextUp}</span>
                <span className="text-4xl font-extrabold text-amber-500 font-mono block drop-shadow-[0_0_8px_rgba(245,158,11,0.1)]">{nextTokenText}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold block">{t.estimatedWait}</span>
                <span className="text-4xl font-extrabold text-slate-350 font-mono block">~{totalWaitTime} {t.mins}</span>
              </div>
            </div>
          </div>

          {/* Footer of card */}
          <div className="bg-slate-950/50 border border-slate-900 rounded-2xl p-4.5 mt-6 flex justify-between items-center text-sm font-semibold">
            <span className="text-slate-400">{language === 'te' ? 'క్యూలో వేచి ఉన్న కస్టమర్లు:' : 'Total waiting in queue:'}</span>
            <span className="text-slate-200 bg-slate-900 border border-slate-800 px-4 py-1.5 rounded-full text-xs font-bold font-mono">
              {totalWaiting} {language === 'te' ? 'వ్యక్తులు' : 'people'}
            </span>
          </div>
        </div>

        {/* Pricing Display */}
        <div className="glass-panel rounded-[2rem] p-8 flex flex-col justify-between border border-slate-800 shadow-2xl relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-amber-500/10 to-transparent" />
          
          <div className="space-y-6 flex-1">
            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-widest font-mono">{t.todayPrices}</span>
              <span className="text-[9px] text-slate-500 font-mono">{language === 'te' ? '10 కిలోల సంచి ప్రకారం' : 'Calculated for 10kg bags'}</span>
            </div>

            {/* Price list */}
            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-2">
              {stock.length > 0 ? (
                stock.map(item => (
                  <div key={item.id} className="flex justify-between items-center py-3 px-4 hover:bg-slate-900/20 rounded-2xl transition-all border border-transparent hover:border-slate-900">
                    <div className="space-y-1">
                      <span className="text-lg font-bold text-slate-200">{item.variety_name}</span>
                      <span className="text-[10px] text-slate-550 block font-mono tracking-wider">RM-{(item.id).toString().padStart(3, '0')}</span>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-400 font-mono">₹{item.price_per_kg.toFixed(2)}/kg</div>
                      <div className="text-[9px] text-slate-500 font-mono mt-1">₹{(item.price_per_kg * 10).toFixed(0)} / 10kg {language === 'te' ? 'సంచి' : 'bag'}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">{language === 'te' ? 'ధరలను లోడ్ చేస్తున్నాము...' : 'Loading today\'s rates...'}</div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-900 pt-4 text-[9px] text-slate-500 text-center uppercase tracking-widest font-mono">
            {language === 'te' ? 'ఆదివారం మిల్లుకు సెలవు • గేట్ సమయాలు: ఉదయం 6 - రాత్రి 8 గంటలు' : 'Closed on Sundays • Gate timings: 6:00 AM - 8:00 PM'}
          </div>
        </div>

      </div>

      {/* Bottom Ticker */}
      <div className="bg-slate-900/40 border border-slate-900 p-4.5 rounded-2xl flex justify-between items-center text-xs text-slate-400 font-medium z-10">
        <span>{t.noInternetTip}</span>
        <span className="hidden sm:inline font-mono uppercase text-[10px] text-slate-600">Sri Tirumala Mill • Telangana</span>
      </div>
    </div>
  );
}
