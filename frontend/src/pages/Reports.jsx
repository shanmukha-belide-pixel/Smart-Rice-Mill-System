import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { Calendar, IndianRupee, Users, ShoppingBag, Download, ArrowUpRight, TrendingUp, Clock } from 'lucide-react';
import { translations } from '../utils/translations';

export default function Reports({ backendUrl, userToken, language }) {
  const [dailyData, setDailyData] = useState(null);
  const [trends, setTrends] = useState(null);
  const [stock, setStock] = useState([]);
  const [customerSales, setCustomerSales] = useState([]);
  const [exporting, setExporting] = useState(null); // 'pdf' or 'excel'
  const [fetchError, setFetchError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const t = translations[language || 'te'];

  // Keep a stable ref so WebSocket closures always call the latest fetchReports
  const fetchReportsRef = useRef(null);

  const fetchReports = async () => {
    setIsRefreshing(true);
    try {
      let anySuccess = false;

      const dailyRes = await fetch(`${backendUrl}/api/reports/daily?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (dailyRes.ok) {
        const dData = await dailyRes.json();
        setDailyData(dData);
        anySuccess = true;
      }

      const trendsRes = await fetch(`${backendUrl}/api/reports/trends?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (trendsRes.ok) {
        const tData = await trendsRes.json();
        if (tData && tData.weekly_revenue) {
          tData.weekly_revenue = tData.weekly_revenue.map((item, idx) => ({
            ...item,
            uniqueKey: item.date || `${item.day}-${idx}`
          }));
        }
        setTrends(tData);
        anySuccess = true;
      }

      const stockRes = await fetch(`${backendUrl}/api/stock?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (stockRes.ok) {
        const sData = await stockRes.json();
        setStock(sData);
      }

      // Fetch customer sales for Excel export
      const custRes = await fetch(`${backendUrl}/api/reports/customer-sales?_t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (custRes.ok) {
        const cData = await custRes.json();
        setCustomerSales(cData.records || []);
      }

      if (anySuccess) setFetchError(false);
    } catch (err) {
      console.error(err);
      setFetchError(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Always keep ref pointing at the latest version
  fetchReportsRef.current = fetchReports;

  useEffect(() => {
    if (!userToken) return; // wait until token is available
    fetchReportsRef.current();

    // --- Polling fallback every 60 seconds so graphs stay fresh even without WS ---
    const pollInterval = setInterval(() => {
      fetchReportsRef.current();
    }, 60000);

    const handleStorageChange = (e) => {
      if (e.key === 'ricemill_sales' || e.key === 'ricemill_tokens' || e.key === 'ricemill_stock') {
        fetchReportsRef.current();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanHost = backendUrl.replace('http://', '').replace('https://', '');
    const wsUrl = `${wsProto}//${cleanHost}/api/ws/queue`;

    let socket;
    let destroyed = false;
    function connect() {
      if (destroyed) return;
      socket = new WebSocket(wsUrl);
      socket.onmessage = (e) => {
        // Use ref so we always call the latest fetchReports, not a stale closure
        if (e.data === 'REFRESH_QUEUE' || e.data === 'REFRESH_REPORTS' || e.data === 'REFRESH_STOCK') {
          fetchReportsRef.current();
        }
      };
      socket.onclose = () => {
        if (!destroyed) setTimeout(connect, 3000);
      };
    }
    
    connect();
    return () => {
      destroyed = true;
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
      if (socket) socket.close();
    };
  }, [backendUrl, userToken]);

  const totalInventoryValue = (stock || []).reduce((sum, item) => {
    const qty = parseFloat(item.quantity_kg) || 0;
    const price = parseFloat(item.price_per_kg) || 0;
    return sum + (qty * price);
  }, 0);

  // Real client-side exports
  const triggerExport = (type) => {
    setExporting(type);
    
    if (type === 'excel') {
      try {
        // Construct CSV rows
        let csvContent = "\uFEFF"; // Add BOM for Excel UTF-8 support
        csvContent += "Sri Tirumala Rice Mill - Daily Reports & Financials\n";
        csvContent += `Report Date,${dailyData.date}\n\n`;
        
        csvContent += "--- Daily Highlights ---\n";
        csvContent += `Total Revenue (₹),${dailyData.total_revenue || 0}\n`;
        csvContent += `Tokens Served,${dailyData.tokens_served || 0}\n`;
        csvContent += `Current Stock Inventory Value (₹),${totalInventoryValue.toFixed(1)}\n`;
        csvContent += `No Shows,${dailyData.no_shows || 0}\n`;
        csvContent += `No Show Rate,${(dailyData.no_show_rate || 0).toFixed(1)}%\n\n`;
        
        csvContent += "--- Current Stock Inventory Valuation ---\n";
        csvContent += "Rice Variety,Category,Remaining Stock (kg),Bags (10kg),Price per kg (₹),Asset Value (₹)\n";
        (stock || []).forEach(item => {
          const qty = parseFloat(item.quantity_kg) || 0;
          const price = parseFloat(item.price_per_kg) || 0;
          const val = qty * price;
          csvContent += `${item.variety_name},${item.category || 'milled_rice'},${qty.toFixed(1)},${(qty / 10).toFixed(1)},${price.toFixed(2)},${val.toFixed(2)}\n`;
        });
        csvContent += "\n";
        
        csvContent += "--- Revenue Collection Split ---\n";
        csvContent += "Payment Mode,Amount (₹)\n";
        Object.entries(dailyData.payment_breakdown || {}).forEach(([mode, amt]) => {
          csvContent += `${mode},${amt || 0}\n`;
        });
        csvContent += "\n";
        
        csvContent += "--- Stock Consumption ---\n";
        csvContent += "Rice Variety,Quantity Checked-out (kg),Bags equivalent (10kg/bag)\n";
        Object.entries(dailyData.stock_consumed || {}).forEach(([variety, qty]) => {
          const qtyVal = qty || 0;
          csvContent += `${variety},${qtyVal.toFixed(1)},${(qtyVal / 10).toFixed(1)}\n`;
        });
        csvContent += "\n";

        // --- Customer Sales Table ---
        csvContent += "--- Customer Sales Register ---\n";
        csvContent += "S.No,Token No,Customer Name,Phone Number,Rice Variety,Quantity (kg),Amount (₹),Payment Mode,Time\n";
        if (customerSales.length === 0) {
          csvContent += "No sales recorded today\n";
        } else {
          customerSales.forEach(row => {
            csvContent += `${row.sno},${row.token_number},"${row.customer_name}",${row.phone_number},${row.rice_variety},${row.quantity_kg},${row.total_amount},${row.payment_mode},${row.time}\n`;
          });
          // Totals row
          const totalQty = customerSales.reduce((sum, r) => sum + r.quantity_kg, 0);
          const totalAmt = customerSales.reduce((sum, r) => sum + r.total_amount, 0);
          csvContent += `,,,,Total,${totalQty.toFixed(2)},${totalAmt.toFixed(2)},,\n`;
        }
        
        // Download logic
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Sri_Tirumala_Report_${dailyData.date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExporting(null);
      } catch (err) {
        console.error("CSV export failed", err);
        setExporting(null);
      }
    } else if (type === 'pdf') {
      try {
        // Open printable popup window
        const printWindow = window.open('', '_blank', 'width=850,height=700');
        printWindow.document.write(`
          <html>
            <head>
              <title>Sri Tirumala Rice Mill Report - ${dailyData.date}</title>
              <style>
                body {
                  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  padding: 40px;
                  color: #0f172a;
                  background-color: #ffffff;
                }
                .header-container {
                  border-bottom: 2px solid #10b981;
                  padding-bottom: 12px;
                  margin-bottom: 30px;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                h1 {
                  margin: 0;
                  color: #047857;
                  font-size: 26px;
                  font-weight: 800;
                  letter-spacing: 0.5px;
                }
                .report-date {
                  font-size: 12px;
                  color: #64748b;
                  font-weight: bold;
                  text-transform: uppercase;
                }
                .highlight-grid {
                display: grid;
                grid-template-cols: repeat(5, 1fr);
                gap: 15px;
                margin-bottom: 40px;
              }
                .highlight-card {
                  background: #f8fafc;
                  border: 1px solid #e2e8f0;
                  padding: 16px;
                  border-radius: 12px;
                }
                .card-title {
                  font-size: 10px;
                  color: #64748b;
                  text-transform: uppercase;
                  font-weight: 700;
                  letter-spacing: 0.5px;
                }
                .card-value {
                  font-size: 20px;
                  font-weight: bold;
                  margin-top: 6px;
                  color: #0f172a;
                }
                h2 {
                  font-size: 16px;
                  color: #1e293b;
                  border-bottom: 1px solid #e2e8f0;
                  padding-bottom: 6px;
                  margin-top: 30px;
                  margin-bottom: 15px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }
                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 30px;
                }
                th, td {
                  border: 1px solid #e2e8f0;
                  padding: 10px 14px;
                  text-align: left;
                  font-size: 13px;
                }
                th {
                  background: #f1f5f9;
                  color: #475569;
                  font-weight: bold;
                }
                .numeric {
                  text-align: right;
                  font-family: monospace;
                }
                .verified-total {
                  color: #047857;
                  font-weight: bold;
                }
                .footer {
                  text-align: center;
                  font-size: 10px;
                  color: #94a3b8;
                  margin-top: 80px;
                  border-t: 1px solid #e2e8f0;
                  padding-top: 15px;
                }
              </style>
            </head>
            <body>
              <div class="header-container">
                <div>
                  <h1>SRI TIRUMALA RICE MILL</h1>
                  <span style="font-size: 11px; color: #64748b; font-weight: 600;">Daily Reports & Financials Console</span>
                </div>
                <div class="report-date">Date: ${dailyData.date}</div>
              </div>
              
              <div class="highlight-grid">
                <div class="highlight-card">
                  <div class="card-title">Daily Revenue</div>
                  <div class="card-value">₹${(dailyData.total_revenue || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                </div>
                <div class="highlight-card">
                  <div class="card-title">Inventory Value</div>
                  <div class="card-value">₹${totalInventoryValue.toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
                </div>
                <div class="highlight-card">
                  <div class="card-title">Tokens Served</div>
                  <div class="card-value">${dailyData.tokens_served || 0}</div>
                </div>
                <div class="highlight-card">
                  <div class="card-title">Stock Consumption</div>
                  <div class="card-value">${Object.values(dailyData.stock_consumed || {}).reduce((a, b) => a + b, 0).toFixed(1)} kg</div>
                </div>
                <div class="highlight-card">
                  <div class="card-title">No Show Rate</div>
                  <div class="card-value">${(dailyData.no_show_rate || 0).toFixed(1)}%</div>
                </div>
              </div>
              
              <h2>Revenue Splits by Payment Mode</h2>
              <table>
                <thead>
                  <tr>
                    <th>Payment Mode</th>
                    <th class="numeric">Collected Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(dailyData.payment_breakdown || {}).map(([mode, amt]) => `
                    <tr>
                      <td><strong>${mode}</strong></td>
                      <td class="numeric ${mode === 'UPI' ? 'verified-total' : ''}">₹${(amt || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <h2>Rice Varieties Checked-out</h2>
              <table>
                <thead>
                  <tr>
                    <th>Rice Variety Name</th>
                    <th class="numeric">Weight Sold (kg)</th>
                    <th class="numeric">Bags equivalent (10kg/bag)</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(dailyData.stock_consumed || {}).map(([variety, qty]) => {
                    const qtyVal = qty || 0;
                    return `
                      <tr>
                        <td>${variety}</td>
                        <td class="numeric">${qtyVal.toFixed(1)} kg</td>
                        <td class="numeric">${(qtyVal / 10).toFixed(0)} bags</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>

              <h2>Current Stock Inventory Valuation</h2>
              <table>
                <thead>
                  <tr>
                    <th>Variety Name</th>
                    <th>Category</th>
                    <th class="numeric">Remaining Stock (kg)</th>
                    <th class="numeric">Bags</th>
                    <th class="numeric">Price per kg</th>
                    <th class="numeric">Asset Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${(stock || []).map(item => {
                    const qty = parseFloat(item.quantity_kg) || 0;
                    const price = parseFloat(item.price_per_kg) || 0;
                    const assetVal = qty * price;
                    return `
                      <tr>
                        <td>${item.variety_name}</td>
                        <td>${(item.category || 'milled_rice').replace('_', ' ').toUpperCase()}</td>
                        <td class="numeric">${qty.toFixed(1)} kg</td>
                        <td class="numeric">${(qty / 10).toFixed(1)}</td>
                        <td class="numeric">₹${price.toFixed(2)}</td>
                        <td class="numeric">₹${assetVal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>

              <div class="footer">
                Sri Tirumala Rice Mill Operations Management Console • Report Generated: ${new Date().toLocaleString('en-IN')}
              </div>
              
              <script>
                window.onload = function() {
                  window.print();
                  setTimeout(function() { window.close(); }, 500);
                }
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
        setExporting(null);
      } catch (err) {
        console.error("PDF printing failed", err);
        setExporting(null);
      }
    }
  };

  if (!dailyData || !trends) {
    return (
      <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
        {fetchError ? (
          <>
            <span className="text-rose-400 font-bold text-sm">⚠️ {language === 'te' ? 'డేటా లోడ్ కాలేదు' : 'Failed to load data'}</span>
            <span className="text-slate-500">{language === 'te' ? 'బ్యాకెండ్ వేక్ అప్ అవుతోంది, దయచేసి వేచి ఉండండి...' : 'Backend may be waking up (Render cold start). Please wait...'}</span>
            <button
              onClick={() => fetchReportsRef.current()}
              className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              🔄 {language === 'te' ? 'మళ్లీ ప్రయత్నించు' : 'Retry'}
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
            <span>{language === 'te' ? 'ఆర్థిక నివేదికలను లోడ్ చేస్తోంది...' : 'Loading financial analytics...'}</span>
          </>
        )}
      </div>
    );
  }

  // Curated color palette
  const COLORS = ['#10b981', '#f59e0b', '#3b82f6'];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 backdrop-blur-md p-5 rounded-3xl border border-slate-800/80 shadow-lg relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
        <div>
          <h2 className="text-xl font-bold text-slate-100">{t.financialReports}</h2>
          <p className="text-xs text-slate-400">{t.reportsDesc}</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => fetchReportsRef.current()}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-slate-355 hover:text-emerald-400 py-3 px-3 h-11 rounded-xl text-xs font-bold border border-slate-800 transition-all cursor-pointer"
            title="Refresh data"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <button
            onClick={() => triggerExport('excel')}
            disabled={exporting !== null}
            className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-slate-355 hover:text-slate-200 py-3 px-4 h-11 rounded-xl text-xs font-bold border border-slate-800 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            {exporting === 'excel' ? (language === 'te' ? 'ఎగుమతి అవుతోంది...' : 'Exporting...') : (language === 'te' ? 'Excel ఎగుమతి' : 'Export Excel')}
          </button>
          <button
            onClick={() => triggerExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 disabled:opacity-50 text-white py-3 px-4 h-11 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {exporting === 'pdf' ? (language === 'te' ? 'PDF సృష్టిస్తోంది...' : 'Generating PDF...') : t.exportPdf}
          </button>
        </div>
      </div>

      {/* Daily Highlights Summary Box */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Rev - Today only */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{t.totalRevenue}</span>
              <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-bold uppercase">{language === 'te' ? 'ఈరోజు' : 'Today'}</span>
            </div>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">₹{dailyData.total_revenue.toLocaleString('en-IN')}</h3>
            <span className="text-[9px] text-slate-500 font-bold flex items-center gap-0.5">
              {dailyData.date}
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/10">
            <IndianRupee className="w-6 h-6 text-emerald-400 stroke-1" />
          </div>
        </div>

        {/* Inventory Value */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">
              {language === 'te' ? 'ఇన్వెంటరీ విలువ' : 'Inventory Value'}
            </span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">₹{totalInventoryValue.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</h3>
            <span className="text-[9px] text-amber-400 font-bold flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> {language === 'te' ? 'నిల్వ ఆస్తుల విలువ' : 'Current asset value'}
            </span>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/10">
            <IndianRupee className="w-6 h-6 text-amber-400 stroke-1" />
          </div>
        </div>

        {/* Tokens served */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">{t.tokensServed}</span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">{dailyData.tokens_served || 0}</h3>
            <span className="text-[9px] text-slate-450 font-semibold">{language === 'te' ? 'కీప్యాడ్ / ఉచిత ఫోన్ కనెక్షన్లు' : '100% feature-phone queries'}</span>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/10">
            <Users className="w-6 h-6 text-blue-400 stroke-1" />
          </div>
        </div>

        {/* Avg Service Time */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">{t.avgServiceTime}</span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">
              {dailyData.avg_service_time !== undefined ? dailyData.avg_service_time : 8.0} {language === 'te' ? 'నిమి' : 'mins'}
            </h3>
            <span className="text-[9px] text-emerald-400 font-semibold">
              {language === 'te' ? 'సగటు చెక్అవుట్ సమయం' : 'Per checkout processing'}
            </span>
          </div>
          <div className="p-3 bg-teal-500/10 rounded-xl border border-teal-500/10">
            <Clock className="w-6 h-6 text-teal-400 stroke-1" />
          </div>
        </div>

        {/* Stock Consumed */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">{t.stockConsumed}</span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">
              {Object.values(dailyData.stock_consumed || {}).reduce((a, b) => a + b, 0).toFixed(0)} kg
            </h3>
            <span className="text-[9px] text-slate-450 font-semibold font-mono">
              ~{(Object.values(dailyData.stock_consumed || {}).reduce((a, b) => a + b, 0) / 10).toFixed(0)} {language === 'te' ? 'సంచులు చెక్అవుట్' : 'bags checkout'}
            </span>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/10">
            <ShoppingBag className="w-6 h-6 text-amber-400 stroke-1" />
          </div>
        </div>

        {/* No shows rate */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-505 uppercase tracking-widest font-bold block">{t.noShow}</span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">{dailyData.no_shows || 0}</h3>
            <span className="text-[9px] text-emerald-450 font-bold">
              {t.noShow}: {(dailyData.no_show_rate || 0).toFixed(1)}% ({language === 'te' ? 'గమ్యం < 5%' : 'Target < 5%'})
            </span>
          </div>
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-850">
            <TrendingUp className="w-6 h-6 text-slate-450 stroke-1" />
          </div>
        </div>
      </div>

      {/* Main Charts & Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Weekly Revenue Bar Chart */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">{t.weeklyRevenueTrend}</h3>
              <p className="text-[10px] text-slate-500 font-mono">{language === 'te' ? 'గత 7 పని దినాలలో మిల్ అమ్మకాల సారాంశం' : 'Overview of mill checkouts over the last 7 active days'}</p>
            </div>
            <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-500 px-2 py-1 rounded-lg font-mono">
              {trends.weekly_revenue.length} {language === 'te' ? 'రోజులు' : 'days'}
            </span>
          </div>
          
          <div className="overflow-x-auto w-full">
            <div className="h-64 min-w-[600px] md:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.weekly_revenue} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#047857" stopOpacity={0.25}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis 
                    dataKey="uniqueKey" 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    tickFormatter={(value) => {
                      const item = trends.weekly_revenue.find(d => d.uniqueKey === value);
                      return item ? item.day : value;
                    }}
                  />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#10b981', fontSize: '11px' }}
                    cursor={{ fill: 'rgba(16, 185, 129, 0.05)', radius: 6 }}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0] && payload[0].payload) {
                        const dateStr = payload[0].payload.date;
                        if (dateStr) {
                          const d = new Date(dateStr);
                          return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
                        }
                        return payload[0].payload.day;
                      }
                      return label;
                    }}
                    formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, language === 'te' ? 'రాబడి' : 'Revenue']}
                  />
                  <Bar 
                    dataKey="revenue" 
                    name={language === 'te' ? 'రాబడి (₹)' : 'Revenue (₹)'} 
                    fill="url(#colorRevBar)" 
                    radius={[6, 6, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Variety Sales Breakdown Pie Chart */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 flex flex-col justify-between relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">{t.paymentBreakdown}</h3>
            <p className="text-[10px] text-slate-500 font-mono">{language === 'te' ? 'ఈరోజు రకాల వారీగా బియ్యం అమ్మకాల విభజన' : "Today's rice weight checkout splits"}</p>
          </div>
          
          <div className="h-40 flex items-center justify-center">
            {trends.varieties_split.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={trends.varieties_split}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {trends.varieties_split.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#f8fafc', fontSize: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span className="text-xs text-slate-550">No variety splits recorded.</span>
            )}
          </div>

          {/* Legends */}
          <div className="space-y-2 border-t border-slate-850 pt-3">
            {trends.varieties_split.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-slate-450">{item.name}</span>
                </div>
                <span className="font-bold text-slate-250 font-mono">{item.value} kg</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Peak Hours Analysis */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">{t.peakHoursDistribution}</h3>
            <p className="text-[10px] text-slate-500 font-mono">{language === 'te' ? 'సిబ్బంది డ్యూటీని సరిచేయడానికి మిల్లు బిజీగా ఉండే సమయాల విశ్లేషణ' : 'Analyzes busiest times of the day to optimize staff allocation'}</p>
          </div>
          
          <div className="overflow-x-auto w-full">
            <div className="h-56 min-w-[600px] md:min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.peak_hours} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="hour" stroke="#475569" fontSize={9} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#f59e0b', fontSize: '11px' }}
                  />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name={language === 'te' ? 'లావాదేవీలు' : 'Checkouts'} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Payment Mode Splits */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">{language === 'te' ? 'చెల్లింపుల విభజన' : 'Payment Breakdown'}</h3>
            <p className="text-[10px] text-slate-500 font-mono">{language === 'te' ? 'ఈరోజు నగదు రాబడి పద్ధతుల నివేదిక' : "Today's financial collection modes"}</p>
          </div>
          
          <div className="space-y-4 pt-2">
            {Object.entries(dailyData.payment_breakdown || {}).map(([mode, amt]) => {
              const total = dailyData.total_revenue || 1;
              const percentage = (((amt || 0) / total) * 100).toFixed(0);
              return (
                <div key={mode} className="space-y-1.5 animate-slide-in">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">{mode === 'Cash' ? t.cash : mode === 'UPI' ? t.upi : mode === 'Card' ? t.card : t.credit}</span>
                    <span className="font-bold text-slate-200 font-mono">₹{(amt || 0).toLocaleString('en-IN')} ({percentage}%)</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900">
                    <div 
                      className={`h-full rounded-full ${
                        mode === 'UPI' ? 'bg-emerald-500' :
                        mode === 'Cash' ? 'bg-amber-500' :
                        mode === 'Card' ? 'bg-teal-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Stock Inventory Valuation Table */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
            {language === 'te' ? 'ప్రస్తుత నిల్వ ఆస్తుల విలువ' : 'Current Stock Inventory Valuation'}
          </h3>
          <p className="text-[10px] text-slate-500 font-mono">
            {language === 'te' ? 'మిగిలిన నిల్వ పరిమాణము, ధరలు మరియు ఆస్తి విలువ నివేదిక' : 'Live remaining quantities, prices, and asset valuations in real time'}
          </p>
        </div>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto pt-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-850 text-[10px] uppercase font-bold text-slate-500">
                <th className="py-3 px-3">Variety Name</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3 text-right">Remaining Stock</th>
                <th className="py-3 px-3 text-right">Bags (10kg)</th>
                <th className="py-3 px-3 text-right">Price per kg</th>
                <th className="py-3 px-3 text-right">Asset Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300">
              {(stock || []).map((item) => {
                const qty = parseFloat(item.quantity_kg) || 0;
                const price = parseFloat(item.price_per_kg) || 0;
                const val = qty * price;
                return (
                  <tr key={item.id} className="hover:bg-slate-900/10 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-200">{item.variety_name}</td>
                    <td className="py-3 px-3 text-slate-500 text-[10px] uppercase">{item.category ? item.category.replace('_', ' ') : 'Milled Rice'}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">{qty.toFixed(1)} kg</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-505">{(qty / 10).toFixed(1)}</td>
                    <td className="py-3 px-3 text-right font-mono">₹{price.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-450">₹{val.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
                  </tr>
                );
              })}
              {(!stock || stock.length === 0) && (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-slate-505">No stock inventory data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="grid grid-cols-1 gap-4 md:hidden pt-2">
          {(stock || []).map((item) => {
            const qty = parseFloat(item.quantity_kg) || 0;
            const price = parseFloat(item.price_per_kg) || 0;
            const val = qty * price;
            return (
              <div key={item.id} className="bg-slate-950/60 p-4 rounded-2xl border border-slate-900 space-y-3 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500/20" />
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-sm text-slate-205">{item.variety_name}</h4>
                    <span className="text-[9px] text-slate-500 uppercase">{item.category ? item.category.replace('_', ' ') : 'Milled Rice'}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] text-slate-505 block uppercase tracking-wider font-bold">Asset Value</span>
                    <span className="font-mono font-bold text-emerald-450 text-xs">₹{val.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-[10px] pt-2 border-t border-slate-900/60">
                  <div>
                    <span className="text-slate-505 block font-bold uppercase tracking-wider text-[8px]">Stock</span>
                    <span className="font-mono font-bold text-slate-300">{qty.toFixed(1)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-505 block font-bold uppercase tracking-wider text-[8px]">Bags (10kg)</span>
                    <span className="font-mono text-slate-450">{(qty / 10).toFixed(1)}</span>
                  </div>
                  <div>
                    <span className="text-slate-505 block font-bold uppercase tracking-wider text-[8px]">Price/kg</span>
                    <span className="font-mono text-slate-350">₹{price.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {(!stock || stock.length === 0) && (
            <div className="py-6 text-center text-slate-550 text-xs">No stock inventory data available</div>
          )}
        </div>
      </div>
    </div>
  );
}
