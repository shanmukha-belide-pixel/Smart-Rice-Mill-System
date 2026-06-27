import React, { useState, useEffect, useRef } from 'react';
import { Phone, Mail, Users, Clock, ArrowRight, UserCheck, RefreshCw, Key, Volume2, VolumeX } from 'lucide-react';
import { translations } from '../utils/translations';

export default function CustomerPortal({ backendUrl, language }) {
  const [phoneNumber, setPhoneNumber] = useState(() => localStorage.getItem('cp_phone') || '');
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('cp_name') || '');
  const [isVerified, setIsVerified] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [queueInfo, setQueueInfo] = useState(null);
  const [justRegistered, setJustRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [initialChecked, setInitialChecked] = useState(false);

  // Audio/voice announcement states
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('cp_sound') !== 'false'; // default to true
  });
  const prevTokenStateRef = useRef({ id: null, status: null });

  const t = translations[language || 'te'];

  // Check speech synthesis support on mount
  useEffect(() => {
    if ('speechSynthesis' in window) {
      setIsSpeechSupported(true);
    }
  }, []);

  // Speak announcement in Telugu with English fallback
  const announceText = (textTe, textEn) => {
    if (!isSpeechSupported || !soundEnabled) return;
    
    // Stop any active speech
    window.speechSynthesis.cancel();
    
    const utteranceTe = new SpeechSynthesisUtterance(textTe);
    utteranceTe.lang = 'te-IN';
    utteranceTe.rate = 0.8;
    
    const voices = window.speechSynthesis.getVoices();
    const teluguVoice = voices.find(v => v.lang.includes('te'));
    
    if (teluguVoice) {
      utteranceTe.voice = teluguVoice;
      window.speechSynthesis.speak(utteranceTe);
    } else {
      // Fallback to English
      const utteranceEn = new SpeechSynthesisUtterance(textEn);
      utteranceEn.lang = 'en-IN';
      utteranceEn.rate = 0.85;
      const englishVoice = voices.find(v => v.lang.includes('en'));
      if (englishVoice) utteranceEn.voice = englishVoice;
      window.speechSynthesis.speak(utteranceEn);
    }
  };

  // Monitor token state changes to play voice notifications
  useEffect(() => {
    if (!tokenInfo) {
      prevTokenStateRef.current = { id: null, status: null };
      return;
    }
    
    const prev = prevTokenStateRef.current;
    
    // Case 1: Newly registered or loaded token
    if (prev.id !== tokenInfo.id) {
      prevTokenStateRef.current = { id: tokenInfo.id, status: tokenInfo.status };
      
      const cleanTokenNum = tokenInfo.token_number.replace('-', ' ');
      const textTe = `మీ టోకెన్ విజయవంతంగా నమోదు చేయబడింది. మీ టోకెన్ నంబర్ ${cleanTokenNum}.`;
      const textEn = `Your token has been registered successfully. Your token number is ${tokenInfo.token_number}.`;
      announceText(textTe, textEn);
      return;
    }
    
    // Case 2: Existing token status changed to active (called)
    if (prev.status !== tokenInfo.status && tokenInfo.status === 'active') {
      const counter = tokenInfo.counter_assigned || (language === 'te' ? 'కౌంటర్ 1' : 'Counter 1');
      const cleanTokenNum = tokenInfo.token_number.replace('-', ' ');
      const textTe = `దయచేసి గమనించండి, మీ టోకెన్ నంబర్ ${cleanTokenNum} పిలవబడింది. దయచేసి ${counter} కి వెళ్ళండి.`;
      const textEn = `Please note, your token number ${tokenInfo.token_number} has been called. Please proceed to ${counter}.`;
      announceText(textTe, textEn);
    }
    
    // Sync current status
    prevTokenStateRef.current.status = tokenInfo.status;
  }, [tokenInfo, soundEnabled, isSpeechSupported, language]);

  // Fetch token status for the logged-in phone number
  const checkStatus = async (overridePhone) => {
    const phone = overridePhone || phoneNumber;
    if (!phone) return;
    setLoading(true);
    setErrorMsg('');
    const fullPhone = '+91' + phone;
    try {
      // Query backend for active token details
      const tokenRes = await fetch(`${backendUrl}/api/tokens`);
      if (tokenRes.ok) {
        const allTokens = await tokenRes.json();
        const activeToken = allTokens.find(
          t => t.phone_number === fullPhone && ['waiting', 'active', 'no_show'].includes(t.status)
        );
        
        if (activeToken) {
          setTokenInfo(activeToken);
        } else {
          setTokenInfo(null);
        }
      } else {
        setErrorMsg(language === 'te' ? 'క్యూ తనిఖీ చేయడంలో లోపం. మళ్లీ ప్రయత్నించండి.' : 'Error checking queue. Try again.');
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్‌ని సంప్రదించలేకపోయింది.' : 'Failed to reach server.');
    } finally {
      setLoading(false);
      setInitialChecked(true);
    }
  };

  // Access portal: save to localStorage for persistence across reloads
  const handleAccessPortal = async (e) => {
    if (e) e.preventDefault();
    if (!phoneNumber || phoneNumber.length !== 10) {
      setErrorMsg(language === 'te' ? 'దయచేసి సరైన 10 అంకెల మొబైల్ నంబర్ నమోదు చేయండి.' : 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      localStorage.setItem('cp_phone', phoneNumber);
      localStorage.setItem('cp_name', customerName.trim());
      setIsVerified(true);
      setInitialChecked(false);
      await checkStatus(phoneNumber);
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్ కనెక్షన్ విఫలమైంది.' : 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // One-click register token after successful login
  const handleRegisterToken = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    const fullPhone = '+91' + phoneNumber;

    try {
      const res = await fetch(`${backendUrl}/api/tokens/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: fullPhone,
          customer_name: customerName.trim() || null
        })
      });

      if (res.ok) {
        const tokenData = await res.json();
        setTokenInfo(tokenData);
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || (language === 'te' ? 'టోకెన్ నమోదు చేయడంలో లోపం. మళ్లీ ప్రయత్నించండి.' : 'Error generating token. Try again.'));
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్ కనెక్షన్ విఫలమైంది.' : 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch live queue stats to show on registration screen
  const fetchQueueInfo = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/tokens`);
      if (res.ok) {
        const allTokens = await res.json();
        const waiting = allTokens.filter(t => t.status === 'waiting');
        const active = allTokens.filter(t => t.status === 'active');
        const tokenNums = allTokens.map(t => {
          if (!t.token_number) return 0;
          const match = t.token_number.match(/\d+/);
          return match ? parseInt(match[0], 10) : 0;
        });
        const maxToken = tokenNums.length > 0 ? Math.max(...tokenNums) : 0;
        setQueueInfo({
          waitingCount: waiting.length,
          activeCount: active.length,
          nextToken: maxToken + 1,
          estimatedWait: waiting.length * 5,
        });
      }
    } catch (err) {
      // silent fail
    }
  };

  // On mount: if phone saved in localStorage, auto-restore session
  useEffect(() => {
    const savedPhone = localStorage.getItem('cp_phone');
    if (savedPhone && savedPhone.length === 10) {
      setIsVerified(true);
      checkStatus(savedPhone);
    }
    fetchQueueInfo();
  }, []);

  // Auto-refresh token status every 15s when logged in
  useEffect(() => {
    if (!isVerified || !phoneNumber) return;
    const interval = setInterval(() => checkStatus(phoneNumber), 15000);
    return () => clearInterval(interval);
  }, [isVerified, phoneNumber]);

  // Refresh queue info every 20s when on registration screen
  useEffect(() => {
    if (!isVerified || tokenInfo) return;
    fetchQueueInfo();
    const interval = setInterval(fetchQueueInfo, 20000);
    return () => clearInterval(interval);
  }, [isVerified, tokenInfo]);

  return (
    <div className="max-w-md mx-auto min-h-[500px] flex flex-col justify-between p-6 bg-slate-900 border border-slate-800/80 rounded-[2rem] shadow-2xl relative overflow-hidden my-4">
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-850 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center p-1 overflow-hidden shadow-inner">
            <img 
              src={`${import.meta.env.BASE_URL || ''}login_illustration.png`} 
              alt="Sri Tirumala Rice Mill Logo" 
              className="w-full h-full object-contain rounded-lg"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=600";
              }}
            />
          </div>
          <div>
            <h2 className="font-extrabold text-sm text-slate-100 uppercase tracking-wider">{t.appName}</h2>
            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase font-bold">{t.customerPortal}</span>
          </div>
        </div>
        {isSpeechSupported && (
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem('cp_sound', next ? 'true' : 'false');
            }}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-200 border border-slate-850 transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-bold"
            title={soundEnabled ? "Mute Voice" : "Enable Voice"}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-bold hidden sm:inline">{language === 'te' ? 'వాయిస్ ఆన్' : 'Voice On'}</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-bold hidden sm:inline">{language === 'te' ? 'వాయిస్ ఆఫ్' : 'Voice Off'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center py-4">
        {!isVerified ? (
          /* Mobile Number Login Screen */
          <form onSubmit={handleAccessPortal} className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h3 className="text-lg font-bold text-slate-200">{t.registerOrCheckToken}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{t.portalDesc}</p>
            </div>

            {errorMsg && (
              <div className="bg-rose-955/40 border border-rose-900/20 text-rose-400 p-3 rounded-xl text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">
                {language === 'te' ? 'మీ పేరు' : 'Your Name'}
              </label>
              <input
                type="text"
                placeholder={language === 'te' ? 'ఉదా: రామయ్య' : 'e.g. Ramaiah'}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-medium placeholder:text-slate-700"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">{t.enterMobile}</label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-xs text-slate-500 font-mono">+91</span>
                <input type="tel" required placeholder="9876543210" pattern="[0-9]{10}"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-12 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-mono"
                  value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 py-3.5 rounded-xl text-xs font-extrabold transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider">
              {loading ? (language === 'te' ? 'యాక్సెస్ చేస్తోంది...' : 'Accessing...') : (language === 'te' ? 'పోర్టల్ ప్రవేశించు' : 'Access Portal')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* Verified Views: Show ticket info if registered, or register option if new client */
          <div className="space-y-6 animate-fade-in">
            {!initialChecked ? (
              /* Loading screen during initial check */
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-500 font-semibold">
                  {language === 'te' ? 'క్యూ స్థితిని తనిఖీ చేస్తున్నాము...' : 'Checking queue status...'}
                </p>
              </div>
            ) : justRegistered ? (
              /* Registration Success — waiting for token confirmation */
              <div className="flex flex-col items-center justify-center py-10 space-y-5 text-center animate-fade-in">
                <div className="relative w-20 h-20">
                  <svg className="w-20 h-20 animate-spin text-emerald-500/30" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="56 170" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl">🎫</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-base font-extrabold text-emerald-400">
                    {language === 'te' ? 'టోకెన్ నమోదు అవుతోంది...' : 'Registering your token...'}
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed max-w-[220px] mx-auto">
                    {language === 'te'
                      ? 'దయచేసి వేచి ఉండండి. మీ టోకెన్ నంబర్ కొద్ది సేపట్లో వస్తుంది.'
                      : 'Please wait. Your token number will appear in a moment.'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            ) : tokenInfo ? (
              /* Live Ticket view */
              <div className="space-y-5 text-center">
              <div className="space-y-2">
                  {(tokenInfo.customer_name || customerName) && (
                    <p className="text-[11px] text-amber-400 font-bold tracking-wide">
                      👋 {language === 'te' ? 'నమస్కారం,' : 'Hello,'} {tokenInfo.customer_name || customerName}
                    </p>
                  )}
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-extrabold font-mono">{t.yourActiveTicket}</span>
                  <div className="text-5xl font-black text-slate-200 font-mono bg-slate-950 py-5 border border-slate-850 rounded-2xl tracking-wide select-none shadow-inner">
                    {tokenInfo.token_number}
                  </div>
                </div>

                {/* Queue status descriptors */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-850/60 flex items-center justify-between text-left">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{language === 'te' ? 'క్యూ స్థితి' : 'Queue status'}</span>
                      <div className="text-xs font-bold text-slate-350 capitalize mt-1">
                        {tokenInfo.status === 'active' ? t.activeCounter : 
                         tokenInfo.status === 'no_show' ? t.markNoShow : t.waiting}
                      </div>
                    </div>
                    <Users className="w-5 h-5 text-emerald-500 stroke-1" />
                  </div>

                  <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-850/60 flex items-center justify-between text-left">
                    <div>
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">{t.estimatedWait}</span>
                      <div className="text-xs font-bold text-slate-350 mt-1">~{tokenInfo.wait_time_minutes} {language === 'te' ? 'ని.' : 'mins'}</div>
                    </div>
                    <Clock className="w-5 h-5 text-amber-500 stroke-1" />
                  </div>
                </div>

                {/* Status messages depending on state */}
                <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 text-xs text-slate-400 font-semibold leading-relaxed">
                  {tokenInfo.status === 'active' ? (
                    <span className="text-emerald-400 font-bold block animate-pulse">
                      📍 {t.activeWaitStatus.replace('counter', tokenInfo.counter_assigned || 'Counter 1')}
                    </span>
                  ) : tokenInfo.status === 'no_show' ? (
                    <span className="text-rose-455 font-bold block">
                      {t.noShowStatus}
                    </span>
                  ) : (
                    <span>
                      {t.waitingWaitStatus}
                    </span>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={checkStatus}
                    className="flex-1 bg-slate-855 hover:bg-slate-800 text-slate-350 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                    {language === 'te' ? 'తాజాకరించు' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => {
                      setIsVerified(false);
                      setTokenInfo(null);
                      setPhoneNumber('');
                      setCustomerName('');
                      setInitialChecked(false);
                      localStorage.removeItem('cp_phone');
                      localStorage.removeItem('cp_name');
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-slate-200 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {language === 'te' ? 'లాగ్ అవుట్' : 'Sign Out'}
                  </button>
                </div>
              </div>
            ) : (
              /* No token exists yet - offer direct registration */
              <div className="space-y-5 text-center">
                <div className="space-y-2 pt-2">
                  <UserCheck className="w-10 h-10 text-emerald-400 mx-auto stroke-1" />
                  <h3 className="text-base font-bold text-slate-200">
                    {language === 'te' ? 'ధృవీకరణ పూర్తయింది ✓' : 'Verified ✓'}
                  </h3>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                    {language === 'te'
                      ? 'ఈ రోజు మీ నంబర్‌కు ఎలాంటి సక్రియ టోకెన్ లేదు.'
                      : 'No active token for your number today.'}
                  </p>
                </div>

                {/* Live Queue Status */}
                {queueInfo && (
                  <div className="bg-slate-950/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                      {language === 'te' ? '📊 ప్రస్తుత క్యూ స్థితి' : '📊 Live Queue Status'}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-900 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-xl font-black text-amber-400 font-mono">{queueInfo.waitingCount}</div>
                        <div className="text-[9px] text-slate-500 font-semibold mt-0.5">{language === 'te' ? 'వేచి ఉన్నారు' : 'Waiting'}</div>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-xl font-black text-emerald-400 font-mono">#{queueInfo.nextToken}</div>
                        <div className="text-[9px] text-slate-500 font-semibold mt-0.5">{language === 'te' ? 'మీ టోకెన్' : 'Your Token'}</div>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-2.5 border border-slate-800">
                        <div className="text-xl font-black text-slate-300 font-mono">~{queueInfo.estimatedWait}m</div>
                        <div className="text-[9px] text-slate-500 font-semibold mt-0.5">{language === 'te' ? 'అంచనా వేచి' : 'Est. Wait'}</div>
                      </div>
                    </div>
                    {queueInfo.waitingCount === 0 && (
                      <p className="text-[10px] text-emerald-400 font-bold">
                        🟢 {language === 'te' ? 'క్యూ ఖాళీగా ఉంది! వెంటనే టోకెన్ పొందండి.' : 'Queue is empty! Get your token instantly.'}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2 text-left max-w-xs mx-auto pb-2">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    {language === 'te' ? 'కస్టమర్ పేరు' : 'Customer Name'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'te' ? 'ఉదా: రాము' : 'Enter name (e.g. Ramu)'}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-medium placeholder:text-slate-700"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                {errorMsg && (
                  <div className="bg-rose-955/40 border border-rose-900/20 text-rose-455 p-3 rounded-xl text-xs text-center font-medium">
                    {errorMsg}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsVerified(false);
                      setTokenInfo(null);
                      setPhoneNumber('');
                      setCustomerName('');
                      setInitialChecked(false);
                      localStorage.removeItem('cp_phone');
                      localStorage.removeItem('cp_name');
                    }}
                    className="flex-1 bg-slate-855 hover:bg-slate-800 text-slate-355 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 cursor-pointer uppercase tracking-wider"
                  >
                    {language === 'te' ? 'లాగ్ అవుట్' : 'Sign Out'}
                  </button>
                  <button
                    onClick={handleRegisterToken}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-555 text-white py-3.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider animate-pulse-slow"
                  >
                    {loading ? (language === 'te' ? 'జనరేట్ అవుతోంది...' : 'Generating...') : (language === 'te' ? 'టోకెన్ పొందండి' : 'Get Token')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer warning */}
      <div className="border-t border-slate-850/60 pt-4 text-[9px] text-slate-500 text-center font-mono leading-normal">
        <span>{t.noInternetTip}</span>
      </div>
    </div>
  );
}
