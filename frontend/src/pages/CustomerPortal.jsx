import React, { useState, useEffect, useRef } from 'react';
import { Users, Clock, RefreshCw, Volume2, VolumeX, Search, PlusCircle } from 'lucide-react';
import { translations } from '../utils/translations';

export default function CustomerPortal({ backendUrl, language }) {
  const [activeTab, setActiveTab] = useState('track'); // 'track' or 'register'
  const [tokenNumber, setTokenNumber] = useState(() => localStorage.getItem('cp_token_number') || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [initialChecked, setInitialChecked] = useState(false);

  // Audio/voice announcement states
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('cp_sound') !== 'false'; // default to true
  });
  const prevTokenStateRef = useRef({ token_number: null, status: null });

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
      prevTokenStateRef.current = { token_number: null, status: null };
      return;
    }
    
    const prev = prevTokenStateRef.current;
    
    // Case 1: Newly loaded token
    if (prev.token_number !== tokenInfo.token_number) {
      prevTokenStateRef.current = { token_number: tokenInfo.token_number, status: tokenInfo.status };
      
      const cleanTokenNum = tokenInfo.token_number.replace('-', ' ');
      const textTe = `మీ టోకెన్ విజయవంతంగా గుర్తించబడింది. మీ టోకెన్ నంబర్ ${cleanTokenNum}.`;
      const textEn = `Your token has been found. Your token number is ${tokenInfo.token_number}.`;
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

  // Fetch token status for the token number
  const checkStatus = async (overrideToken) => {
    const target = overrideToken || tokenNumber;
    if (!target) return;
    setLoading(true);
    setErrorMsg('');
    try {
      // Query backend for specific token lookup
      const lookupRes = await fetch(`${backendUrl}/api/tokens/lookup/${target}`);
      if (lookupRes.ok) {
        const data = await lookupRes.json();
        setTokenInfo(data);
        setIsVerified(true);
      } else {
        const err = await lookupRes.json();
        setErrorMsg(err.detail || (language === 'te' ? 'టోకెన్ కనుగొనబడలేదు. దయచేసి సరైన నంబర్ ఇవ్వండి.' : 'Token not found. Please verify token number.'));
        setTokenInfo(null);
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్‌ని సంప్రదించలేకపోయింది.' : 'Failed to reach server.');
      setTokenInfo(null);
    } finally {
      setLoading(false);
      setInitialChecked(true);
    }
  };

  // Track Token submit action
  const handleTrackToken = async (e) => {
    if (e) e.preventDefault();
    if (!tokenNumber.trim()) {
      setErrorMsg(language === 'te' ? 'దయచేసి టోకెన్ నంబర్ నమోదు చేయండి.' : 'Please enter a token number.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      localStorage.setItem('cp_token_number', tokenNumber.trim());
      await checkStatus(tokenNumber.trim());
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్ కనెక్షన్ విఫలమైంది.' : 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // Register Token submit action
  const handleRegisterToken = async (e) => {
    if (e) e.preventDefault();
    if (!phoneNumber || phoneNumber.length !== 10) {
      setErrorMsg(language === 'te' ? 'దయచేసి సరైన 10 అంకెల మొబైల్ నంబర్ నమోదు చేయండి.' : 'Please enter a valid 10-digit mobile number.');
      return;
    }
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
        // Save the registered token number to localstorage & state
        localStorage.setItem('cp_token_number', tokenData.token_number);
        setTokenNumber(tokenData.token_number);
        setTokenInfo({
          token_number: tokenData.token_number,
          customer_name: tokenData.customer_name || "Customer",
          phone_number: tokenData.phone_number,
          status: tokenData.status,
          queue_position: 1, // Will refresh accurately on next status check
          estimated_wait_minutes: tokenData.wait_time_minutes
        });
        setIsVerified(true);
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

  // On mount: if token number saved in localStorage, auto-restore session
  useEffect(() => {
    const savedToken = localStorage.getItem('cp_token_number');
    if (savedToken) {
      setIsVerified(true);
      checkStatus(savedToken);
    }
  }, []);

  // Auto-refresh token status every 15s when active
  useEffect(() => {
    if (!isVerified || !tokenNumber) return;
    const interval = setInterval(() => checkStatus(tokenNumber), 15000);
    return () => clearInterval(interval);
  }, [isVerified, tokenNumber]);

  return (
    <div className="max-w-md mx-auto min-h-[500px] flex flex-col justify-between p-6 bg-slate-900 border border-slate-800/80 rounded-[2rem] shadow-2xl relative overflow-hidden my-4">
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-850 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-slate-950/60 border border-amber-800/30 flex items-center justify-center overflow-hidden shadow-inner">
            <img 
              src={`${import.meta.env.BASE_URL || ''}tirumala_logo.png`} 
              alt="Sri Tirumala Rice Mill Logo" 
              className="w-full h-full object-cover rounded-lg"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `${import.meta.env.BASE_URL || ''}login_illustration.png`;
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
        {!isVerified || !tokenInfo ? (
          /* Form tab views: Track vs Register */
          <div className="space-y-5 animate-fade-in">
            {/* Tab switchers */}
            <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-850">
              <button 
                type="button" 
                onClick={() => { setActiveTab('track'); setErrorMsg(''); }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'track' ? 'bg-slate-900 text-amber-500 border border-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-400'}`}
              >
                🔍 {language === 'te' ? 'ట్రాక్ టోకెన్' : 'Track Token'}
              </button>
              <button 
                type="button" 
                onClick={() => { setActiveTab('register'); setErrorMsg(''); }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'register' ? 'bg-slate-900 text-amber-500 border border-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-400'}`}
              >
                ➕ {language === 'te' ? 'కొత్త టోకెన్' : 'New Token'}
              </button>
            </div>

            {errorMsg && (
              <div className="bg-rose-955/40 border border-rose-900/20 text-rose-455 p-3 rounded-xl text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}

            {activeTab === 'track' ? (
              /* TRACK TOKEN FORM */
              <form onSubmit={handleTrackToken} className="space-y-4">
                <div className="text-center space-y-1 pb-1">
                  <h3 className="text-sm font-bold text-slate-350">
                    {language === 'te' ? 'టోకెన్ స్థితి శోధించండి' : 'Search Token Status'}
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    {language === 'te' 
                      ? 'లైవ్ స్థితిని చూడడానికి మీ టోకెన్ నంబర్ నమోదు చేయండి.' 
                      : 'Enter token number to see live status.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400">
                    {language === 'te' ? 'టోకెన్ నంబర్' : 'Token Number'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={language === 'te' ? 'ఉదా: T-005 లేదా 5' : 'e.g. T-005 or 5'}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-mono tracking-widest uppercase"
                    value={tokenNumber}
                    onChange={(e) => setTokenNumber(e.target.value)}
                  />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 py-3.5 rounded-xl text-xs font-extrabold transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  <Search className="w-4 h-4" />
                  {loading ? (language === 'te' ? 'శోధిస్తోంది...' : 'Searching...') : (language === 'te' ? 'ట్రాక్ చేయండి' : 'Track Token')}
                </button>
              </form>
            ) : (
              /* REGISTER TOKEN FORM */
              <form onSubmit={handleRegisterToken} className="space-y-4">
                <div className="text-center space-y-1 pb-1">
                  <h3 className="text-sm font-bold text-slate-350">
                    {language === 'te' ? 'కొత్త టోకెన్ కోసం నమోదు చేసుకోండి' : 'Register New Token'}
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    {language === 'te' 
                      ? 'మీ పేరు మరియు మొబైల్ నంబర్ ఇచ్చి టోకెన్ జెనరేట్ చేయండి.' 
                      : 'Provide name & mobile number to generate a token.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400">
                    {language === 'te' ? 'మీ పేరు' : 'Your Name'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={language === 'te' ? 'ఉదా: రామయ్య' : 'e.g. Ramaiah'}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-medium placeholder:text-slate-700"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400">
                    {language === 'te' ? 'మొబైల్ నంబర్' : 'Mobile Number'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-xs text-slate-500 font-mono">+91</span>
                    <input 
                      type="tel" 
                      required 
                      placeholder="9876543210" 
                      pattern="[0-9]{10}"
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-12 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-mono"
                      value={phoneNumber} 
                      onChange={(e) => setPhoneNumber(e.target.value)} 
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-655 hover:from-emerald-500 hover:to-teal-555 text-white py-3.5 rounded-xl text-xs font-extrabold transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  <PlusCircle className="w-4 h-4" />
                  {loading ? (language === 'te' ? 'నమోదు అవుతోంది...' : 'Registering...') : (language === 'te' ? 'టోకెన్ పొందండి' : 'Get Token')}
                </button>
              </form>
            )}
          </div>
        ) : (
          /* Live Ticket view */
          <div className="space-y-5 text-center animate-fade-in">
            <div className="space-y-2">
              {tokenInfo.customer_name && (
                <p className="text-[11px] text-amber-450 font-bold tracking-wide">
                  👋 {language === 'te' ? 'నమస్కారం,' : 'Hello,'} {tokenInfo.customer_name}
                </p>
              )}
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-extrabold font-mono">
                {language === 'te' ? 'మీ యాక్టివ్ టోకెన్' : 'Your Active Token'}
              </span>
              <div className="text-5xl font-black text-slate-200 font-mono bg-slate-950 py-5 border border-slate-850 rounded-2xl tracking-wide select-none shadow-inner">
                {tokenInfo.token_number}
              </div>
            </div>

            {/* Queue status descriptors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-955/60 p-3.5 rounded-2xl border border-slate-850/60 flex items-center justify-between text-left">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                    {language === 'te' ? 'క్యూ స్థితి' : 'Queue Status'}
                  </span>
                  <div className="text-xs font-bold text-slate-350 capitalize mt-1">
                    {tokenInfo.status === 'active' ? t.activeCounter : 
                     tokenInfo.status === 'no_show' ? t.markNoShow : 
                     tokenInfo.status === 'served' ? (language === 'te' ? 'పూర్తయింది' : 'Served') : t.waiting}
                  </div>
                </div>
                <Users className="w-5 h-5 text-emerald-500 stroke-1" />
              </div>

              <div className="bg-slate-955/60 p-3.5 rounded-2xl border border-slate-855/60 flex items-center justify-between text-left">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                    {tokenInfo.status === 'waiting' ? (language === 'te' ? 'స్థానం' : 'Position') : t.estimatedWait}
                  </span>
                  <div className="text-xs font-bold text-slate-350 mt-1">
                    {tokenInfo.status === 'waiting' 
                      ? `${language === 'te' ? '#' : 'No. '}${tokenInfo.queue_position || 1}`
                      : tokenInfo.status === 'served' ? '-' : `~${tokenInfo.estimated_wait_minutes || 0} ${language === 'te' ? 'ని.' : 'mins'}`}
                  </div>
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
              ) : tokenInfo.status === 'served' ? (
                <span className="text-emerald-550 font-bold block">
                  🎉 {language === 'te' ? 'ధన్యవాదాలు! మీ సేవ విజయవంతంగా పూర్తయింది.' : 'Thank you! Your service has been completed successfully.'}
                </span>
              ) : (
                <span>
                  {language === 'te' 
                    ? `మీరు వేచి ఉండవలసిన స్థానం: ${tokenInfo.queue_position}. దయచేసి పిలుపు కోసం సిద్ధంగా ఉండండి.`
                    : `You are at position: ${tokenInfo.queue_position} in the queue. Please stay nearby for your turn.`}
                </span>
              )}
            </div>

            {/* Displaying Customer Name & Phone Number */}
            <div className="bg-slate-950/50 border border-slate-850/80 rounded-2xl p-3.5 text-xs text-left space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">{language === 'te' ? 'కస్టమర్ పేరు:' : 'Customer Name:'}</span>
                <span className="font-bold text-slate-200">{tokenInfo.customer_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{language === 'te' ? 'మొబైల్ నంబర్:' : 'Mobile Number:'}</span>
                <span className="font-mono font-bold text-slate-300">{tokenInfo.phone_number || '-'}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => checkStatus()}
                disabled={loading}
                className="flex-1 bg-slate-855 hover:bg-slate-800 text-slate-355 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-500 ${loading ? 'animate-spin' : ''}`} />
                {language === 'te' ? 'తాజాకరించు' : 'Refresh'}
              </button>
              <button
                onClick={() => {
                  setIsVerified(false);
                  setTokenInfo(null);
                  setTokenNumber('');
                  setInitialChecked(false);
                  localStorage.removeItem('cp_token_number');
                }}
                className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-slate-200 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                {language === 'te' ? 'వెనుకకు' : 'Go Back'}
              </button>
            </div>
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

