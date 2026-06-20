import React, { useState, useEffect } from 'react';
import { Phone, Mail, Users, Clock, ArrowRight, UserCheck, RefreshCw, Key } from 'lucide-react';
import { translations } from '../utils/translations';

export default function CustomerPortal({ backendUrl, language }) {
  const [mode, setMode] = useState('phone'); // 'phone' | 'email'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const t = translations[language || 'te'];
  const isPhone = mode === 'phone';

  // Fetch token status for the logged-in phone number
  const checkStatus = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    setErrorMsg('');
    const fullPhone = '+91' + phoneNumber;
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
    }
  };

  // Request OTP (phone or email)
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (isPhone && (!phoneNumber || phoneNumber.length !== 10)) {
      setErrorMsg(language === 'te' ? 'దయచేసి సరైన 10 అంకెల మొబైల్ నంబర్ నమోదు చేయండి.' : 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!isPhone && (!email || !email.includes('@'))) {
      setErrorMsg(language === 'te' ? 'దయచేసి సరైన ఇమెయిల్ చిరునామా నమోదు చేయండి.' : 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      let res;
      if (isPhone) {
        res = await fetch(`${backendUrl}/api/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: '+91' + phoneNumber }),
        });
      } else {
        res = await fetch(`${backendUrl}/api/auth/send-email-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      }
      if (res.ok) {
        setIsOtpSent(true);
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || (language === 'te' ? 'OTP పంపడంలో లోపం.' : 'Failed to send OTP.'));
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్ కనెక్షన్ విఫలమైంది.' : 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP (phone or email)
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      setErrorMsg(language === 'te' ? 'దయచేసి 6 అంకెల OTP ని నమోదు చేయండి.' : 'Please enter a 6-digit OTP code.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      let res;
      if (isPhone) {
        res = await fetch(`${backendUrl}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: '+91' + phoneNumber, otp }),
        });
      } else {
        res = await fetch(`${backendUrl}/api/auth/verify-email-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp }),
        });
      }
      if (res.ok) {
        setIsVerified(true);
        await checkStatus();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || (language === 'te' ? 'తప్పు OTP ని నమోదు చేసారు.' : 'Invalid OTP code.'));
      }
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
      const formData = new FormData();
      formData.append('From', fullPhone);
      formData.append('Body', 'TOKEN');

      const res = await fetch(`${backendUrl}/api/webhooks/sms`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setTimeout(checkStatus, 1100);
      } else {
        setErrorMsg(language === 'te' ? 'టోకెన్ నమోదు చేయడంలో లోపం. మళ్లీ ప్రయత్నించండి.' : 'Error generating token. Try again.');
      }
    } catch (err) {
      setErrorMsg(language === 'te' ? 'సర్వర్ కనెక్షన్ విఫలమైంది.' : 'Server connection failed.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh when logged in & verified
  useEffect(() => {
    let interval;
    if (isVerified) {
      interval = setInterval(checkStatus, 15000);
    }
    return () => clearInterval(interval);
  }, [isVerified, phoneNumber]);

  return (
    <div className="max-w-md mx-auto min-h-[500px] flex flex-col justify-between p-6 bg-slate-900 border border-slate-800/80 rounded-[2rem] shadow-2xl relative overflow-hidden my-4">
      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-slate-850 pb-4 mb-4">
        <div>
          <h2 className="font-extrabold text-sm text-slate-100 uppercase tracking-wider">{t.appName}</h2>
          <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase font-bold">{t.customerPortal}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center py-4">
        {!isVerified ? (
          /* Phone OTP Login Screen */
          <div className="space-y-6">
            {!isOtpSent ? (
              /* Step 1: Input Phone Number */
              <form onSubmit={handleSendOtp} className="space-y-5 animate-fade-in">
                <div className="text-center space-y-1 pb-2">
                  <h3 className="text-lg font-bold text-slate-200">{t.registerOrCheckToken}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{t.portalDesc}</p>
                </div>

                {/* Phone / Email Toggle */}
                <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-850">
                  <button type="button" onClick={() => { setMode('phone'); setErrorMsg(''); setIsOtpSent(false); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${isPhone ? 'bg-slate-900 text-amber-400 border border-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>
                    <Phone className="w-3 h-3" /> {language === 'te' ? 'ఫోన్ OTP' : 'Phone OTP'}
                  </button>
                  <button type="button" onClick={() => { setMode('email'); setErrorMsg(''); setIsOtpSent(false); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${!isPhone ? 'bg-slate-900 text-amber-400 border border-slate-800 shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>
                    <Mail className="w-3 h-3" /> {language === 'te' ? 'ఇమెయిల్ OTP' : 'Email OTP'}
                  </button>
                </div>

                {errorMsg && (
                  <div className="bg-rose-955/40 border border-rose-900/20 text-rose-400 p-3 rounded-xl text-xs text-center font-medium">
                    {errorMsg}
                  </div>
                )}

                {isPhone ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400">{t.enterMobile}</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-xs text-slate-500 font-mono">+91</span>
                      <input type="tel" required placeholder="9876543210" pattern="[0-9]{10}"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-12 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-mono"
                        value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400">{language === 'te' ? 'ఇమెయిల్ చిరునామా' : 'Email Address'}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
                      <input type="email" required placeholder="you@example.com"
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-12 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-mono"
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 py-3.5 rounded-xl text-xs font-extrabold transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  {loading ? (language === 'te' ? 'పంపుతోంది...' : 'Sending...') : (isPhone ? (language === 'te' ? 'SMS OTP పంపండి' : 'Send SMS OTP') : (language === 'te' ? 'ఇమెయిల్ OTP పంపండి' : 'Send Email OTP'))}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* Step 2: Input 6-Digit OTP */
              <form onSubmit={handleVerifyOtp} className="space-y-5 animate-fade-in">
                <div className="text-center space-y-1 pb-2">
                  <h3 className="text-lg font-bold text-slate-200">
                    {language === 'te' ? 'ఓటిపి ధృవీకరణ' : 'OTP Verification'}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {isPhone
                      ? (language === 'te' ? `+91 ${phoneNumber} కు పంపిన 6-అంకెల కోడ్‌ను నమోదు చేయండి.` : `Enter the 6-digit code sent to +91 ${phoneNumber}.`)
                      : (language === 'te' ? `${email} కు పంపిన 6-అంకెల కోడ్‌ను నమోదు చేయండి.` : `Enter the 6-digit code sent to ${email}.`)
                    }
                  </p>
                </div>

                {errorMsg && (
                  <div className="bg-rose-955/40 border border-rose-900/20 text-rose-400 p-3 rounded-xl text-xs text-center font-medium">
                    {errorMsg}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400">
                    {language === 'te' ? '6-అంకెల OTP ని నమోదు చేయండి' : 'Enter 6-digit OTP'}
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-3.5 text-slate-500 w-4 h-4" />
                    <input
                      type="text" required maxLength="6" pattern="[0-9]{6}" autoFocus
                      placeholder="• • • • • •"
                      className="w-full bg-slate-950 border border-amber-700/40 rounded-xl pl-12 pr-4 py-3 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-amber-300 font-mono tracking-[0.4em] text-center text-lg font-bold"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                  <p className="text-[10px] text-amber-500/50 text-center font-mono">
                    💡 {language === 'te' ? 'పరీక్ష కోడ్: 123456' : 'Test code: 123456'}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setIsOtpSent(false); setOtp(''); setErrorMsg(''); }}
                    className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-350 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 cursor-pointer uppercase tracking-wider"
                  >
                    {language === 'te' ? 'వెనుకకు' : 'Back'}
                  </button>
                  <button
                    type="submit" disabled={loading}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 py-3 rounded-xl text-xs font-extrabold transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                  >
                    {loading ? (language === 'te' ? 'ధృవీకరిస్తోంది...' : 'Verifying...') : (language === 'te' ? 'ధృవీకరించు' : 'Verify Code')}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Verified Views: Show ticket info if registered, or register option if new client */
          <div className="space-y-6 animate-fade-in">
            {tokenInfo ? (
              /* Live Ticket view */
              <div className="space-y-5 text-center">
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
                      setIsOtpSent(false);
                      setOtp('');
                      setTokenInfo(null);
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-slate-200 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    {language === 'te' ? 'లాగ్ అవుట్' : 'Sign Out'}
                  </button>
                </div>
              </div>
            ) : (
              /* No token exists yet - offer direct registration */
              <div className="space-y-6 text-center">
                <div className="space-y-3 py-6">
                  <UserCheck className="w-12 h-12 text-emerald-400 mx-auto stroke-1" />
                  <h3 className="text-lg font-bold text-slate-200">
                    {language === 'te' ? 'ధృవీకరణ పూర్తయింది ✓' : 'Verification Complete ✓'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                    {language === 'te'
                      ? 'ఈ రోజు మీ నంబర్‌కు ఎలాంటి సక్రియ టోకెన్ లేదు. క్యూలో చేరడానికి క్రింది బటన్ నొక్కండి.'
                      : 'You do not have an active token for today. Click below to secure a token in the queue.'}
                  </p>
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
                      setIsOtpSent(false);
                      setOtp('');
                      setTokenInfo(null);
                    }}
                    className="flex-1 bg-slate-855 hover:bg-slate-800 text-slate-350 py-3 rounded-xl text-xs font-bold transition-all border border-slate-800 cursor-pointer uppercase tracking-wider"
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
        {language === 'te' ? (
          <span>ఇంటర్నెట్ లేదా? మా నంబర్ <span className="text-slate-400 font-bold">+91-7075295440</span> కు మిస్డ్ కాల్ ఇవ్వండి. వెంటనే ఉచిత ఎస్ఎమ్ఎస్ ద్వారా మీ టోకెన్ వివరాలను పొందండి.</span>
        ) : (
          <span>No internet? Give a missed call to <span className="text-slate-400 font-bold">+91-7075295440</span>. We will reply instantly with your token details via free SMS.</span>
        )}
      </div>
    </div>
  );
}
