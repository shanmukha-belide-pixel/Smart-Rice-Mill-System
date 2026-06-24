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
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400">{t.millNameSetting}</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 font-bold"
                    value={settings.mill_name}
                    onChange={(e) => setSettings({ ...settings, mill_name: e.target.value })}
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

        </div>
      </div>
    </div>
  );
}
