import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { Calendar, IndianRupee, Users, ShoppingBag, Download, ArrowUpRight, TrendingUp } from 'lucide-react';
import { translations } from '../utils/translations';

export default function Reports({ backendUrl, userToken, language }) {
  const [dailyData, setDailyData] = useState(null);
  const [trends, setTrends] = useState(null);
  const [exporting, setExporting] = useState(null); // 'pdf' or 'excel'

  const t = translations[language || 'te'];

  const fetchReports = async () => {
    try {
      const dailyRes = await fetch(`${backendUrl}/api/reports/daily`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (dailyRes.ok) {
        const dData = await dailyRes.json();
        setDailyData(dData);
      }

      const trendsRes = await fetch(`${backendUrl}/api/reports/trends`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (trendsRes.ok) {
        const tData = await trendsRes.json();
        setTrends(tData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReports();

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cleanHost = backendUrl.replace('http://', '').replace('https://', '');
    const wsUrl = `${wsProto}//${cleanHost}/api/ws/queue`;

    let socket;
    function connect() {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (e) => {
        if (e.data === 'REFRESH_QUEUE' || e.data === 'REFRESH_REPORTS') {
          fetchReports();
        }
      };
      socket.onclose = () => setTimeout(connect, 3000);
    }
    
    connect();
    return () => {
      if (socket) socket.close();
    };
  }, [backendUrl]);

  // Real client-side exports
  const triggerExport = (type) => {
    setExporting(type);
    
    if (type === 'excel') {
      try {
        // Construct CSV rows
        let csvContent = "\uFEFF"; // Add BOM for Excel UTF-8 support
        csvContent += "Sri Trimula Rice Mill - Daily Reports & Financials\n";
        csvContent += `Report Date,${dailyData.date}\n\n`;
        
        csvContent += "--- Daily Highlights ---\n";
        csvContent += `Total Revenue (₹),${dailyData.total_revenue || 0}\n`;
        csvContent += `Tokens Served,${dailyData.tokens_served || 0}\n`;
        csvContent += `No Shows,${dailyData.no_shows || 0}\n`;
        csvContent += `No Show Rate,${(dailyData.no_show_rate || 0).toFixed(1)}%\n\n`;
        
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
        
        // Download logic
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Sri_Trimula_Report_${dailyData.date}.csv`);
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
              <title>Sri Trimula Rice Mill Report - ${dailyData.date}</title>
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
                  grid-template-cols: repeat(4, 1fr);
                  gap: 20px;
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
                  <h1>SRI TRIMULA RICE MILL</h1>
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

              <div class="footer">
                Sri Trimula Rice Mill Operations Management Console • Report Generated: ${new Date().toLocaleString('en-IN')}
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
        <div className="w-8 h-8 border-2 border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
        <span>{language === 'te' ? 'ఆర్థిక నివేదికలను లోడ్ చేస్తోంది...' : 'Loading financial analytics...'}</span>
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
            onClick={() => triggerExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-slate-350 hover:text-slate-200 py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-800 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            {exporting === 'excel' ? (language === 'te' ? 'ఎగుమతి అవుతోంది...' : 'Exporting...') : (language === 'te' ? 'Excel ఎగుమతి' : 'Export Excel')}
          </button>
          <button
            onClick={() => triggerExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-550 disabled:opacity-50 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {exporting === 'pdf' ? (language === 'te' ? 'PDF సృష్టిస్తోంది...' : 'Generating PDF...') : t.exportPdf}
          </button>
        </div>
      </div>

      {/* Daily Highlights Summary Box */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Rev */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">{t.totalRevenue}</span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">₹{dailyData.total_revenue.toLocaleString('en-IN')}</h3>
            <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> +12.4% {language === 'te' ? 'గత వారం కంటే ఎక్కువ' : 'vs last week'}
            </span>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/10">
            <IndianRupee className="w-6 h-6 text-emerald-400 stroke-1" />
          </div>
        </div>

        {/* Tokens served */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/85 shadow-lg flex items-center justify-between hover-scale">
          <div className="space-y-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block">{t.tokensServed}</span>
            <h3 className="text-2xl font-extrabold text-slate-100 font-mono">{dailyData.tokens_served || 0}</h3>
            <span className="text-[9px] text-slate-450 font-semibold">{language === 'te' ? 'కీప్యాడ్ / ఉచిత ఫోన్ ద్వారా కనెక్షన్లు' : '100% feature-phone queries'}</span>
          </div>
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/10">
            <Users className="w-6 h-6 text-blue-400 stroke-1" />
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
              ~{(Object.values(dailyData.stock_consumed || {}).reduce((a, b) => a + b, 0) / 10).toFixed(0)} {language === 'te' ? 'సంచులు సర్వ్ చేయబడ్డాయి' : 'bags checkout'}
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
        
        {/* Weekly Revenue Line Chart */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-xl space-y-4 relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">{t.weeklyRevenueTrend}</h3>
            <p className="text-[10px] text-slate-500 font-mono">{language === 'te' ? 'గత 7 పని దినాలలో మిల్ అమ్మకాల సారాంశం' : 'Overview of mill checkouts over the last 7 active days'}</p>
          </div>
          
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends.weekly_revenue} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.95}/>
                    <stop offset="100%" stopColor="#047857" stopOpacity={0.25}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                <XAxis dataKey="day" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#1e293b', borderRadius: '12px' }}
                  labelStyle={{ color: '#64748b', fontSize: '10px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#10b981', fontSize: '11px' }}
                  cursor={{ fill: 'rgba(16, 185, 129, 0.05)', radius: 6 }}
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
          
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends.peak_hours} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
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
                    <span className="text-slate-400 font-semibold">{mode === 'Cash' ? t.cash : mode === 'UPI' ? t.upi : t.credit}</span>
                    <span className="font-bold text-slate-200 font-mono">₹{(amt || 0).toLocaleString('en-IN')} ({percentage}%)</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-900">
                    <div 
                      className={`h-full rounded-full ${
                        mode === 'UPI' ? 'bg-emerald-500' :
                        mode === 'Cash' ? 'bg-amber-500' : 'bg-blue-500'
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
    </div>
  );
}
