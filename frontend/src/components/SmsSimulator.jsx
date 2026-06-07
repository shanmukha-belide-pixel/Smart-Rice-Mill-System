import React, { useState, useEffect, useRef } from 'react';
import { Phone, Send, MessageSquare, Trash2, Smartphone } from 'lucide-react';
import { translations } from '../utils/translations';

export default function SmsSimulator({ backendUrl, language, onActionTriggered }) {
  const [phoneNumber, setPhoneNumber] = useState('+919876543210');
  const [smsText, setSmsText] = useState('TOKEN');
  
  const t = translations[language || 'te'];

  const [messages, setMessages] = useState([
    {
      sender: 'System',
      text: language === 'te' 
        ? 'శ్రీ తిరుమల రైస్ మిల్ ఎస్ఎమ్ఎస్ సిమ్యులేటర్ ప్రారంభించబడింది. ఫోన్ నంబర్ నమోదు చేసి సేవలను పరీక్షించండి!'
        : 'Sri Trimula Rice Mill SMS Simulator initialized. Dial a number and try registering!',
      timestamp: new Date().toLocaleTimeString(),
      type: 'system'
    }
  ]);
  const [isCalling, setIsCalling] = useState(false);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const wsRef = useRef(null);

  // Connect to backend WebSocket for SMS broadcast
  useEffect(() => {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Clean host URL
    const cleanHost = backendUrl.replace('http://', '').replace('https://', '');
    const wsUrl = `${wsProto}//${cleanHost}/api/ws/simulator`;

    function connectWs() {
      setWsStatus('connecting');
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus('connected');
        console.log('Simulator WebSocket connected.');
      };

      socket.onmessage = (event) => {
        try {
          const smsData = JSON.parse(event.data);
          // Show all for testing convenience
          setMessages((prev) => [
            ...prev,
            {
              sender: 'Sri Trimula Rice Mill',
              text: smsData.message,
              timestamp: new Date().toLocaleTimeString(),
              type: 'received',
              recipient: smsData.phone_number,
              provider: smsData.provider
            }
          ]);
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      socket.onclose = () => {
        setWsStatus('disconnected');
        // Retry connection in 3 seconds
        setTimeout(connectWs, 3000);
      };

      socket.onerror = () => {
        setWsStatus('error');
      };
    }

    connectWs();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [backendUrl]);

  // Update initial system message on language change
  useEffect(() => {
    setMessages(prev => {
      // Find the first system message and translate it
      if (prev.length > 0 && prev[0].type === 'system') {
        const next = [...prev];
        next[0].text = language === 'te' 
          ? 'శ్రీ తిరుమల రైస్ మిల్ ఎస్ఎమ్ఎస్ సిమ్యులేటర్ ప్రారంభించబడింది. ఫోన్ నంబర్ నమోదు చేసి సేవలను పరీక్షించండి!'
          : 'Sri Trimula Rice Mill SMS Simulator initialized. Dial a number and try registering!';
        return next;
      }
      return prev;
    });
  }, [language]);

  // Simulate Missed Call
  const handleMissedCall = async () => {
    if (!phoneNumber) return;
    setIsCalling(true);
    setMessages(prev => [
      ...prev,
      {
        sender: 'You',
        text: language === 'te' ? `మిస్డ్ కాల్ ఇస్తున్నారు: ${phoneNumber}` : `Calling ${phoneNumber} (Missed Call)`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sent'
      }
    ]);

    try {
      const formData = new FormData();
      formData.append('From', phoneNumber);
      
      const res = await fetch(`${backendUrl}/api/webhooks/missed-call`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setMessages(prev => [
          ...prev,
          {
            sender: 'System',
            text: language === 'te' 
              ? 'కాల్ కట్ అయింది (< 1 సెకను). కొత్త టోకెన్ ఎస్ఎమ్ఎస్ కోసం వేచి చూస్తోంది...' 
              : 'Call cut (< 1s). Checking for incoming token SMS...',
            timestamp: new Date().toLocaleTimeString(),
            type: 'system'
          }
        ]);
        if (onActionTriggered) onActionTriggered();
      } else {
        throw new Error('Webhook error');
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'System',
          text: language === 'te' ? 'కాల్ విఫలమైంది. బ్యాకెండ్ రన్ అవుతోందో లేదో సరిచూసుకోండి.' : 'Call failed. Make sure backend is running.',
          timestamp: new Date().toLocaleTimeString(),
          type: 'error'
        }
      ]);
    } finally {
      setIsCalling(false);
    }
  };

  // Simulate sending SMS
  const handleSendSms = async (overrideCmd = null) => {
    const cmd = overrideCmd || smsText;
    if (!phoneNumber || !cmd) return;

    setMessages(prev => [
      ...prev,
      {
        sender: 'You',
        text: `SMS: "${cmd}"`,
        timestamp: new Date().toLocaleTimeString(),
        type: 'sent'
      }
    ]);

    try {
      const formData = new FormData();
      formData.append('From', phoneNumber);
      formData.append('Body', cmd);

      const res = await fetch(`${backendUrl}/api/webhooks/sms`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        if (onActionTriggered) onActionTriggered();
      } else {
        throw new Error('Webhook error');
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'System',
          text: language === 'te' ? 'ఎస్ఎమ్ఎస్ పంపడం విఫలమైంది. బ్యాకెండ్ చెక్ చేయండి.' : 'SMS failed to send. Check backend status.',
          timestamp: new Date().toLocaleTimeString(),
          type: 'error'
        }
      ]);
    }
  };

  return (
    <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl flex flex-col h-full border border-slate-800/80 relative">
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      
      {/* Header */}
      <div className="bg-slate-900/60 backdrop-blur-md px-4 py-3.5 border-b border-slate-850 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MessageSquare className="text-emerald-500 w-4 h-4" />
          <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">{t.simulatorTitle}</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={`w-2 h-2 rounded-full ${
            wsStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_hsl(142,72%,29%)]' :
            wsStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
          }`} />
          <span className="text-slate-500 font-mono text-[9px] uppercase">
            {wsStatus === 'connected' ? t.connected : wsStatus === 'connecting' ? t.connecting : t.disconnected}
          </span>
        </div>
      </div>

      {/* Simulator Interface */}
      <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
        
        {/* Phone Input */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t.simulatedPhone}
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-850 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+919876543210"
          />
        </div>

        {/* Action triggers */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleMissedCall}
            disabled={isCalling}
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 px-3 rounded-xl text-[10px] transition-all cursor-pointer shadow-md shadow-emerald-950/20"
          >
            <Phone className="w-3.5 h-3.5" />
            {isCalling ? (language === 'te' ? 'డయల్ చేస్తోంది...' : 'Dialing...') : t.missedCallFree}
          </button>
          
          <button
            onClick={() => handleSendSms('TOKEN')}
            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold py-2.5 px-3 rounded-xl text-[10px] transition-all border border-slate-800/80 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {language === 'te' ? 'SMS "TOKEN"' : 'SMS "TOKEN"'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => handleSendSms('PRICE')}
            className="bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 py-2 px-1.5 rounded-lg text-[9px] font-bold text-center border border-slate-850 transition-colors cursor-pointer"
          >
            SMS "PRICE"
          </button>
          <button
            onClick={() => handleSendSms('STATUS')}
            className="bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 py-2 px-1.5 rounded-lg text-[9px] font-bold text-center border border-slate-850 transition-colors cursor-pointer"
          >
            SMS "STATUS"
          </button>
          <button
            onClick={() => handleSendSms('STOP')}
            className="bg-rose-950/20 hover:bg-rose-950/40 text-rose-400/80 hover:text-rose-300 py-2 px-1.5 rounded-lg text-[9px] font-bold text-center border border-rose-900/25 transition-colors cursor-pointer"
          >
            SMS "STOP"
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-900/80 my-1 flex justify-between items-center px-1 pt-2">
          <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1">
            <Smartphone className="w-3 h-3 text-slate-500" />
            {t.deviceScreen}
          </span>
          <button 
            onClick={() => setMessages([{ sender: 'System', text: language === 'te' ? 'ఇన్‌బాక్స్ క్లియర్ చేయబడింది.' : 'Inbox cleared.', timestamp: new Date().toLocaleTimeString(), type: 'system' }])}
            className="text-[9px] text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-2.5 h-2.5" />
            {t.clearLog}
          </button>
        </div>

        {/* Mock Phone Screen / Messages List */}
        <div className="flex-1 bg-slate-950 border border-slate-900 rounded-2xl p-3 flex flex-col gap-2.5 min-h-[220px] max-h-[280px] overflow-y-auto shadow-inner">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col max-w-[85%] rounded-2xl p-2.5 text-[11px] transition-all ${
                msg.type === 'sent'
                  ? 'bg-slate-900 self-end text-slate-200 rounded-tr-none border border-slate-850'
                  : msg.type === 'system'
                  ? 'bg-slate-900/30 self-center text-slate-500 text-[9px] max-w-full text-center border border-slate-900/50'
                  : msg.type === 'error'
                  ? 'bg-rose-950/30 border border-rose-900/20 self-center text-rose-400 text-[9px] max-w-full text-center'
                  : 'bg-emerald-950/30 border border-emerald-900/20 self-start text-slate-350 rounded-tl-none'
              }`}
            >
              {msg.type === 'received' && (
                <div className="flex justify-between items-center text-[8px] text-slate-500 font-bold mb-1 border-b border-emerald-900/10 pb-0.5">
                  <span className="text-emerald-500/80 tracking-wider font-mono">SRI TRIMULA MILL</span>
                  <span className="text-[7px] bg-slate-900 text-slate-500 px-1 rounded uppercase tracking-wider font-mono">
                    {msg.provider}
                  </span>
                </div>
              )}
              {msg.recipient && msg.recipient !== phoneNumber && (
                <div className="text-[8px] text-amber-500/80 font-bold mb-1 font-mono">
                  To: {msg.recipient}
                </div>
              )}
              <div className="whitespace-pre-wrap leading-normal font-sans">{msg.text}</div>
              <span className="text-[7px] text-slate-600 self-end mt-1 font-mono font-semibold">{msg.timestamp}</span>
            </div>
          ))}
        </div>

        {/* Custom SMS input form */}
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-850 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100"
            placeholder={t.typeCommand}
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendSms()}
          />
          <button
            onClick={() => handleSendSms()}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-2 rounded-xl transition-colors border border-slate-850 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
