import React, { useState, useEffect } from 'react';
import { Plus, Edit2, AlertCircle, Upload, Check, RefreshCw } from 'lucide-react';
import { translations } from '../utils/translations';

export default function StockManagement({ backendUrl, userToken, language }) {
  const [stock, setStock] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  
  const t = translations[language || 'te'];

  const [form, setForm] = useState({
    variety_name: '',
    quantity_kg: '',
    price_per_kg: '',
    low_stock_threshold: '50'
  });
  
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    quantity_kg: '',
    price_per_kg: '',
    low_stock_threshold: ''
  });

  const fetchStock = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/stock`);
      if (res.ok) {
        const data = await res.json();
        setStock(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStock();

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanHost = backendUrl.replace('http://', '').replace('https://', '');
    const wsUrl = `${wsProto}//${cleanHost}/api/ws/queue`;

    let socket;
    function connect() {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (e) => {
        if (e.data === 'REFRESH_QUEUE' || e.data === 'REFRESH_STOCK') {
          fetchStock();
        }
      };
      socket.onclose = () => setTimeout(connect, 3000);
    }
    
    connect();
    return () => {
      if (socket) socket.close();
    };
  }, [backendUrl]);

  // Handle quantity mapping for forms (1 bag = 10 kg)
  const handleFormQtyChange = (val, type, isEdit = false) => {
    const numeric = parseFloat(val) || 0;
    const targetSet = isEdit ? setEditForm : setForm;
    
    if (type === 'kg') {
      targetSet(prev => ({
        ...prev,
        quantity_kg: val,
        bags: val ? (numeric / 10).toFixed(1) : ''
      }));
    } else {
      targetSet(prev => ({
        ...prev,
        bags: val,
        quantity_kg: val ? (numeric * 10).toFixed(1) : ''
      }));
    }
  };

  // Add variety
  const handleAddStock = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${backendUrl}/api/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          variety_name: form.variety_name,
          quantity_kg: parseFloat(form.quantity_kg),
          price_per_kg: parseFloat(form.price_per_kg),
          low_stock_threshold: parseFloat(form.low_stock_threshold)
        })
      });

      if (res.ok) {
        setShowAddModal(false);
        setForm({ variety_name: '', quantity_kg: '', price_per_kg: '', low_stock_threshold: '50' });
        fetchStock();
      } else {
        const err = await res.json();
        alert(err.detail || 'Error adding stock.');
      }
    } catch (err) {
      alert('Error connecting to backend.');
    }
  };

  // Open Edit Modal
  const openEditModal = (item) => {
    setEditingItem(item);
    const qty = item.quantity_kg || 0;
    const price = item.price_per_kg || 0;
    const threshold = item.low_stock_threshold || 0;
    setEditForm({
      quantity_kg: qty.toString(),
      bags: (qty / 10).toString(),
      price_per_kg: price.toString(),
      low_stock_threshold: threshold.toString()
    });
    setShowEditModal(true);
  };

  // Save Edit
  const handleEditStock = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${backendUrl}/api/stock/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          quantity_kg: parseFloat(editForm.quantity_kg),
          price_per_kg: parseFloat(editForm.price_per_kg),
          low_stock_threshold: parseFloat(editForm.low_stock_threshold)
        })
      });

      if (res.ok) {
        setShowEditModal(false);
        fetchStock();
      } else {
        const err = await res.json();
        alert(err.detail || 'Error saving changes.');
      }
    } catch (err) {
      alert('Network error.');
    }
  };

  // Simulate CSV bulk import
  const handleBulkImport = () => {
    setImportStatus('reading');
    setTimeout(() => {
      setImportStatus('success');
      setTimeout(() => {
        setImportStatus('');
        fetchStock();
      }, 2000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 backdrop-blur-md p-5 rounded-3xl border border-slate-800/80 shadow-lg relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t.stockManagement}</h2>
          <p className="text-xs text-slate-400">{t.stockDesc}</p>
        </div>
        
        <div className="flex gap-2">
          {/* CSV Import */}
          <button
            onClick={handleBulkImport}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-slate-200 py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-800 transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            {importStatus === 'reading' ? (language === 'te' ? 'దిగుమతి అవుతోంది...' : 'Importing...') :
             importStatus === 'success' ? (language === 'te' ? 'దిగుమతి అయింది ✓' : 'Imported ✓') : t.importCsv}
          </button>
          
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t.addVariety}
          </button>
        </div>
      </div>

      {/* Grid of stock cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stock.map((item) => {
          const isLowStock = item.quantity_kg < item.low_stock_threshold;
          return (
            <div
              key={item.id}
              className={`glass-panel rounded-3xl overflow-hidden border relative flex flex-col justify-between hover-scale ${
                isLowStock 
                  ? 'border-rose-800/40 bg-gradient-to-br from-slate-900/60 to-rose-950/10 shadow-lg shadow-rose-950/5' 
                  : 'border-slate-800/80 shadow-md'
              }`}
            >
              {/* Decorative top line */}
              <div className={`absolute inset-x-0 top-0 h-0.5 ${isLowStock ? 'bg-rose-500' : 'bg-emerald-500/30'}`} />

              {/* Badge for low stock */}
              {isLowStock ? (
                <div className="absolute top-4 right-4 bg-rose-950/40 border border-rose-900/30 text-rose-400 font-bold px-3 py-1 rounded-full text-[9px] uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  {t.lowStock}
                </div>
              ) : (
                <div className="absolute top-4 right-4 bg-emerald-950/40 border border-emerald-900/20 text-emerald-400 font-bold px-3 py-1 rounded-full text-[9px] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_hsl(142,72%,29%)]" />
                  {t.okStatus}
                </div>
              )}

              <div className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <h3 className="font-extrabold text-base text-slate-100">{item.variety_name}</h3>
                  <span className="text-[9px] text-slate-500 font-mono tracking-widest font-bold">RM-{item.id.toString().padStart(3, '0')}</span>
                </div>

                {/* Stock levels */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{language === 'te' ? 'బరువు (కిలోలు)' : 'Weight (kg)'}</span>
                    <div className="text-sm font-bold text-slate-200 mt-1 font-mono">{(item.quantity_kg || 0).toFixed(1)}</div>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-900">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{t.bags}</span>
                    <div className="text-sm font-bold text-slate-200 mt-1 font-mono">{(item.bags_count || 0).toFixed(1)}</div>
                  </div>
                </div>

                {/* Pricing & Threshold */}
                <div className="flex justify-between items-center text-xs pt-1">
                  <div>
                    <span className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">{language === 'te' ? 'కిలో ధర' : 'Price/kg'}</span>
                    <div className="font-extrabold text-slate-200 text-sm mt-0.5 font-mono">₹{(item.price_per_kg || 0).toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">{t.lowStockThreshold}</span>
                    <div className="font-semibold text-slate-400 mt-0.5 font-mono">{item.low_stock_threshold} kg</div>
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="bg-slate-950/40 border-t border-slate-900 px-6 py-3.5 flex justify-between items-center">
                <span className={`text-[10px] font-bold ${isLowStock ? 'text-rose-400/90' : 'text-slate-500'}`}>
                  {isLowStock 
                    ? (language === 'te' ? 'ఆటో రి ఆర్డర్ సలహా: 500 కిలోలు' : 'Auto-suggest order: 500kg') 
                    : (language === 'te' ? 'నిల్వ సరిపడా ఉంది' : 'Stock level: Normal')}
                </span>
                <button
                  onClick={() => openEditModal(item)}
                  className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-850 transition-all cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ADD RICE VARIETY MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-sm w-full overflow-hidden shadow-2xl animate-fade-in relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-850 flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-200">{t.addVariety}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-200 text-lg font-bold">
                ×
              </button>
            </div>
            
            <form onSubmit={handleAddStock} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">{t.varietyName}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sona Masuri, Basmati"
                  value={form.variety_name}
                  onChange={(e) => setForm(prev => ({ ...prev, variety_name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{language === 'te' ? 'బరువు (కిలోలు)' : 'Weight (kg)'}</label>
                  <input
                    type="number"
                    required
                    placeholder="500"
                    value={form.quantity_kg}
                    onChange={(e) => handleFormQtyChange(e.target.value, 'kg')}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.bags}</label>
                  <input
                    type="number"
                    placeholder="50"
                    value={form.bags || ''}
                    onChange={(e) => handleFormQtyChange(e.target.value, 'bag')}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.pricePerKg}</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="95"
                    value={form.price_per_kg}
                    onChange={(e) => setForm(prev => ({ ...prev, price_per_kg: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.threshold}</label>
                  <input
                    type="number"
                    required
                    placeholder="50"
                    value={form.low_stock_threshold}
                    onChange={(e) => setForm(prev => ({ ...prev, low_stock_threshold: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-lg shadow-emerald-950/30 cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] max-w-sm w-full overflow-hidden shadow-2xl animate-fade-in relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
            
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-850 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-xs uppercase tracking-widest text-slate-200">{t.editStock}</h3>
                <span className="text-[10px] text-slate-500 font-mono block mt-1">{editingItem.variety_name}</span>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-500 hover:text-slate-200 text-lg font-bold">
                ×
              </button>
            </div>

            <form onSubmit={handleEditStock} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{language === 'te' ? 'మొత్తం బరువు (కిలోలు)' : 'Total Weight (kg)'}</label>
                  <input
                    type="number"
                    required
                    value={editForm.quantity_kg}
                    onChange={(e) => handleFormQtyChange(e.target.value, 'kg', true)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{language === 'te' ? 'మొత్తం సంచులు' : 'Total Bags'}</label>
                  <input
                    type="number"
                    value={editForm.bags || ''}
                    onChange={(e) => handleFormQtyChange(e.target.value, 'bag', true)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.pricePerKg}</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editForm.price_per_kg}
                    onChange={(e) => setEditForm(prev => ({ ...prev, price_per_kg: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400">{t.threshold}</label>
                  <input
                    type="number"
                    required
                    value={editForm.low_stock_threshold}
                    onChange={(e) => setEditForm(prev => ({ ...prev, low_stock_threshold: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-755 text-slate-400 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/30 cursor-pointer"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Loader Modal Overlay */}
      {importStatus === 'reading' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 max-w-xs text-center space-y-4 shadow-2xl relative">
            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent" />
            <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-200">{language === 'te' ? 'CSV ఫైల్ దిగుమతి' : 'Importing CSV Data'}</h4>
              <p className="text-[10px] text-slate-500 mt-2 font-mono">{language === 'te' ? 'నిల్వలను పరుస్తున్నాము, డేటాబేస్ అప్‌డేట్ అవుతోంది...' : 'Parsing rows, updating database varieties...'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
