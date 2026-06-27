import React, { useState, useEffect, useRef } from 'react';
import TokenDashboard from './pages/TokenDashboard';
import StockManagement from './pages/StockManagement';
import Reports from './pages/Reports';
import PublicDisplay from './pages/PublicDisplay';
import CustomerPortal from './pages/CustomerPortal';
import SettingsPage from './pages/Settings';
import { LogOut, ShieldAlert, Sparkles, Languages, Ticket, Package, BarChart3, Bell, BellOff, Volume2, VolumeX, CheckCircle, AlertCircle, AlertTriangle, Info, Maximize2, Minimize2, Settings, Sun, Moon, Eye, EyeOff } from 'lucide-react';
import { translations } from './utils/translations';
import { subscribeToDatabase, subscribeToConnection, getDbState, updateSmsInbox } from './utils/firebaseService';

const BACKEND_URL = (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' || 
  window.location.hostname.startsWith('192.168.') || 
  window.location.hostname.startsWith('10.') || 
  window.location.hostname.startsWith('172.')
)
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : 'https://smart-rice-mill-backend.onrender.com';


export default function App() {
  const [role, setRole] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get('role');
    if (urlRole === 'customer' || urlRole === 'public') {
      return urlRole;
    }
    return localStorage.getItem('role') || null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [fullName, setFullName] = useState(() => localStorage.getItem('name') || '');
  const [currentTab, setCurrentTab] = useState(() => localStorage.getItem('currentTab') || 'dashboard');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  


  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [isConnected, setIsConnected] = useState(navigator.onLine);
  const [lastSynced, setLastSynced] = useState(Date.now());
  const [syncedText, setSyncedText] = useState('Just now');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [language, setLanguage] = useState('te');

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  const sessionTimeoutRef = useRef(null);

  const t = translations[language];

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  // Toast Dispatcher
  const showToast = (type, message) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Add in-app Notification
  const addNotification = (type, title, message) => {
    const newNotif = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      type,
      title,
      message,
      timestamp: new Date().toLocaleTimeString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
    showToast(type, `${title}: ${message}`);
    
    if (type === 'error' || type === 'warning') {
      triggerPushNotification(title, message);
    }
  };

  // Dual Tone Synthesized Chime using Web Audio API
  const playSoftChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gain1.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.35);

      setTimeout(() => {
        if (audioCtx.state === 'closed') return;
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        gain2.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.45);
      }, 120);
    } catch (e) {
      console.warn("Chime Audio fail:", e);
    }
  };

  // Push Notifications API
  const requestPushPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        showToast('success', language === 'te' ? 'పుష్ నోటిఫికేషన్లు అనుమతించబడ్డాయి!' : 'Push Notifications enabled!');
      }
    }
  };

  const triggerPushNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch (e) {
        console.warn("Push failed:", e);
      }
    }
  };

  // WhatsApp Alert Manager Simulation when stock falls below threshold
  const simulateManagerWhatsAppAlert = (varietyName, qty, threshold) => {
    const msg = `📲 [WhatsApp Alert to Manager] Stock Alert: ${varietyName} has fallen below threshold to ${qty.toFixed(1)}kg (Threshold: ${threshold}kg).`;
    const state = getDbState();
    const smsInbox = [...(state.sms_inbox || [])];
    
    const tenSecsAgo = new Date(Date.now() - 10000).toLocaleTimeString();
    const duplicate = smsInbox.some(s => s.message.includes(varietyName) && s.timestamp > tenSecsAgo);
    if (duplicate) return;

    smsInbox.unshift({
      phone_number: '+919999999999',
      message: msg,
      timestamp: new Date().toLocaleTimeString(),
      provider: 'WHATSAPP_MANAGER'
    });
    updateSmsInbox(smsInbox);
  };

  // Full Screen toggler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.warn(`Fullscreen activation failed: ${err.message}`);
      });
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };



  const toggleLanguage = () => {
    const nextLang = language === 'te' ? 'en' : 'te';
    setLanguage(nextLang);
    localStorage.setItem('language', nextLang);
  };

  // Auto-login disabled: always show login page on every visit

  // Set up 30-minute session timeout
  const setupSessionTimeout = () => {
    if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
    sessionTimeoutRef.current = setTimeout(() => {
      handleLogout();
      alert(language === 'te' ? 'మీ సెషన్ ముగిసింది. దయచేసి మళ్లీ లాగిన్ చేయండి.' : 'Session expired. Please log in again.');
    }, 30 * 60 * 1000); // 30 minutes
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      if (res.ok) {
        const data = await res.json();
        // Direct login
        setToken(data.access_token);
        setRole(data.role);
        setFullName(data.full_name);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('name', data.full_name);
        const tab = data.role === 'accountant' ? 'reports' : 'dashboard';
        setCurrentTab(tab);
        localStorage.setItem('currentTab', tab);
        setupSessionTimeout();
      } else {
        const err = await res.json();
        setLoginError(err.detail || 'Login failed.');
      }
    } catch (err) {
      setLoginError('Could not connect to backend server. Make sure API is running.');
    } finally {
      setLoading(false);
    }
  };

  const performAutoLogin = async (username, password) => {
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.access_token);
        setRole(data.role);
        setFullName(data.full_name);
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('name', data.full_name);
        const tab3 = data.role === 'accountant' ? 'reports' : 'dashboard';
        setCurrentTab(tab3);
        localStorage.setItem('currentTab', tab3);
        setupSessionTimeout();
      } else {
        const err = await res.json();
        setLoginError(err.detail || 'Login failed.');
      }
    } catch (err) {
      setLoginError('Could not connect to backend server. Make sure API is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setRole(null);
    setFullName('');
    setCurrentTab('dashboard');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('name');
    localStorage.removeItem('currentTab');
    if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
  };

  // On startup: validate stored token with backend; clear if expired
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) return;
    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` }
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          // Token is explicitly expired or invalid — force logout
          handleLogout();
        }
      })
      .catch(() => {
        // Backend unreachable — keep session so data is still visible offline
      });
  }, []);

  useEffect(() => {
    window.showToast = showToast;
    window.addNotification = addNotification;
    
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [soundEnabled, language]);

  // Subscribe to connection status
  useEffect(() => {
    const unsub = subscribeToConnection((status, syncTime) => {
      setIsConnected(status);
      setLastSynced(syncTime);
    });
    return unsub;
  }, []);

  // Last synced timer
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - lastSynced) / 1000);
      if (seconds <= 2) {
        setSyncedText(language === 'te' ? 'ఇప్పుడే' : 'Just now');
      } else {
        setSyncedText(language === 'te' ? `${seconds} సెకన్ల క్రితం` : `${seconds}s ago`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastSynced, language]);

  // Subscribe to database for real-time events
  const lastStateRef = useRef({ stock: [], tokens: [] });
  useEffect(() => {
    if (!token) return;

    const unsub = subscribeToDatabase((state) => {
      if (!state) return;
      const prev = lastStateRef.current;
      
      // 1. Detect new tokens (New Customer Joined Queue)
      const prevTokens = prev.tokens || [];
      const currentTokens = state.tokens || [];
      const newTokens = currentTokens.filter(t => !prevTokens.some(pt => pt.id === t.id));
      if (newTokens.length > 0) {
        newTokens.forEach(t => {
          if (t.status === 'waiting') {
            addNotification(
              'success',
              language === 'te' ? 'కొత్త కస్టమర్' : 'New Customer Joined',
              language === 'te' 
                ? `టోకెన్ ${t.token_number} క్యూలో చేరారు.` 
                : `Token ${t.token_number} joined the queue.`
            );
            playSoftChime();
          }
        });
      }

      // 2. Detect low stock alerts
      const prevStock = prev.stock || [];
      const currentStock = state.stock || [];
      currentStock.forEach(item => {
        const prevItem = prevStock.find(ps => ps.id === item.id);
        const isLow = item.quantity_kg <= item.low_stock_threshold;
        const wasLow = prevItem ? (prevItem.quantity_kg <= prevItem.low_stock_threshold) : false;
        
        if (isLow && (!wasLow || (prevItem && prevItem.quantity_kg !== item.quantity_kg))) {
          addNotification(
            'warning',
            language === 'te' ? 'తక్కువ స్టాక్ హెచ్చరిక' : 'Low Stock Warning',
            language === 'te'
              ? `${item.variety_name} నిల్వ తక్కువగా ఉంది: ${item.quantity_kg.toFixed(1)} kg.`
              : `${item.variety_name} is running low: ${item.quantity_kg.toFixed(1)} kg.`
          );
          simulateManagerWhatsAppAlert(item.variety_name, item.quantity_kg, item.low_stock_threshold);
        }
      });

      // 3. Detect Full Queue
      const waitingCount = currentTokens.filter(t => t.status === 'waiting').length;
      const prevWaitingCount = prevTokens.filter(t => t.status === 'waiting').length;
      if (waitingCount >= 10 && prevWaitingCount < 10) {
        addNotification(
          'error',
          language === 'te' ? 'క్యూ నిండిపోయింది' : 'Queue Full',
          language === 'te'
            ? `క్యూలో 10+ మంది కస్టమర్లు వేచి ఉన్నారు.`
            : `Over 10 customers are waiting in the queue.`
        );
      }

      setLastSynced(Date.now());
      lastStateRef.current = { stock: currentStock, tokens: currentTokens };
    });

    return () => {
      unsub();
    };
  }, [token, language, soundEnabled]);

  // Reset timeout on key activities
  const handleActivity = () => {
    if (token) setupSessionTimeout();
  };

  useEffect(() => {
    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
    };
  }, [token, language]);

  // Translate errors dynamically into Telugu if selected
  const translateError = (detail) => {
    if (!detail) return '';
    if (language === 'te') {
      if (detail.toLowerCase().includes("invalid username or password")) {
        return "వినియోగదారు పేరు లేదా పాస్‌వర్డ్ సరైనది కాదు.";
      }
      if (detail.toLowerCase().includes("account temporarily locked")) {
        const match = detail.match(/\d+/);
        const mins = match ? match[0] : '30';
        return `ఖాతా తాత్కాలికంగా లాక్ చేయబడింది. దయచేసి ${mins} నిమిషం(ల) తర్వాత మళ్లీ ప్రయత్నించండి.`;
      }
      if (detail.toLowerCase().includes("too many failed attempts") || detail.toLowerCase().includes("too many failed login attempts")) {
        return "చాలా విఫల ప్రయత్నాలు జరిగాయి. ఖాతా 30 నిమిషాల పాటు లాక్ చేయబడింది.";
      }
      if (detail.toLowerCase().includes("could not connect") || detail.toLowerCase().includes("failed to connect")) {
        return "బ్యాకెండ్ సర్వర్‌కి కనెక్ట్ కాలేదు. API రన్ అవుతుందో లేదో తనిఖీ చేయండి.";
      }
    }
    return detail;
  };

  const renderToasts = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-[90%] pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 transform translate-x-0 transition-all duration-305 pointer-events-auto animate-slide-in ${
            toast.type === 'success' ? 'bg-slate-900/95 border-emerald-500/30 text-emerald-350' :
            toast.type === 'error' ? 'bg-slate-900/95 border-rose-500/30 text-rose-350' :
            toast.type === 'warning' ? 'bg-slate-900/95 border-amber-500/30 text-amber-350' :
            'bg-slate-900/95 border-blue-500/30 text-blue-350'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />}
          {toast.type === 'error' && <AlertCircle className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />}
          {toast.type === 'warning' && <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />}
          {toast.type === 'info' && <Info className="w-4.5 h-4.5 text-blue-400 shrink-0 mt-0.5" />}
          
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-100">{toast.message}</p>
          </div>
          
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="text-slate-500 hover:text-slate-300 text-sm font-bold ml-1.5 shrink-0 cursor-pointer"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  // If role is direct Public Display (unauthenticated)
  if (role === 'public') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans relative">
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          {/* Language Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs px-3.5 py-2 rounded-xl border border-slate-800/80 transition-all font-semibold shadow-lg cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 text-emerald-400" />
            {language === 'te' ? 'English' : 'తెలుగు'}
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-xs px-3.5 py-2 rounded-xl border border-slate-800/80 transition-all font-semibold shadow-lg cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
          </button>
          <button 
            onClick={handleLogout}
            className="bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 hover:text-rose-200 text-xs px-3.5 py-2 rounded-xl border border-rose-900/30 transition-all font-semibold shadow-lg cursor-pointer"
          >
            {language === 'te' ? '← నిష్క్రమించు' : '← Exit Screen'}
          </button>
        </div>
        <PublicDisplay backendUrl={BACKEND_URL} language={language} />
        {renderToasts()}
      </div>
    );
  }

  // If role is Customer Portal
  if (role === 'customer') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
        {/* Glow decoration */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="w-full max-w-md flex justify-between items-center mb-3 px-1 z-10">
          <button 
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-355 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            ← {language === 'te' ? 'పోర్టల్ నుండి నిష్క్రమించు' : 'Exit Portal'}
          </button>
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors font-semibold cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 text-emerald-500" />
            {language === 'te' ? 'English' : 'తెలుగు'}
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors font-semibold cursor-pointer"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
          </button>
        </div>
        <div className="w-full max-w-md z-10">
          <CustomerPortal backendUrl={BACKEND_URL} language={language} />
        </div>
        {renderToasts()}
      </div>
    );
  }

  // Unauthenticated Login Screen
  if (!token) {
    return (
      <div className="min-h-screen login-page-root flex flex-col lg:flex-row relative overflow-hidden font-sans">

        {/* === FULL PAGE BACKGROUND: Paddy Field Photo === */}
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}paddy_field_bg.png`}
            alt="Paddy Field"
            className="w-full h-full object-cover select-none"
            style={{opacity: 0.18}}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 login-page-overlay" />
        </div>

        {/* Floating ambient glows */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full pointer-events-none" style={{background: 'radial-gradient(circle, rgba(234,179,8,0.08) 0%, transparent 70%)'}} />
        <div className="absolute bottom-0 right-0 w-[700px] h-[700px] rounded-full pointer-events-none" style={{background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)'}} />

        {/* Global switcher buttons — top right */}
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={toggleLanguage}
            className="login-top-btn flex items-center gap-1.5 backdrop-blur-xl text-slate-300 hover:text-slate-100 text-xs px-4 py-2.5 rounded-2xl border transition-all font-semibold shadow-xl cursor-pointer"
          >
            <Languages className="w-4 h-4 text-amber-400" />
            {language === 'te' ? 'English' : 'తెలుగు'}
          </button>
          <button
            onClick={toggleTheme}
            className="login-top-btn flex items-center justify-center backdrop-blur-xl text-slate-300 hover:text-slate-100 p-2.5 rounded-2xl border transition-all shadow-xl cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>

        {/* ============ LEFT COLUMN: Glass Sign-In Form ============ */}
        <div className="w-full lg:w-[45%] flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 z-10 relative">
          <div className="w-full max-w-md space-y-8 animate-fade-in">

            {/* Mill Logo + Branding */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {/* Original logo restored */}
                <div className="login-logo-box w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl border">
                  <img
                    src={`${import.meta.env.BASE_URL}rice_grains_hero.png`}
                    alt="Sri Tirumala Rice Mill Logo"
                    className="w-full h-full object-cover select-none"
                    onError={(e) => { e.target.onerror = null; e.target.src = `${import.meta.env.BASE_URL}login_illustration.png`; }}
                  />
                </div>
                <div>
                  <h1 className="login-app-name text-2xl md:text-3xl font-black tracking-tight uppercase select-none">
                    {t.appName}
                  </h1>
                  <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase mt-0.5">
                    {language === 'te' ? 'స్మార్ట్ మిల్ మేనేజ్‌మెంట్ సిస్టమ్' : 'Smart Mill Management System'}
                  </p>
                </div>
              </div>

              {/* Decorative divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)'}} />
                <span className="text-amber-600/60 text-sm">🌾</span>
                <div className="flex-1 h-px" style={{background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.3), transparent)'}} />
              </div>
            </div>

            {/* === GLASS SIGN IN CARD === */}
            <div className="login-glass-card relative rounded-[2rem] p-8 space-y-6 shadow-2xl">
              {/* Top golden shimmer line */}
              <div className="absolute inset-x-0 -top-px h-px rounded-t-[2rem]" style={{background: 'linear-gradient(90deg, transparent, rgba(234,179,8,0.5), transparent)'}} />

              {/* Language Tabs + Theme Toggle */}
              <div className="flex gap-2">
                <div className="login-lang-switcher flex-1 flex p-1 rounded-2xl border">
                  <button type="button" onClick={() => { setLanguage('te'); localStorage.setItem('language', 'te'); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${language === 'te' ? 'login-lang-tab-active text-amber-500 border border-amber-800/40 shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>
                    🌾 తెలుగు
                  </button>
                  <button type="button" onClick={() => { setLanguage('en'); localStorage.setItem('language', 'en'); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${language === 'en' ? 'login-lang-tab-active text-amber-500 border border-amber-800/40 shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>
                    🌾 English
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="login-card-btn p-2.5 rounded-2xl border text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center cursor-pointer"
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-500" />}
                </button>
              </div>

              {loginError && (
                <div className="bg-rose-950/40 border border-rose-900/30 text-rose-400 p-3.5 rounded-xl text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>{translateError(loginError)}</span>
                </div>
              )}

              {/* Sign In form */}
              <>
                <h2 className="text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {language === 'te' ? '🔐 కన్సోల్ లాగిన్' : '🔐 Console Sign In'}
                </h2>
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400">
                      {language === 'te' ? 'యూజర్‌నేమ్' : 'Username'}
                    </label>
                    <input
                      type="text" required
                      placeholder={language === 'te' ? 'యూజర్‌నేమ్ నమోదు చేయండి' : 'Enter username'}
                      className="login-glass-input w-full rounded-xl px-4 py-3 text-sm font-medium"
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-400">
                      {language === 'te' ? 'పాస్‌వర్డ్' : 'Password'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"} required placeholder="••••••••"
                        className="login-glass-input w-full rounded-xl pl-4 pr-11 py-3 text-sm font-mono"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-500 cursor-pointer flex items-center justify-center p-1 z-10"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5 text-slate-400" /> : <Eye className="w-5 h-5 text-slate-400" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full disabled:opacity-50 text-slate-950 font-extrabold py-3.5 rounded-xl text-xs transition-all uppercase tracking-wider mt-3 cursor-pointer shadow-2xl"
                    style={{background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 50%, #b45309 100%)', boxShadow: '0 4px 24px rgba(234,179,8,0.25)'}}>
                    {loading ? (language === 'te' ? '⏳ ధృవీకరిస్తోంది...' : '⏳ Authenticating...') : (language === 'te' ? '🚀 ప్రవేశించు' : '🚀 Sign In')}
                  </button>
                </form>
              </>
            </div>

            {/* Quick Access Portals */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 text-xs font-semibold pt-2">
              <button
                onClick={() => setRole('public')}
                className="text-slate-600 hover:text-amber-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                📺 {language === 'te' ? 'పబ్లిక్ డిస్‌ప్లే టీవీ' : 'Open Public Display TV'}
              </button>
              <span className="text-slate-800 hidden sm:inline">|</span>
              <button
                onClick={() => setRole('customer')}
                className="text-slate-600 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                📱 {language === 'te' ? 'కస్టమర్ మొబైల్ పోర్టల్' : 'Open Customer App'}
              </button>
            </div>
          </div>
        </div>

        {/* ============ RIGHT COLUMN: Rice Mill Visual Panel ============ */}
        <div className="hidden lg:flex lg:w-[55%] relative items-end justify-center overflow-hidden">

          {/* Full panel: rice grain image fills entire column */}
          <div className="absolute inset-0">
            <img
              src={`${import.meta.env.BASE_URL}rice_grains_hero.png`}
              alt="Premium Rice Grains"
              className="w-full h-full object-cover select-none"
              style={{opacity: 0.85}}
              onError={(e) => { e.target.onerror = null; e.target.src = `${import.meta.env.BASE_URL}paddy_field_bg.png`; }}
            />
            {/* Gradient overlay: left edge fades to match left column, bottom darkens for text legibility */}
            <div className="absolute inset-0" style={{background: 'linear-gradient(90deg, rgba(6,8,19,0.9) 0%, rgba(6,8,19,0.2) 35%, rgba(6,8,19,0.1) 100%)'}} />
            <div className="absolute inset-0" style={{background: 'linear-gradient(0deg, rgba(6,8,19,0.88) 0%, transparent 55%)'}} />
          </div>

          {/* Info overlay at the bottom */}
          <div className="relative z-10 w-full px-10 pb-14 space-y-5 animate-fade-in">
            {/* Title & description */}
            <div className="space-y-3">
              <h3 className="login-panel-heading text-3xl font-black">
                {language === 'te' ? 'ఆధునిక రైస్ మిల్ ఆటోమేషన్' : 'Modern Rice Mill Automation'}
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed max-w-sm">
                {language === 'te'
                  ? 'క్యూ మేనేజ్‌మెంట్, ఇన్వెంటరీ నిల్వలు, బిల్లింగ్ మరియు రియల్ టైమ్ విశ్లేషణలను ఒకే స్మార్ట్ కన్సోల్‌లో నిర్వహించండి.'
                  : 'Manage queues, warehouse stocks, real-time weighing tickets, and billing — all in one smart console.'}
              </p>
            </div>

            {/* Glass feature pill tags */}
            <div className="flex flex-wrap gap-2">
              {[
                { icon: '🌾', te: 'క్యూ మేనేజ్‌మెంట్', en: 'Queue Management' },
                { icon: '📦', te: 'ఇన్వెంటరీ', en: 'Inventory' },
                { icon: '📊', te: 'రియల్ టైమ్ రిపోర్ట్స్', en: 'Live Reports' },
                { icon: '💳', te: 'బిల్లింగ్', en: 'Billing' },
              ].map(f => (
                <span key={f.en} className="login-tag-pill px-3.5 py-1.5 rounded-full text-xs font-semibold">
                  {f.icon} {language === 'te' ? f.te : f.en}
                </span>
              ))}
            </div>
          </div>
        </div>

        {renderToasts()}
      </div>
    );
  }


  // Role permissions checking
  const canAccessTab = (tab) => {
    if (role === 'owner') return true;
    if (tab === 'settings') {
      return role === 'staff';
    }
    if (role === 'staff' || role === 'accountant') return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between font-sans relative overflow-hidden">
      {/* Decorative blurs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* App Header */}
      <header className="bg-slate-900/40 backdrop-blur-md border-b border-slate-900/80 px-6 py-4 flex justify-between items-center z-20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center p-1 overflow-hidden shadow-inner">
            <img 
              src={`${import.meta.env.BASE_URL}login_illustration.png`} 
              alt="Sri Tirumala Rice Mill Logo" 
              className="w-full h-full object-contain rounded-lg"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=600";
              }}
            />
          </div>
          <div>
            <h1 className="font-black text-sm md:text-base text-slate-100 uppercase tracking-wider">{t.appName}</h1>
            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest font-bold">{t.workspaceConsole}</span>
          </div>
        </div>

        {/* Tab Links (RBAC Filtered) */}
        <nav className="hidden md:flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-900">
          {canAccessTab('dashboard') && (
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer flex items-center gap-2 ${
                currentTab === 'dashboard' ? 'bg-slate-900 text-emerald-400 shadow-md border border-slate-800' : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              {t.tokenBoard}
            </button>
          )}
          {canAccessTab('stock') && (
            <button
              onClick={() => setCurrentTab('stock')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer flex items-center gap-2 ${
                currentTab === 'stock' ? 'bg-slate-900 text-emerald-400 shadow-md border border-slate-800' : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              {t.inventory}
            </button>
          )}
          {canAccessTab('reports') && (
            <button
              onClick={() => setCurrentTab('reports')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer flex items-center gap-2 ${
                currentTab === 'reports' ? 'bg-slate-900 text-emerald-400 shadow-md border border-slate-800' : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {t.financials}
            </button>
          )}
          {canAccessTab('settings') && (
            <button
              onClick={() => setCurrentTab('settings')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all uppercase tracking-wider cursor-pointer flex items-center gap-2 ${
                currentTab === 'settings' ? 'bg-slate-900 text-emerald-400 shadow-md border border-slate-800' : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              {t.settings || (language === 'te' ? 'సెట్టింగులు' : 'Settings')}
            </button>
          )}
        </nav>

        {/* User profile & logout */}
        <div className="flex items-center gap-4">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-200 border border-slate-900 transition-colors cursor-pointer"
            title={soundEnabled ? "Mute chime" : "Unmute chime"}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-200 border border-slate-900 transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Counter Mode"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-emerald-500" /> : <Maximize2 className="w-3.5 h-3.5 text-slate-450" />}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-200 border border-slate-900 transition-colors cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          {/* In-app Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
              className="p-2 bg-slate-955 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-slate-200 border border-slate-900 transition-colors cursor-pointer relative"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5 text-slate-350" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-bold text-[8px] rounded-full w-4 h-4 flex items-center justify-center border border-slate-950">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            {/* Notification Center Dropdown */}
            {showNotificationsDropdown && (
              <div className="absolute right-0 mt-2.5 w-72 bg-slate-900/95 backdrop-blur-lg border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-slide-in">
                <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-850 flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-slate-35 tracking-wider">
                    {language === 'te' ? 'నోటిఫికేషన్లు' : 'Notifications'}
                  </span>
                  <div className="flex gap-2 items-center">
                    {('Notification' in window && Notification.permission !== 'granted') && (
                      <button
                        onClick={requestPushPermission}
                        className="text-[8px] bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-slate-450 hover:text-slate-200 cursor-pointer"
                      >
                        Push
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button
                        onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                        className="text-[9px] font-bold text-emerald-500 hover:text-emerald-400 cursor-pointer"
                      >
                        {language === 'te' ? 'అన్నీ' : 'Mark read'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-850/65">
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item))}
                        className={`p-3 text-[11px] transition-colors cursor-pointer ${n.read ? 'bg-transparent text-slate-500' : 'bg-slate-900/50 text-slate-200 font-medium'}`}
                      >
                        <div className="flex justify-between items-start gap-1.5">
                          <span className={`font-bold ${n.type === 'success' ? 'text-emerald-450' : n.type === 'warning' ? 'text-amber-450' : n.type === 'error' ? 'text-rose-450' : 'text-blue-450'}`}>
                            {n.title}
                          </span>
                          <span className="text-[9px] text-slate-500 shrink-0 font-mono">{n.timestamp}</span>
                        </div>
                        <p className="mt-1 text-slate-400 leading-normal">{n.message}</p>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-500">
                      {language === 'te' ? 'నోటిఫికేషన్లు లేవు' : 'No notifications'}
                    </div>
                  )}
                </div>

                {notifications.length > 0 && (
                  <div className="bg-slate-950/40 p-2 border-t border-slate-850 text-center">
                    <button
                      onClick={() => setNotifications([])}
                      className="text-[9px] font-bold text-rose-500 hover:text-rose-400 uppercase tracking-wider cursor-pointer"
                    >
                      {language === 'te' ? 'అన్నీ క్లియర్ చేయి' : 'Clear all'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Language Selector */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 bg-slate-955 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-xs px-3 py-2 rounded-xl border border-slate-900 transition-all font-semibold cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5 text-emerald-500" />
            {language === 'te' ? 'English' : 'తెలుగు'}
          </button>

          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-300">{fullName}</div>
            <div className="text-[9px] text-emerald-500 uppercase font-mono font-bold tracking-widest">{role}</div>
          </div>
          
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-950 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-slate-300 border border-slate-900 transition-colors cursor-pointer"
            title={t.signOut}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body: Side-by-side Panel */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 pb-20 md:pb-6 overflow-hidden max-w-8xl w-full mx-auto z-10">
        
        {/* Left Side: Active Route Panel */}
        <div className="flex-1 overflow-y-auto pr-1">
          {currentTab === 'dashboard' && canAccessTab('dashboard') && (
            <TokenDashboard backendUrl={BACKEND_URL} userToken={token} role={role} language={language} toggleFullscreen={toggleFullscreen} isFullscreen={isFullscreen} syncedText={syncedText} isConnected={isConnected} />
          )}
          {currentTab === 'stock' && canAccessTab('stock') && (
            <StockManagement backendUrl={BACKEND_URL} userToken={token} language={language} />
          )}
          {currentTab === 'reports' && canAccessTab('reports') && (
            <Reports backendUrl={BACKEND_URL} userToken={token} language={language} />
          )}
          {currentTab === 'settings' && canAccessTab('settings') && (
            <SettingsPage backendUrl={BACKEND_URL} userToken={token} language={language} />
          )}
        </div>

      </main>

      {/* Footer ticker info */}
      <footer className="bg-slate-955 px-6 py-3.5 border-t border-slate-900 text-[9px] text-slate-600 text-center font-mono uppercase tracking-widest">
        {language === 'te' 
          ? 'శ్రీ తిరుమల రైస్ మిల్ కన్సోల్ • 30 నిమిషాల నిష్క్రియ తర్వాత సెషన్ స్వయంచాలకంగా లాక్ చేయబడుతుంది'
          : 'Sri Tirumala Mill console • Session automatically locks after 30 minutes of inactivity'}
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900/80 backdrop-blur-lg border-t border-slate-800/80 py-3 px-6 flex justify-around items-center z-50 shadow-2xl">
        {canAccessTab('dashboard') && (
          <button
            onClick={() => setCurrentTab('dashboard')}
            className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-400 cursor-pointer"
          >
            <Ticket className={`w-5 h-5 ${currentTab === 'dashboard' ? 'text-emerald-400' : ''}`} />
            <span className={`text-[9px] uppercase tracking-wider font-semibold ${currentTab === 'dashboard' ? 'text-emerald-450 font-bold' : ''}`}>{t.tokenBoard}</span>
          </button>
        )}
        {canAccessTab('stock') && (
          <button
            onClick={() => setCurrentTab('stock')}
            className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-400 cursor-pointer"
          >
            <Package className={`w-5 h-5 ${currentTab === 'stock' ? 'text-emerald-400' : ''}`} />
            <span className={`text-[9px] uppercase tracking-wider font-semibold ${currentTab === 'stock' ? 'text-emerald-450 font-bold' : ''}`}>{t.inventory}</span>
          </button>
        )}
        {canAccessTab('reports') && (
          <button
            onClick={() => setCurrentTab('reports')}
            className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-400 cursor-pointer"
          >
            <BarChart3 className={`w-5 h-5 ${currentTab === 'reports' ? 'text-emerald-400' : ''}`} />
            <span className={`text-[9px] uppercase tracking-wider font-semibold ${currentTab === 'reports' ? 'text-emerald-450 font-bold' : ''}`}>{t.financials}</span>
          </button>
        )}
        {canAccessTab('settings') && (
          <button
            onClick={() => setCurrentTab('settings')}
            className="flex flex-col items-center gap-1.5 text-slate-500 hover:text-slate-400 cursor-pointer"
          >
            <Settings className={`w-5 h-5 ${currentTab === 'settings' ? 'text-emerald-400' : ''}`} />
            <span className={`text-[9px] uppercase tracking-wider font-semibold ${currentTab === 'settings' ? 'text-emerald-450 font-bold' : ''}`}>{t.settings || (language === 'te' ? 'సెట్టింగులు' : 'Settings')}</span>
          </button>
        )}
      </nav>

      {renderToasts()}

    </div>
  );
}
