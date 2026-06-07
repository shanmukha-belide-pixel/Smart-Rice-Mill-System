import React, { useState, useEffect } from 'react';
import { Phone, Users, Clock, ArrowRight, UserCheck, Flame, RefreshCw } from 'lucide-react';
import { translations } from '../utils/translations';

export default function CustomerPortal({ backendUrl, language }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const t = translations[language || 'te'];

  // Fetch token status for the logged-in phone number
  const checkStatus = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const formData = new FormData();
      formData.append('From', phoneNumber);
      formData.append('Body', 'STATUS');

      const res = await fetch(`${backendUrl}/api/webhooks/sms`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        // Query backend for active token details
        const tokenRes = await fetch(`${backendUrl}/api/tokens`);
        if (tokenRes.ok) {
          const allTokens = await tokenRes.json();
          const activeToken = allTokens.find(
            t => t.phone_number === phoneNumber && ['waiting', 'active', 'no_show'].includes(t.status)
          );
          
          if (activeToken) {
            setTokenInfo(activeToken);
            setIsLoggedIn(true);
          } else {
            setErrorMsg(language === 'te' ? 'ఈ రోజు మీ ఫోన్ నంబర్‌కు సక్రియ టోకెన్ లేదు.' : 'No active token found for this phone number today.');
            setTokenInfo(null);
          }
        }
      } else {
        setErrorMsg(language === 'te' ? 'క్యూ తనిఖీ చేయడంలో లోపం. మళ్లీ ప్రయత్నించండి.' : 'Error checking queue. Try again.');
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్‌ని సంప్రదించలేకపోయింది.' : 'Failed to reach server.');
    } finally {
      setLoading(false);
    }
  };

  // One-click register token
  const handleRegisterToken = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('From', phoneNumber);
      formData.append('Body', 'TOKEN');

      const res = await fetch(`${backendUrl}/api/webhooks/sms`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        // Fetch to confirm and display
        setTimeout(checkStatus, 1000);
      } else {
        setErrorMsg(language === 'te' ? 'టోకెన్ నమోదు చేయడంలో లోపం. మళ్లీ ప్రయత్నించండి.' : 'Error generating token. Try again.');
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్ కనెక్షన్ విఫలమైంది.' : 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh when logged in
  useEffect(() => {
    let interval;
    if (isLoggedIn) {
      interval = setInterval(checkStatus, 15000);
    }
    return () => clearInterval(interval);
  }, [isLoggedIn, phoneNumber]);

  return (
    <div className="max-w-md mx-auto min-h-[500px] flex flex-col justify-between p-6 bg-slate-900 border border-slate-800/80 rounded-[2rem] shadow-2xl relative overflow-hidden my-4">
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-slate-850 pb-4 mb-4">
        <div className="bg-emerald-500/10 p-1.5 rounded-xl border border-emerald-500/20">
          <Flame className="w-5 h-5 text-emerald-400 fill-emerald-500/10" />
        </div>
        <div>
          <h2 className="font-extrabold text-sm text-slate-100 uppercase tracking-wider">{t.appName}</h2>
          <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase font-bold">{t.customerPortal}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center py-4">
        {!isLoggedIn ? (
          /* Login/Register Form */
          <form onSubmit={handleRegisterToken} className="space-y-5 animate-fade-in">
            <div className="text-center space-y-1 pb-2">
              <h3 className="text-lg font-bold text-slate-200">{t.registerOrCheckToken}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{t.portalDesc}</p>
            </div>

            {errorMsg && (
              <div className="bg-rose-950/40 border border-rose-900/20 text-rose-400 p-3 rounded-xl text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-400">{t.enterMobile}</label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-xs text-slate-500 font-mono">+91</span>
                <input
                  type="tel"
                  required
                  placeholder="9876543210"
                  pattern="[0-9]{10}"
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-12 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={checkStatus}
                disabled={loading}
                className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-300 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 cursor-pointer"
              >
                {t.checkStatus}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 text-white py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {loading ? (language === 'te' ? 'ప్రాసెస్ అవుతోంది...' : 'Processing...') : t.registerToken}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          /* Live Ticket view */
          <div className="space-y-6 text-center animate-fade-in">
            {tokenInfo && (
              <div className="space-y-5">
                <div className="space-y-2">
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
                    <span className="text-rose-450 font-bold block">
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
                    className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-350 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                    {language === 'te' ? 'తాజాకరించు' : 'Refresh'}
                  </button>
                  <button
                    onClick={() => {
                      setIsLoggedIn(false);
                      setTokenInfo(null);
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-slate-200 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {t.logoutPhone}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer warning */}
      <div className="border-t border-slate-850/60 pt-4 text-[9px] text-slate-500 text-center font-mono leading-normal">
        {language === 'te' ? (
          <span>ఇంటర్నెట్ లేదా? మా ఉచిత నంబర్ <span className="text-slate-400 font-bold">+91-XXX-XXX-XXXX</span> కు మిస్డ్ కాల్ ఇవ్వండి. వెంటనే ఉచిత ఎస్ఎమ్ఎస్ ద్వారా మీ టోకెన్ వివరాలను పొందండి.</span>
        ) : (
          <span>No internet? Give a missed call to <span className="text-slate-400 font-bold">+91-XXX-XXX-XXXX</span>. We will reply instantly with your token details via free SMS.</span>
        )}
      </div>
    </div>
  );
}
