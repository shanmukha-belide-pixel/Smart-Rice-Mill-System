import React, { useState, useEffect, useRef } from 'react';
import { Play, UserCheck, UserX, UserMinus, ShieldAlert, Award, Clock, Users, CheckCircle, Volume2, X, QrCode, Scan, RefreshCw } from 'lucide-react';
import { translations } from '../utils/translations';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function TokenDashboard({ backendUrl, userToken, role, language, toggleFullscreen, isFullscreen, syncedText, isConnected }) {
  const [tokens, setTokens] = useState([]);
  const [stockVarieties, setStockVarieties] = useState([]);
  const [selectedCounter, setSelectedCounter] = useState('Counter 1');
  const [isHold, setIsHold] = useState(false);
  const [showServeModal, setShowServeModal] = useState(false);
  const [servingToken, setServingToken] = useState(null);
  const [saleForm, setSaleForm] = useState({ variety_name: '', quantity_kg: '', bags: '', payment_mode: 'Cash', customer_name: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  // QR Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanVerified, setScanVerified] = useState(false);
  const [verifiedTxId, setVerifiedTxId] = useState('');

  // Card payment state
  const [isCardVerified, setIsCardVerified] = useState(false);
  const [cardTxId, setCardTxId] = useState('');

  // Receipt state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const t = translations[language || 'te'];

  // Swipe gesture states
  const [swipeTokenId, setSwipeTokenId] = useState(null);
  const [swipeStartX, setSwipeStartX] = useState(0);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);

  // Pull to refresh gesture states
  const [touchStart, setTouchStart] = useState(null);
  const [pulling, setPulling] = useState(false);

  const handleTouchStartGlobal = (e) => {
    if (window.scrollY === 0) {
      setTouchStart(e.targetTouches[0].clientY);
    }
  };

  const handleTouchMoveGlobal = (e) => {
    if (touchStart === null) return;
    const currentTouch = e.targetTouches[0].clientY;
    const diff = currentTouch - touchStart;
    if (diff > 85 && !pulling) {
      setPulling(true);
    }
  };

  const handleTouchEndGlobal = () => {
    if (pulling) {
      fetchData();
      if (window.showToast) {
        window.showToast('success', language === 'te' ? 'డేటా సమకాలీకరించబడింది ✓' : 'Queue data synchronized ✓');
      }
      setPulling(false);
    }
    setTouchStart(null);
  };

  const handleCardTouchStart = (e, tokenId) => {
    setSwipeTokenId(tokenId);
    setSwipeStartX(e.targetTouches[0].clientX);
    setSwipeOffsetX(0);
  };

  const handleCardTouchMove = (e, tokenId) => {
    if (swipeTokenId !== tokenId) return;
    const diff = e.targetTouches[0].clientX - swipeStartX;
    // Bound swipe offset to prevent overflow
    if (Math.abs(diff) < 130) {
      setSwipeOffsetX(diff);
    }
  };

  const handleCardTouchEnd = (token) => {
    if (swipeTokenId !== token.id) return;
    
    if (swipeOffsetX < -75) {
      // Swipe left: mark no-show
      handleNoShow(token.id);
      if (window.showToast) {
        window.showToast('warning', language === 'te' ? `టోకెన్ ${token.token_number} నో-షోగా మార్చబడింది.` : `Token ${token.token_number} marked as no-show.`);
      }
    } else if (swipeOffsetX > 75) {
      // Swipe right: open serve checkout modal
      openServeModal(token);
    }
    
    setSwipeTokenId(null);
    setSwipeOffsetX(0);
  };

  // Audio/voice setup
  useEffect(() => {
    if ('speechSynthesis' in window) {
      setIsSpeechSupported(true);
    }
  }, []);

  // Speak announcement
  const announceToken = (tokenNumber, counter) => {
    if (!isSpeechSupported) return;
    
    // Stop any active speech
    window.speechSynthesis.cancel();
    
    // We announce in Telugu first, then English
    const teluguText = `టోకెన్ నంబర్ ${tokenNumber.replace('-', ' ')} దయచేసి ${counter} కి రండి.`;
    const englishText = `Token number ${tokenNumber}, please proceed to ${counter}.`;
    
    // Telugu synthesis
    const utteranceTe = new SpeechSynthesisUtterance(teluguText);
    utteranceTe.lang = 'te-IN';
    utteranceTe.rate = 0.8;
    
    // English synthesis
    const utteranceEn = new SpeechSynthesisUtterance(englishText);
    utteranceEn.lang = 'en-IN';
    utteranceEn.rate = 0.85;
    
    // Try to find correct voices
    const voices = window.speechSynthesis.getVoices();
    const teluguVoice = voices.find(v => v.lang.includes('te'));
    const englishVoice = voices.find(v => v.lang.includes('en'));
    
    if (teluguVoice) utteranceTe.voice = teluguVoice;
    if (englishVoice) utteranceEn.voice = englishVoice;
    
    // Play sound sequence
    window.speechSynthesis.speak(utteranceTe);
    window.speechSynthesis.speak(utteranceEn);
  };

  // Keep a stable ref to fetchData so WebSocket closures always call the latest version
  const fetchDataRef = useRef(null);

  // Fetch tokens and stock
  const fetchData = async () => {
    try {
      const timestamp = Date.now();
      // Get tokens (with auth header)
      const tokenRes = await fetch(`${backendUrl}/api/tokens?_t=${timestamp}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setTokens(tokenData);
      }
      
      // Get stock for dropdown
      const stockRes = await fetch(`${backendUrl}/api/stock?_t=${timestamp}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (stockRes.ok) {
        const stockData = await stockRes.json();
        setStockVarieties(stockData);
        if (stockData.length > 0 && !saleForm.variety_name) {
          setSaleForm(prev => ({ ...prev, variety_name: stockData[0].variety_name }));
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  // Always keep the ref pointing at the latest fetchData
  fetchDataRef.current = fetchData;

  // Connect WebSockets, polling fallback, and storage events for live sync
  useEffect(() => {
    fetchDataRef.current();

    // --- Polling fallback every 30 seconds (keeps working when WS drops) ---
    const pollInterval = setInterval(() => {
      fetchDataRef.current();
    }, 30000);

    const handleStorageChange = (e) => {
      if (e.key === 'ricemill_tokens' || e.key === 'ricemill_stock') {
        fetchDataRef.current();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanHost = backendUrl.replace('http://', '').replace('https://', '');
    const wsUrl = `${wsProto}//${cleanHost}/api/ws/queue`;

    let socket;
    let pingInterval;
    let destroyed = false;
    function connect() {
      if (destroyed) return;
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        // Ping every 30 seconds to keep connection alive on Render
        pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send("PING");
          }
        }, 30000);
      };
      socket.onmessage = (e) => {
        // Use ref so we always call the latest fetchData, not a stale closure
        if (e.data === 'REFRESH_QUEUE') {
          fetchDataRef.current();
        }
      };
      socket.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (!destroyed) setTimeout(connect, 3000);
      };
    }
    
    connect();
    return () => {
      destroyed = true;
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
      if (pingInterval) clearInterval(pingInterval);
      if (socket) socket.close();
    };
  }, [backendUrl]);

  // Call Next Token
  const handleCallNext = async () => {
    if (isHold) return;
    try {
      const res = await fetch(`${backendUrl}/api/tokens/call-next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ counter: selectedCounter })
      });
      if (res.ok) {
        const nextToken = await res.json();
        announceToken(nextToken.token_number, selectedCounter);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to call next token.');
      }
    } catch (err) {
      alert('Error connecting to backend.');
    }
  };

  // Trigger No-Show skip
  const handleNoShow = async (tokenId) => {
    try {
      const res = await fetch(`${backendUrl}/api/tokens/${tokenId}/no-show`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reactivate No-Show
  const handleReactivate = async (tokenId) => {
    try {
      const res = await fetch(`${backendUrl}/api/tokens/${tokenId}/reactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open Serve Modal
  const openServeModal = (token) => {
    setServingToken(token);
    setErrorMsg('');
    setScanVerified(false);
    setVerifiedTxId('');
    setIsCardVerified(false);
    setCardTxId('');
    setSaleForm({
      variety_name: stockVarieties.length > 0 ? stockVarieties[0].variety_name : '',
      quantity_kg: '',
      bags: '',
      payment_mode: 'Cash',
      customer_name: token.customer_name || ''
    });
    setShowServeModal(true);
  };

  // Handle serving quantities mapping
  const handleQtyChange = (val, type) => {
    const numeric = parseFloat(val) || 0;
    if (type === 'kg') {
      setSaleForm(prev => ({
        ...prev,
        quantity_kg: val,
        bags: val ? (numeric / 10).toFixed(1) : ''
      }));
    } else {
      setSaleForm(prev => ({
        ...prev,
        bags: val,
        quantity_kg: val ? (numeric * 10).toFixed(1) : ''
      }));
    }
  };

  // Submit Sale
  const handleConfirmServe = async (e) => {
    e.preventDefault();
    if (!saleForm.quantity_kg || parseFloat(saleForm.quantity_kg) <= 0) {
      setErrorMsg(language === 'te' ? 'దయచేసి సరైన పరిమాణాన్ని నమోదు చేయండి.' : 'Please enter a valid quantity.');
      return;
    }

    // Require payment scan verification if UPI selected
    if (saleForm.payment_mode === 'UPI' && !scanVerified) {
      setErrorMsg(language === 'te' ? 'దయచేసి సేవ పూర్తి చేసే ముందు UPI చెల్లింపును ధృవీకరించండి.' : 'Please verify the UPI payment before serving.');
      return;
    }

    // Require payment verification if Card selected
    if (saleForm.payment_mode === 'Card' && !isCardVerified) {
      setErrorMsg(language === 'te' ? 'దయచేసి సేవ పూర్తి చేసే ముందు కార్డ్ చెల్లింపును ధృవీకరించండి.' : 'Please verify the card payment before serving.');
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/tokens/${servingToken.id}/serve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          variety_name: saleForm.variety_name,
          quantity_kg: parseFloat(saleForm.quantity_kg),
          payment_mode: saleForm.payment_mode,
          customer_name: saleForm.customer_name || null
        })
      });

      if (res.ok) {
        // Calculate price for receipt
        const selectedStockItem = stockVarieties.find(v => v.variety_name === saleForm.variety_name);
        const itemPrice = selectedStockItem ? selectedStockItem.price_per_kg : 0;
        const currentTotal = (parseFloat(saleForm.quantity_kg) || 0) * itemPrice;

        setReceiptData({
          tokenNumber: servingToken.token_number,
          customerName: servingToken.customer_name || '-',
          phoneNumber: servingToken.phone_number || '-',
          varietyName: saleForm.variety_name,
          quantityKg: parseFloat(saleForm.quantity_kg),
          bags: parseFloat(saleForm.bags) || (parseFloat(saleForm.quantity_kg) / 10),
          pricePerKg: itemPrice,
          totalAmount: currentTotal,
          paymentMode: saleForm.payment_mode,
          txId: saleForm.payment_mode === 'UPI' ? verifiedTxId : (saleForm.payment_mode === 'Card' ? cardTxId : null),
          dateTime: new Date().toLocaleString()
        });

        setShowServeModal(false);
        setSaleForm(prev => ({ ...prev, quantity_kg: '', bags: '' }));
        setScanVerified(false);
        setVerifiedTxId('');
        setIsCardVerified(false);
        setCardTxId('');
        setShowReceiptModal(true);
        fetchData();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Error processing transaction.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    }
  };

  // Initialize and clear html5-qrcode scanner
  useEffect(() => {
    let scanner = null;
    if (showScanner) {
      // Clean target reader element to ensure no duplicate mountings
      const readerElem = document.getElementById("reader");
      if (readerElem) {
        readerElem.innerHTML = "";
      }

      scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          qrbox: { width: 180, height: 180 },
          aspectRatio: 1.0,
          rememberLastUsedCamera: true
        },
        false
      );

      const onScanSuccess = (decodedText) => {
        console.log("Real QR code scanned successfully:", decodedText);
        setVerifiedTxId(decodedText || 'UPI' + Math.floor(1000000000 + Math.random() * 9000000000));
        setScanVerified(true);
        setShowScanner(false);
        if (scanner) {
          scanner.clear().catch(err => console.error("Error clearing scanner on success:", err));
        }
      };

      const onScanFailure = (error) => {
        // Silent error callback (fires continuously while searching for a QR code)
      };

      scanner.render(onScanSuccess, onScanFailure);
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(err => {
          // Handled gracefully if scanner was already cleared
        });
      }
    };
  }, [showScanner]);

  // Group tokens
  const activeToken = tokens.find(t => t.status === 'active' && t.counter_assigned === selectedCounter);
  const otherActiveTokens = tokens.filter(t => t.status === 'active' && t.counter_assigned !== selectedCounter);
  const waitingTokens = tokens.filter(t => t.status === 'waiting');
  const noShowTokens = tokens.filter(t => t.status === 'no_show');
  const servedTokens = tokens.filter(t => t.status === 'served');

  // Stats calculation
  const totalServedToday = servedTokens.length;
  const waitingCount = waitingTokens.length;
  const noShowRate = (tokens && tokens.length) ? ((noShowTokens.length / tokens.length) * 100).toFixed(1) : 0;
  
  // Calculate wait time
  const nextWaitMinutes = waitingCount * 8;

  // Calculate dynamic bill and UPI details
  const selectedStockItem = stockVarieties.find(v => v.variety_name === saleForm.variety_name);
  const itemPrice = selectedStockItem ? selectedStockItem.price_per_kg : 0;
  const currentTotal = (parseFloat(saleForm.quantity_kg) || 0) * itemPrice;
  
  const upiUrlPayload = servingToken 
    ? `upi://pay?pa=7075295440@ybl&pn=BELIDE%20SHANMUKHA%20SRINIVAS&am=${(currentTotal || 0).toFixed(2)}&cu=INR&tn=${servingToken.token_number}` 
    : '';
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiUrlPayload)}`;

  const handleSimulateScanSuccess = () => {
    const randomTx = 'UPI' + Math.floor(1000000000 + Math.random() * 9000000000);
    setVerifiedTxId(randomTx);
    setScanVerified(true);
    setShowScanner(false);
    setErrorMsg('');
  };

  return (
    <div 
      onTouchStart={handleTouchStartGlobal}
      onTouchMove={handleTouchMoveGlobal}
      onTouchEnd={handleTouchEndGlobal}
      className="space-y-6 relative"
    >
      {/* Pull down refresh visual spinner */}
      {pulling && (
        <div className="flex justify-center items-center py-3 bg-slate-900 border border-emerald-500/25 rounded-2xl animate-pulse text-xs text-emerald-400 gap-2 shadow-lg z-50">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>{language === 'te' ? 'తాజా డేటా సమకాలీకరిస్తోంది...' : 'Syncing live queue data...'}</span>
        </div>
      )}
      
      {/* Styles for dynamic laser scan and styling html5-qrcode controls */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scanLaser {
          0% { top: 0%; opacity: 0.3; }
          50% { top: 100%; opacity: 1; }
          100% { top: 0%; opacity: 0.3; }
        }
        .laser-animate {
          animation: scanLaser 2s linear infinite;
        }
        
        /* Premium style overrides for HTML5 QR Reader */
        #reader button {
          background-color: #059669 !important;
          color: #ffffff !important;
          font-weight: 700 !important;
          padding: 8px 16px !important;
          border-radius: 12px !important;
          border: none !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          cursor: pointer !important;
          margin: 6px !important;
          transition: all 0.2s !important;
        }
        #reader button:hover {
          background-color: #047857 !important;
          transform: translateY(-1px);
        }
        #reader select {
          background-color: #090d16 !important;
          border: 1px solid #1e293b !important;
          color: #f1f5f9 !important;
          padding: 8px !important;
          border-radius: 12px !important;
          font-size: 11px !important;
          outline: none !important;
          margin: 5px 0 !important;
        }
        #reader a {
          color: #10b981 !important;
          font-size: 11px !important;
          text-decoration: underline !important;
        }
        #reader__scan_region {
          border: 1px dashed rgba(255,255,255,0.1) !important;
          border-radius: 20px !important;
          background-color: rgba(15, 23, 42, 0.4) !important;
          overflow: hidden !important;
        }
        #reader__dashboard {
          padding: 10px 0 !important;
        }
      `}} />

      {/* Top Header / Counter Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/40 backdrop-blur-md p-5 rounded-3xl border border-slate-800/80 shadow-lg relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t.queueOperations}</h2>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
            <span>{t.queueOperationsDesc}</span>
            <span className="text-slate-700">•</span>
            <span className="font-mono text-[10px] text-slate-500 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-550' : 'bg-rose-550'}`} />
              {isConnected ? `Synced ${syncedText}` : 'Offline'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{t.activeCounter}</span>
            <select
              value={selectedCounter}
              onChange={(e) => setSelectedCounter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-3.5 py-3 h-11 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 mt-1"
            >
              <option>Counter 1</option>
              <option>Counter 2</option>
              <option>Counter 3</option>
            </select>
          </div>
          
          <button
            onClick={() => setIsHold(!isHold)}
            className={`px-4 py-3 h-11 rounded-xl text-xs font-bold transition-all uppercase tracking-wider mt-4 cursor-pointer flex items-center justify-center ${
              isHold 
                ? 'bg-rose-950/40 text-rose-400 border border-rose-800/40' 
                : 'bg-slate-900 text-slate-350 hover:bg-slate-850 border border-slate-855 hover:text-slate-200'
            }`}
          >
            {isHold ? t.holdQueueActive : t.holdQueue}
          </button>

          {toggleFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="px-4 py-3 h-11 rounded-xl text-xs font-bold transition-all uppercase tracking-wider bg-slate-900 text-slate-350 hover:bg-slate-850 border border-slate-855 hover:text-slate-200 mt-4 cursor-pointer flex items-center justify-center"
            >
              {isFullscreen ? (language === 'te' ? 'పూర్తి స్క్రీన్ వద్దు' : 'Exit Full') : (language === 'te' ? 'పూర్తి స్క్రీన్' : 'Fullscreen')}
            </button>
          )}
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Active Token & Controls */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Now Serving Card */}
          <div className="glass-panel rounded-[2rem] overflow-hidden border border-slate-800 shadow-xl relative">
            <div className="bg-emerald-950/10 border-b border-slate-850 px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_hsl(142,72%,29%)] animate-pulse" />
                <h3 className="font-bold text-slate-200 text-xs tracking-wider uppercase">{t.nowServingAt} {selectedCounter}</h3>
              </div>
              {activeToken && isSpeechSupported && (
                <button 
                  onClick={() => announceToken(activeToken.token_number, selectedCounter)}
                  className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
                  title="Re-announce voice call"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="p-6 flex flex-col items-center justify-center min-h-[220px] text-center relative">
              {activeToken ? (
                <div className="space-y-5 w-full animate-fade-in">
                  <div className="space-y-2">
                    <span className="text-[9px] bg-emerald-950/60 border border-emerald-800/35 text-emerald-400 px-3.5 py-1 rounded-full font-bold uppercase tracking-wider">
                      {activeToken.priority ? t.priorityClient : t.regularClient}
                    </span>
                    <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200 tracking-tight font-mono py-1 select-none">
                      {activeToken.token_number}
                    </h1>
                    <p className="text-[10px] text-slate-500 font-mono tracking-wider">{t.contactNumber}: {activeToken.phone_number}</p>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      onClick={() => openServeModal(activeToken)}
                      className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-555 text-white font-bold py-3 px-6 rounded-xl text-xs transition-all shadow-lg shadow-emerald-950/30 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      {t.completeAndServe}
                    </button>
                    <button
                      onClick={() => handleNoShow(activeToken.id)}
                      className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-805 text-slate-300 font-bold py-3 px-5 rounded-xl text-xs border border-slate-800 transition-all cursor-pointer"
                    >
                      <UserX className="w-4 h-4" />
                      {t.markNoShow}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-6">
                  <Clock className="w-12 h-12 text-slate-700 mx-auto stroke-1" />
                  <p className="text-slate-400 text-xs">{t.counterIdle}</p>
                  <button
                    onClick={handleCallNext}
                    disabled={isHold}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-550 disabled:opacity-50 text-white font-bold py-3 px-8 rounded-xl text-xs transition-all uppercase tracking-wider shadow-lg shadow-emerald-950/20 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {t.callNextCustomer}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active on other counters */}
          {otherActiveTokens.length > 0 && (
            <div className="bg-slate-900/10 border border-slate-850 rounded-2xl p-4">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{t.activeOtherCounters}</span>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {otherActiveTokens.map(t => (
                  <div key={t.id} className="bg-slate-950 border border-slate-900 px-3.5 py-2 rounded-xl flex items-center gap-3 text-[11px] hover-scale">
                    <span className="font-mono text-emerald-400 font-bold">{t.token_number}</span>
                    <span className="text-slate-800 font-bold">|</span>
                    <span className="text-slate-400 font-semibold">{t.counter_assigned}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waiting Queue List */}
          <div className="glass-panel rounded-[2rem] overflow-hidden border border-slate-800 shadow-xl">
            <div className="bg-slate-900/40 px-6 py-4 border-b border-slate-855 flex justify-between items-center">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">{t.waitingQueueCount.replace('{count}', waitingTokens.length)}</h3>
              <span className="text-[10px] text-slate-500 uppercase font-bold font-mono tracking-wider">{t.fifoOrder}</span>
            </div>
            
            <div className="p-4 divide-y divide-slate-900/80 max-h-[350px] overflow-y-auto space-y-2">
              {waitingTokens.length > 0 ? (
                waitingTokens.map((token, index) => (
                  <div key={token.id} className="relative overflow-hidden rounded-xl bg-slate-900/10 border border-slate-900/30">
                    {/* Swipe revealed backgrounds */}
                    <div className="absolute inset-0 flex justify-between items-center px-4 pointer-events-none select-none">
                      <div className="bg-emerald-600/30 text-emerald-400 text-[9px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 shadow-inner">
                        Serve →
                      </div>
                      <div className="bg-rose-600/30 text-rose-400 text-[9px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 shadow-inner">
                        ← No-Show
                      </div>
                    </div>

                    {/* Foreground card content */}
                    <div
                      onTouchStart={(e) => handleCardTouchStart(e, token.id)}
                      onTouchMove={(e) => handleCardTouchMove(e, token.id)}
                      onTouchEnd={() => handleCardTouchEnd(token)}
                      style={swipeTokenId === token.id ? { transform: `translateX(${swipeOffsetX}px)`, transition: 'none' } : { transform: 'translateX(0)', transition: 'transform 0.25s ease-out' }}
                      className="flex justify-between items-center py-3.5 px-2.5 bg-slate-900/90 hover:bg-slate-900/20 rounded-xl transition-all relative z-10"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] font-mono text-slate-600 w-5">#{index + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-amber-500 font-bold text-xs bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/10">
                            {token.token_number}
                          </span>
                          {token.priority && (
                            <span className="text-[8px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider" title={token.priority_reason}>
                              Priority
                            </span>
                          )}
                        </div>
                        <div className="hidden sm:block">
                          <span className="text-[11px] text-slate-500 font-mono">{token.phone_number}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] text-slate-400 font-semibold font-mono">~{token.wait_time_minutes} {t.mins}</span>
                        {index === 0 && (
                          <button
                            onClick={() => openServeModal(token)}
                            disabled={isHold}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 h-11 min-w-[55px] flex items-center justify-center rounded-xl text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            {t.call}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-550 text-xs">{t.noWaitingCustomers}</div>
              )}
            </div>
          </div>

        </div>

        {/* Right column: Stats & No-shows logs */}
        <div className="space-y-6">
          
          {/* Quick Intel Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col justify-between hover-scale">
              <Clock className="w-5 h-5 text-emerald-500 stroke-1" />
              <div className="mt-4">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">{t.avgWait}</span>
                <span className="text-lg font-bold text-slate-200 mt-1 block font-mono">~{nextWaitMinutes}{language === 'te' ? 'ని.' : 'm'}</span>
              </div>
            </div>
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col justify-between hover-scale">
              <Users className="w-5 h-5 text-amber-500 stroke-1" />
              <div className="mt-4">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">{t.waiting}</span>
                <span className="text-lg font-bold text-slate-200 mt-1 block font-mono">{waitingCount} {language === 'te' ? 'వ్యక్తులు' : 'people'}</span>
              </div>
            </div>
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col justify-between hover-scale">
              <CheckCircle className="w-5 h-5 text-slate-450 stroke-1" />
              <div className="mt-4">
                <span className="text-[9px] text-slate-505 uppercase tracking-widest font-bold block">{t.served}</span>
                <span className="text-lg font-bold text-slate-200 mt-1 block font-mono">{totalServedToday} {language === 'te' ? 'టోకెన్లు' : 'tokens'}</span>
              </div>
            </div>
            <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col justify-between hover-scale">
              <UserMinus className="w-5 h-5 text-rose-500 stroke-1" />
              <div className="mt-4">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block">{t.noShow}</span>
                <span className="text-lg font-bold text-slate-200 mt-1 block font-mono">{noShowRate}%</span>
              </div>
            </div>
          </div>

          {/* No Show Skip List */}
          <div className="glass-panel rounded-[2rem] overflow-hidden border border-slate-800 shadow-xl">
            <div className="bg-slate-900/40 px-5 py-3.5 border-b border-slate-850">
              <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider">{t.noShowsTitle}</h4>
            </div>
            <div className="p-3 divide-y divide-slate-900/80 max-h-[220px] overflow-y-auto">
              {noShowTokens.length > 0 ? (
                noShowTokens.map(token => {
                  // Helper to parse database UTC string safely
                  const getNoShowMinutes = (noShowAtStr) => {
                    if (!noShowAtStr) return 999;
                    const utcStr = noShowAtStr.endsWith('Z') ? noShowAtStr : noShowAtStr + 'Z';
                    const diffMs = new Date() - new Date(utcStr);
                    const mins = Math.floor(diffMs / 60000);
                    return mins >= 0 ? mins : 0;
                  };
                  const elapsedMins = getNoShowMinutes(token.no_show_at);
                  const isReactivatable = elapsedMins <= 10;
                  
                  return (
                    <div key={token.id} className="flex justify-between items-center py-2.5 text-[11px]">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-900">
                            {token.token_number}
                          </span>
                          <span className={`text-[8px] font-bold uppercase tracking-wider font-mono ${isReactivatable ? 'text-amber-500' : 'text-slate-500'}`}>
                            {isReactivatable ? `${elapsedMins}m ago` : 'Expired'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-550 font-mono block mt-1">{token.phone_number}</span>
                      </div>
                      
                      {isReactivatable ? (
                        <button
                          onClick={() => handleReactivate(token.id)}
                          className="text-emerald-500 hover:text-emerald-450 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg transition-colors text-[10px] font-bold border border-transparent hover:border-emerald-500/10 cursor-pointer"
                        >
                          {t.reactivate}
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider font-bold pr-2" title="Skipped for more than 10 minutes. Client must register a new token.">
                          Expired
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-slate-700 text-xs">{t.noSkippedCustomers}</div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* SERVE / CHECKOUT TRANSACTION MODAL */}
      {showServeModal && servingToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800/80 rounded-[2rem] max-w-md w-full max-h-[95vh] overflow-hidden shadow-2xl animate-fade-in relative flex flex-col">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            
            {/* Modal Header */}
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-850 flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-200">{t.checkoutRiceSale}</h3>
              <button 
                onClick={() => {
                  setShowServeModal(false);
                  setShowScanner(false);
                }}
                className="text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Real Webcam QR Code Scanner Viewport Overlay */}
            {showScanner && (
              <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col justify-between p-6 animate-fade-in">
                <div className="flex justify-between items-center border-b border-slate-900 pb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <Scan className="w-4 h-4 text-emerald-400 animate-pulse" />
                    {t.scannerTitle}
                  </h4>
                  <button 
                    onClick={() => setShowScanner(false)}
                    className="text-slate-500 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Webcam Scanner Frame */}
                <div className="my-auto mx-auto w-full max-w-xs bg-slate-900/40 p-4 rounded-3xl border border-slate-850/80 flex flex-col items-center justify-center min-h-[250px] relative">
                  <div id="reader" className="w-full overflow-hidden text-slate-400 text-[10px]"></div>
                  
                  {/* Overlay green laser for aesthetic feedback when camera is active */}
                  <div className="absolute left-6 right-6 h-0.5 bg-emerald-500 shadow-[0_0_12px_hsl(142,72%,29%)] laser-animate pointer-events-none" style={{top: '40%'}} />
                </div>

                <div className="space-y-4 text-center">
                  <p className="text-[11px] text-slate-400 font-semibold px-4 leading-relaxed">
                    {t.alignInstructions}
                  </p>
                  
                  {/* Simulated fallback button if webcam is absent or testing on desktop */}
                  <button
                    type="button"
                    onClick={handleSimulateScanSuccess}
                    className="w-full bg-slate-900 hover:bg-slate-805 text-emerald-400 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider border border-emerald-950/20 hover:border-emerald-500/20 transition-all cursor-pointer shadow-lg"
                  >
                    {t.simulateScanSuccess}
                  </button>
                </div>
              </div>
            )}

            {/* Serve Form */}
            <form onSubmit={handleConfirmServe} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 pr-3 scrollbar-thin">
                {errorMsg && (
                <div className="bg-rose-955/40 border border-rose-900/25 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4.5 h-4.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Ticket Details Panel */}
              <div className="bg-slate-955 border border-slate-850 rounded-2xl p-4 flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">{t.servingToken}</span>
                  <div className="text-2xl font-mono font-black text-emerald-400 mt-1">
                    {servingToken.token_number}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">{t.contactNumber}</span>
                  <div className="font-mono text-slate-300 mt-1">{servingToken.phone_number}</div>
                </div>
              </div>

              {/* Customer Name input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">
                  {language === 'te' ? 'కస్టమర్ పేరు (ఐచ్ఛికం)' : 'Customer Name (Optional)'}
                </label>
                <input
                  type="text"
                  value={saleForm.customer_name}
                  onChange={(e) => setSaleForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder={language === 'te' ? 'ఉదా. రాము గారు' : 'e.g. Ramu'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100"
                />
                <p className="text-[10px] text-slate-500">{language === 'te' ? 'ఇది Excel రిపోర్ట్‌లో కనిపిస్తుంది' : 'This will appear in the Excel sales report'}</p>
              </div>

              {/* Rice variety selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">{t.riceVariety}</label>
                <select
                  value={saleForm.variety_name}
                  onChange={(e) => setSaleForm(prev => ({ ...prev, variety_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
                >
                  {stockVarieties.map(s => (
                    <option key={s.id} value={s.variety_name}>
                      {s.variety_name} (₹{(s.price_per_kg || 0).toFixed(1)}/{language === 'te' ? 'కిలో' : 'kg'}) - Max {(s.quantity_kg || 0).toFixed(1)}kg
                    </option>
                  ))}
                </select>
                {selectedStockItem && selectedStockItem.quantity_kg <= 0 && (
                  <div className="bg-rose-950/40 border border-rose-900/30 text-rose-450 p-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mt-1.5">
                    ⚠️ {language === 'te' ? 'నిల్వ సున్నా! ఈ రకం రద్దు అయింది.' : 'Out of Stock! Cannot complete sale.'}
                  </div>
                )}
              </div>

              {/* Quantity calculation inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.quantityKg}</label>
                  <input
                    type="number"
                    step="any"
                    value={saleForm.quantity_kg}
                    onChange={(e) => handleQtyChange(e.target.value, 'kg')}
                    placeholder="e.g. 150"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.bags}</label>
                  <input
                    type="number"
                    step="any"
                    value={saleForm.bags}
                    onChange={(e) => handleQtyChange(e.target.value, 'bag')}
                    placeholder="e.g. 15"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                  />
                </div>
              </div>

              {/* Total price indicator */}
              {saleForm.quantity_kg > 0 && (
                <div className="bg-slate-955/60 p-4 rounded-xl flex justify-between items-center text-xs border border-slate-850">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">{t.calculatedPrice}</span>
                  <span className="font-black text-slate-200 text-sm font-mono">
                    ₹
                    {currentTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Payment Mode Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">{t.paymentMode}</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { mode: 'Cash', label: t.cash },
                    { mode: 'UPI', label: t.upi },
                    { mode: 'Card', label: t.card }
                  ].map(item => (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => {
                        setSaleForm(prev => ({ ...prev, payment_mode: item.mode }));
                        setErrorMsg('');
                        if (item.mode !== 'UPI') {
                          setScanVerified(false);
                          setVerifiedTxId('');
                        }
                        if (item.mode !== 'Card') {
                          setIsCardVerified(false);
                          setCardTxId('');
                        }
                      }}
                      className={`py-2.5 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center ${
                        saleForm.payment_mode === item.mode
                          ? 'bg-emerald-600/10 border-emerald-500 text-emerald-450 shadow-inner'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic QR Code & Scanner panel if UPI payment selected */}
              {saleForm.payment_mode === 'UPI' && saleForm.quantity_kg > 0 && (
                <div className="border border-slate-800 bg-slate-955 rounded-2xl p-4 flex flex-col items-center justify-center space-y-4 animate-slide-in">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                    {language === 'te' ? 'కస్టమర్ కోసం చెల్లింపు QR కోడ్' : 'Customer Payment QR Code'}
                  </span>
                  
                  {/* Visual QR Code Card */}
                  <div className="bg-white p-3 rounded-2xl shadow-lg border border-slate-200">
                    <img 
                      src={qrCodeImageUrl} 
                      alt="UPI Payment QR Code" 
                      className="w-36 h-36 select-none"
                    />
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-slate-455">7075295440@ybl</span>

                  {/* Scan Proof button / verified label */}
                  {!scanVerified ? (
                    <div className="w-full space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowScanner(true);
                          setErrorMsg('');
                        }}
                        className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-805 text-emerald-400 font-bold py-2.5 px-4 rounded-xl text-xs border border-emerald-900/20 hover:border-emerald-500/20 cursor-pointer shadow-md w-full justify-center"
                      >
                        <Scan className="w-4 h-4 animate-pulse" />
                        {t.scanPaymentProof}
                      </button>

                      {/* Manual Input for UPI Transaction ID */}
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-semibold text-slate-400 text-left">
                          {language === 'te' ? 'లేదా మాన్యువల్‌గా లావాదేవీ IDని నమోదు చేయండి' : 'Or Manually Enter Transaction ID'}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={language === 'te' ? 'లావాదేవీ IDని నమోదు చేయండి' : 'Enter Transaction ID'}
                            value={verifiedTxId}
                            onChange={(e) => setVerifiedTxId(e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (verifiedTxId.trim()) {
                                setScanVerified(true);
                              } else {
                                setErrorMsg(language === 'te' ? 'దయచేసి లావాదేవీ IDని నమోదు చేయండి.' : 'Please enter a transaction ID.');
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-550 text-white font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer"
                          >
                            {t.verifyPayment}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full bg-emerald-955/20 border border-emerald-900/30 text-emerald-400 rounded-xl p-3 flex flex-col items-center text-xs animate-slide-in relative">
                      <span className="font-bold flex items-center gap-1.5 text-[11px] mb-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500 fill-emerald-500/10" />
                        {t.paymentVerified}
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono tracking-wider font-bold">
                        {t.transactionId}: {verifiedTxId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setScanVerified(false);
                          setVerifiedTxId('');
                        }}
                        className="absolute right-2 top-2 text-slate-500 hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Card Payment panel if Card payment selected */}
              {saleForm.payment_mode === 'Card' && saleForm.quantity_kg > 0 && (
                <div className="border border-slate-800 bg-slate-955 rounded-2xl p-4 flex flex-col space-y-4 animate-slide-in">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold text-center block">
                    {t.cardDetails}
                  </span>
                  
                  {!isCardVerified ? (
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-semibold text-slate-400">
                        {t.cardTransactionId}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Card last 4 digits or Tx ID"
                          value={cardTxId}
                          onChange={(e) => setCardTxId(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (cardTxId.trim()) {
                              setIsCardVerified(true);
                            } else {
                              setErrorMsg(language === 'te' ? 'దయచేసి కార్డ్ లావాదేవీ సమాచారాన్ని నమోదు చేయండి.' : 'Please enter card transaction details.');
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-550 text-white font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          {t.verifyPayment}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full bg-emerald-955/20 border border-emerald-900/30 text-emerald-450 rounded-xl p-3 flex flex-col items-center text-xs animate-slide-in relative">
                      <span className="font-bold flex items-center gap-1.5 text-[11px] mb-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500 fill-emerald-500/10" />
                        {t.paymentVerified}
                      </span>
                      <span className="text-[9px] text-slate-550 font-mono tracking-wider font-bold">
                        {t.cardTransactionId}: {cardTxId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCardVerified(false);
                          setCardTxId('');
                        }}
                        className="absolute right-2 top-2 text-slate-500 hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>

              {/* Footer Controls */}
              <div className="p-6 border-t border-slate-850 bg-slate-950 flex gap-3 mt-auto">
                <button
                  type="button"
                  onClick={() => setShowServeModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 hover:text-slate-200 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={(saleForm.payment_mode === 'UPI' && !scanVerified) || (saleForm.payment_mode === 'Card' && !isCardVerified) || (selectedStockItem && selectedStockItem.quantity_kg <= 0)}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/30 cursor-pointer"
                >
                  {t.recordAndServe}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* TRANSACTION RECEIPT MODAL */}
      {showReceiptModal && receiptData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl animate-slide-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-650 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="text-sm font-bold tracking-wider flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                {t.receiptSuccess}
              </h3>
              <button 
                onClick={() => setShowReceiptModal(false)}
                className="hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Receipt Content Wrapper */}
            <div className="p-6">
              {/* Paper Receipt Simulation */}
              <div 
                id="printable-receipt"
                className="bg-white text-slate-900 p-5 rounded-2xl border border-slate-100 flex flex-col font-mono text-xs"
              >
                {/* Mill Branding */}
                <div className="text-center pb-4 border-b border-dashed border-slate-300">
                  <h4 className="font-bold text-sm tracking-wide text-slate-900">{t.receiptHeader}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">{t.receiptSubHeader}</p>
                </div>

                {/* Receipt Details */}
                <div className="py-3 space-y-1.5 border-b border-dashed border-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-xs">{t.receiptToken}:</span>
                    <span className="font-bold text-slate-950 text-sm">{receiptData.tokenNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name:</span>
                    <span className="font-bold text-slate-950">{receiptData.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.receiptPhone}:</span>
                    <span className="font-bold text-slate-950">{receiptData.phoneNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t.receiptDateTime}:</span>
                    <span className="text-slate-700 text-right">{receiptData.dateTime}</span>
                  </div>
                </div>

                {/* Items & Purchase Details */}
                <div className="py-3 space-y-1.5 border-b border-dashed border-slate-300">
                  <div className="flex justify-between font-bold text-slate-950 text-[13px]">
                    <span>{receiptData.varietyName}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>{t.receiptQty}:</span>
                    <span>{receiptData.quantityKg} kg</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>{t.receiptBags}:</span>
                    <span>{(receiptData.bags || 0).toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>{t.receiptRate}:</span>
                    <span>₹{(receiptData.pricePerKg || 0).toFixed(2)} / kg</span>
                  </div>
                </div>

                {/* Total and Payment Info */}
                <div className="pt-3 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-950 text-sm">
                    <span>{t.receiptTotal}:</span>
                    <span>₹{(receiptData.totalAmount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{t.receiptPaymentMode}:</span>
                    <span className="uppercase font-bold text-slate-800">{receiptData.paymentMode}</span>
                  </div>
                  {receiptData.txId && (
                    <div className="flex flex-col gap-0.5 text-[8px] text-slate-400 tracking-wide mt-1">
                      <span>{t.receiptTxId}:</span>
                      <span className="font-mono text-[9px] text-slate-600 break-all">{receiptData.txId}</span>
                    </div>
                  )}
                </div>

                {/* Thank You Note */}
                <div className="text-center pt-4 border-t border-dashed border-slate-200 mt-4 text-[9px] text-slate-400 font-sans">
                  {language === 'te' 
                    ? 'ధన్యవాదాలు! మళ్లీ సందర్శించండి.'
                    : 'Thank you! Visit again.'}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white py-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                >
                  {t.close}
                </button>
                <button
                  onClick={() => {
                    const printContent = document.getElementById('printable-receipt').innerHTML;
                    const printWindow = window.open('', '_blank', 'width=400,height=600');
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Print Receipt</title>
                          <style>
                            @page { margin: 0; size: 80mm 155mm; }
                            body { font-family: monospace; margin: 0; padding: 12px; width: 80mm; height: 155mm; box-sizing: border-box; color: black; background: white; font-size: 12px; overflow: hidden; }
                            .flex { display: flex; }
                            .flex-col { display: flex; flex-direction: column; }
                            .justify-between { justify-content: space-between; }
                            .text-center { text-align: center; }
                            .text-right { text-align: right; }
                            .font-bold { font-weight: bold; }
                            .text-sm { font-size: 14px; }
                            .text-xs { font-size: 12px; }
                            .text-\\[10px\\] { font-size: 10px; }
                            .text-\\[9px\\] { font-size: 9px; }
                            .text-\\[13px\\] { font-size: 13px; }
                            .text-\\[8px\\] { font-size: 8px; }
                            .border-b { border-bottom: 1px dashed #666; }
                            .border-t { border-top: 1px dashed #666; }
                            .border-dashed { border-style: dashed; }
                            .py-3 { padding-top: 12px; padding-bottom: 12px; }
                            .pb-4 { padding-bottom: 16px; }
                            .pt-4 { padding-top: 16px; }
                            .pt-3 { padding-top: 12px; }
                            .mt-4 { margin-top: 16px; }
                            .mt-1 { margin-top: 4px; }
                            .mt-0\\.5 { margin-top: 2px; }
                            .mb-1 { margin-bottom: 4px; }
                            .space-y-1\\.5 > * + * { margin-top: 6px; }
                            .tracking-wide { letter-spacing: 0.5px; }
                            .uppercase { text-transform: uppercase; }
                            .font-mono { font-family: monospace; }
                            .font-sans { font-family: sans-serif; }
                            .text-slate-900, .text-slate-950, .text-slate-800, .text-slate-700, .text-slate-500, .text-slate-400, .text-slate-600 { color: black; }
                          </style>
                        </head>
                        <body>
                          ${printContent}
                          <script>
                            setTimeout(() => {
                              window.print();
                              window.close();
                            }, 250);
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-950/20 cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  {t.printReceipt}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
