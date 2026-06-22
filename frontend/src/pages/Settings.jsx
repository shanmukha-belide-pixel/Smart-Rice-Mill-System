import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Phone, Clock, AlertTriangle, Shield, Check, ListFilter, Play, RefreshCw } from 'lucide-react';
import { translations } from '../utils/translations';

export default function Settings({ backendUrl, userToken, language }) {
  const [settings, setSettings] = useState({
    mill_name: 'Sri Tirumala Rice Mill',
    virtual_number: '+917075295440',
    holiday_mode: false,
    queue_hold: false,
    avg_service_time: 8,
    sms_gateway_active: true
  });
  
  const [priceHistory, setPriceHistory] = useState([]);
  const [securityStatus, setSecurityStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState(''); // 'saving', 'success', 'error'
  const [testSmsStatus, setTestSmsStatus] = useState(''); // 'sending', 'success', 'error'
  const [twoFaPhone, setTwoFaPhone] = useState('');
  const [twoFaSaveStatus, setTwoFaSaveStatus] = useState(''); // 'saving', 'success', 'error', 'clearing'
  
  const t = translations[language || 'te'];

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${backendUrl}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
      
      const histRes = await fetch(`${backendUrl}/api/stock/price-history`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (histRes.ok) {
        const histData = await histRes.json();
        setPriceHistory(histData);
      }

      const secRes = await fetch(`${backendUrl}/api/users/security`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (secRes.ok) {
        const secData = await secRes.json();
        setSecurityStatus(secData);
      }
    } catch (err) {
      console.error('Error fetching settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // Load 2FA phone number
    fetch(`${backendUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    }).then(r => r.json()).then(d => setTwoFaPhone(d.phone_number || '')).catch(() => {});
  }, [backendUrl]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaveStatus('saving');
    try {
      const res = await fetch(`${backendUrl}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus(''), 2000);
        fetchConfig();
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const handleSaveTwoFaPhone = async () => {
    setTwoFaSaveStatus('saving');
    try {
      const res = await fetch(`${backendUrl}/api/auth/update-phone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
        body: JSON.stringify({ phone_number: twoFaPhone })
      });
      if (res.ok) { setTwoFaSaveStatus('success'); setTimeout(() => setTwoFaSaveStatus(''), 2000); }
      else { setTwoFaSaveStatus('error'); }
    } catch { setTwoFaSaveStatus('error'); }
  };

  const handleClearTwoFaPhone = async () => {
    setTwoFaSaveStatus('clearing');
    try {
      const res = await fetch(`${backendUrl}/api/auth/update-phone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
        body: JSON.stringify({ phone_number: '' })
      });
      if (res.ok) { setTwoFaPhone(''); setTwoFaSaveStatus('success'); setTimeout(() => setTwoFaSaveStatus(''), 2000); }
      else { setTwoFaSaveStatus('error'); }
    } catch { setTwoFaSaveStatus('error'); }
  };

  const handleSendTestSms = async () => {
    setTestSmsStatus('sending');
    try {
      // Fetch daily report preview
      const reportRes = await fetch(`${backendUrl}/api/reports/daily`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (!reportRes.ok) throw new Error();
      const dailyData = await reportRes.json();
      
      // Construct sample SMS
      const stockSplit = Object.entries(dailyData.stock_consumed)
        .map(([varName, qty]) => `  ├ ${varName}: ${qty.toFixed(0)} kg`)
        .join('\n') || '  ├ None';
        
      const smsText = `📊 ${settings.mill_name || 'Sri Tirumala Rice Mill'} - Daily Report\nDate: ${dailyData.date}\n----------------------\nTokens Served: ${dailyData.tokens_served}\nNo-Shows: ${dailyData.no_shows} (${dailyData.no_show_rate.toFixed(1)}%)\nTotal Revenue: ₹${dailyData.total_revenue.toLocaleString('en-IN')}\nStock Consumed:\n${stockSplit}`;
      
      // Trigger simulation via standard SMS send logic
      const formData = new FormData();
      formData.append('From', '+919999999999'); // send mock SMS to Owner
      formData.append('Body', 'STATUS'); // dummy action, just logic check
      
      // Directly call simulator dispatch
      const res = await fetch(`${backendUrl}/api/webhooks/sms`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` },
        body: new URLSearchParams({
          From: '+919999999999',
          Body: `MOCK_SMS_REPORT: ${smsText}`
        })
      });
      
      if (res.ok) {
        setTestSmsStatus('success');
        setTimeout(() => setTestSmsStatus(''), 2000);
      } else {
        setTestSmsStatus('error');
      }
    } catch (err) {
      setTestSmsStatus('error');
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
        <span>{language === 'te' ? 'సెట్టింగులను లోడ్ చేస్తోంది...' : 'Loading settings config...'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-slate-900/40 backdrop-blur-md p-5 rounded-3xl border border-slate-800/80 shadow-lg relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t.settings}</h2>
          <p className="text-xs text-slate-400">Configure mill variables, security locks, and SMS gateways</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            
            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Mill name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.millNameSetting}</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-bold"
                    value={settings.mill_name}
                    onChange={(e) => setSettings({ ...settings, mill_name: e.target.value })}
                  />
                </div>
                {/* Virtual number */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.virtualNumberSetting}</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                    value={settings.virtual_number}
                    onChange={(e) => setSettings({ ...settings, virtual_number: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Avg Service Time */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.avgServiceTimeSetting}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                    value={settings.avg_service_time}
                    onChange={(e) => setSettings({ ...settings, avg_service_time: parseInt(e.target.value) || 8 })}
                  />
                </div>
                {/* Checkboxes Wrapper */}
                <div className="flex flex-col justify-center gap-4 mt-2">
                  <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-350 select-none">
                    <input
                      type="checkbox"
                      className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4.5 h-4.5"
                      checked={settings.holiday_mode}
                      onChange={(e) => setSettings({ ...settings, holiday_mode: e.target.checked })}
                    />
                    <span>{t.holidayModeSetting}</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer text-xs font-semibold text-slate-350 select-none">
                    <input
                      type="checkbox"
                      className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4.5 h-4.5"
                      checked={settings.queue_hold}
                      onChange={(e) => setSettings({ ...settings, queue_hold: e.target.checked })}
                    />
                    <span>{t.queueHoldSetting}</span>
                  </label>
                </div>
              </div>

              {/* SMS Gateway Toggle */}
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-850/60 flex justify-between items-center text-xs">
                <div>
                  <h4 className="font-bold text-slate-300">{t.smsGatewaySetting}</h4>
                  <p className="text-[10px] text-slate-500 mt-1">If enabled, SMS APIs (Exotel/Twilio) will be active for mobile sync.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.sms_gateway_active}
                    onChange={(e) => setSettings({ ...settings, sms_gateway_active: e.target.checked })}
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-850/60 pt-4">
                <button
                  type="submit"
                  disabled={saveStatus === 'saving'}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-all shadow-lg cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved ✓' : t.saveSettings}
                </button>
              </div>
            </form>
          </div>

          {/* Price Change Log */}
          <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800/80 shadow-xl">
            <div className="bg-slate-900/40 px-6 py-4 border-b border-slate-855 flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">{t.priceHistoryLog}</h3>
            </div>
            
            <div className="p-4 max-h-[250px] overflow-y-auto divide-y divide-slate-900/60 font-mono text-[11px]">
              {priceHistory.length > 0 ? (
                priceHistory.map((log) => (
                  <div key={log.id} className="flex justify-between items-center py-2.5 px-1 hover:bg-slate-900/10 rounded-lg">
                    <div>
                      <span className="font-bold text-slate-200">{log.variety_name}</span>
                      <span className="text-slate-500 text-[10px] block mt-0.5">By: {log.changed_by}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400">₹{log.old_price.toFixed(1)} → </span>
                      <span className="text-emerald-400 font-bold">₹{log.new_price.toFixed(1)}</span>
                      <span className="text-slate-500 text-[9px] block mt-0.5">{new Date(log.changed_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-550">No price history logged yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Info Panels */}
        <div className="space-y-6">
          {/* Security Panel */}
          <div className="glass-panel p-5 rounded-3xl border border-slate-800/80 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-850/60 pb-3">
              <Shield className="w-5 h-5 text-emerald-500" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">{t.lockedAccounts}</h4>
            </div>

            <div className="space-y-3">
              {securityStatus.map((usr) => (
                <div key={usr.username} className="flex justify-between items-center bg-slate-950/60 p-3 rounded-2xl border border-slate-900 text-xs">
                  <div>
                    <span className="font-bold text-slate-200">{usr.full_name}</span>
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{usr.username} • {usr.role}</span>
                  </div>
                  
                  <div className="text-right">
                    {usr.is_locked ? (
                      <span className="bg-rose-950/45 text-rose-400 border border-rose-900/30 text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider animate-pulse">
                        Locked
                      </span>
                    ) : usr.failed_attempts > 0 ? (
                      <span className="bg-amber-950/45 text-amber-400 border border-amber-900/30 text-[9px] font-bold px-2 py-0.5 rounded font-mono">
                        {usr.failed_attempts} fails
                      </span>
                    ) : (
                      <span className="bg-emerald-950/45 text-emerald-400 border border-emerald-900/30 text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2FA Login OTP Card */}
          <div className="glass-panel p-5 rounded-3xl border border-amber-800/40 shadow-xl space-y-4 relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <div className="flex items-center gap-2.5 border-b border-slate-850/60 pb-3">
              <Shield className="w-5 h-5 text-amber-400" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                {language === 'te' ? '2FA లాగిన్ OTP' : '2FA Login OTP'}
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {language === 'te'
                ? 'ఫోన్ నంబర్ సెట్ చేస్తే, లాగిన్ చేసినప్పుడు ఈ నంబర్‌కు OTP పంపబడుతుంది. రెండు-అంచెల భద్రత.'
                : 'Set a phone number to receive a login OTP after entering your password. Two-factor security.'}
            </p>
            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-4 top-3 text-xs text-slate-500 font-mono">+91</span>
                <input
                  type="tel"
                  placeholder={language === 'te' ? '10 అంకెల మొబైల్ నంబర్' : '10-digit mobile number'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-100 font-mono"
                  value={twoFaPhone}
                  onChange={(e) => setTwoFaPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveTwoFaPhone}
                  disabled={!twoFaPhone || twoFaSaveStatus === 'saving'}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 disabled:opacity-50 text-slate-950 font-bold py-2 rounded-xl text-[10px] transition-all uppercase tracking-wider cursor-pointer"
                >
                  {twoFaSaveStatus === 'saving' ? '...' : twoFaSaveStatus === 'success' ? '✓ Saved' : (language === 'te' ? '2FA ఆన్ చేయి' : 'Enable 2FA')}
                </button>
                {twoFaPhone && (
                  <button
                    onClick={handleClearTwoFaPhone}
                    disabled={twoFaSaveStatus === 'clearing'}
                    className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 font-bold py-2 rounded-xl text-[10px] transition-all cursor-pointer"
                  >
                    {language === 'te' ? '2FA ఆఫ్' : 'Disable'}
                  </button>
                )}
              </div>
              {twoFaPhone && (
                <p className="text-[10px] text-amber-400/60 font-mono">
                  🔐 {language === 'te' ? `OTP ****${twoFaPhone.slice(-4)} కు పంపబడుతుంది` : `OTP will be sent to ****${twoFaPhone.slice(-4)} on each login`}
                </p>
              )}
            </div>
          </div>

          {/* SMS & Missed Call Webhook Workflow Panel */}
          <div className="glass-panel p-5 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
            
            <div className="flex items-center gap-2.5 border-b border-slate-850/60 pb-3">
              <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin-slow" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                {language === 'te' ? 'ఆటోమేటెడ్ SMS & మిస్డ్ కాల్ వర్క్‌ఫ్లో గైడ్' : 'Automated SMS & Missed Call Workflow Guide'}
              </h4>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              {language === 'te' 
                ? 'శ్రీ తిరుమల రైస్ మిల్ సిస్టమ్ ఎస్ఎమ్ఎస్ మరియు మిస్డ్ కాల్ గేట్‌వేలతో అనుసంధానించబడి ఉంది. వర్క్‌ఫ్లో క్రింది విధంగా పనిచేస్తుంది:' 
                : 'Sri Tirumala Rice Mill System is integrated with SMS and Missed Call gateways. The automation workflow operates as follows:'}
            </p>

            <div className="space-y-3 pt-1">
              {/* Step 1 */}
              <div className="bg-slate-955/60 border border-slate-900 rounded-2xl p-3.5 space-y-1">
                <span className="text-[9px] text-emerald-450 uppercase tracking-widest font-black block">Step 1: Missed Call / SMS Commands</span>
                <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                  {language === 'te'
                    ? '1. మిస్డ్ కాల్: కస్టమర్ నిర్దేశించిన వర్చువల్ నంబర్‌కు మిస్డ్ కాల్ ఇవ్వడం ద్వారా టోకెన్ వెంటనే ఉచితంగా రిజిస్టర్ అవుతుంది. (Webhook URL: /api/webhooks/missed-call)'
                    : '1. Missed Call: Customers dial the virtual number to instantly register a queue token at zero cost. (Webhook URL: /api/webhooks/missed-call)'}
                </p>
                <p className="text-[10.5px] text-slate-350 leading-relaxed pt-1.5 border-t border-slate-900/60 font-sans">
                  {language === 'te'
                    ? '2. SMS ఆదేశాలు: కస్టమర్ "TOKEN" (రిజిస్టర్), "PRICE" (ధరలు), "STATUS" (స్థితి), లేదా "STOP" (రద్దు) వంటి ఆదేశాలను పంపవచ్చు. (Webhook URL: /api/webhooks/sms)'
                    : '2. SMS Commands: Customers send command keywords like "TOKEN" (register), "PRICE" (rates), "STATUS" (track position), or "STOP" (cancel). (Webhook URL: /api/webhooks/sms)'}
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-955/60 border border-slate-900 rounded-2xl p-3.5 space-y-1">
                <span className="text-[9px] text-emerald-450 uppercase tracking-widest font-black block">Step 2: Auto-Response Messaging</span>
                <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                  {language === 'te'
                    ? 'బ్యాకెండ్ కస్టమర్ రిクエストను ప్రాసెస్ చేసి, స్వయంచాలకంగా టోకెన్ నంబర్ మరియు అంచనా వేసిన నిరీక్షణ సమయంతో కూడిన SMSను పంపుతుంది.'
                    : 'The backend processes requests and auto-responds with token details and estimated wait times.'}
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-955/60 border border-slate-900 rounded-2xl p-3.5 space-y-1">
                <span className="text-[9px] text-emerald-450 uppercase tracking-widest font-black block">Step 3: Zapier Payment Billings</span>
                <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                  {language === 'te'
                    ? 'చెక్అవుట్ వద్ద UPI/Card ద్వారా చెల్లింపు పూర్తయినప్పుడు, అది Zapier వెబ్‌హుక్ (Webhook URL: /api/webhooks/payment)ను ప్రేరేపించి కస్టమర్ మొబైల్‌కు బిల్లు వివరాల SMS పంపుతుంది.'
                    : 'Upon serving via UPI/Card checkouts, the transaction triggers a Zapier Catch Hook (Webhook URL: /api/webhooks/payment) to dispatch customer digital bills.'}
                </p>
              </div>
            </div>
          </div>

          {/* Test report Panel */}
          <div className="glass-panel p-5 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-amber-500/10 to-transparent" />
            
            <div className="flex items-center gap-2.5 border-b border-slate-850/60 pb-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">{t.simulatedDailySms}</h4>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              SMS summaries are compiled daily at **10:00 PM IST** and dispatched to the owner's phone numbers. Tap below to simulate and preview this action immediately in the on-screen SMS Device Screen logs!
            </p>

            <button
              type="button"
              onClick={handleSendTestSms}
              disabled={testSmsStatus === 'sending'}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-850 text-amber-400 font-bold py-3 px-4 rounded-xl text-xs border border-amber-950/20 hover:border-amber-500/20 transition-all cursor-pointer shadow-lg"
            >
              <Play className="w-4 h-4 fill-amber-500/20" />
              {testSmsStatus === 'sending' ? 'Sending summary...' : testSmsStatus === 'success' ? 'Dispatched ✓' : 'Dispatch Test SMS Summary'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
