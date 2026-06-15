// Centralized Cloud JSON Storage Mock API for Smart Rice Mill System
import { 
  getDbState, 
  updateSettings, 
  updateStock, 
  updateTokens, 
  updateSales, 
  updatePriceHistory, 
  updateSmsInbox, 
  updateLockedAccounts 
} from './firebaseService.js';

const MOCK_SOCKETS = new Set();

// WebSocket broadcaster to sync frontend views in real-time
const broadcastMockWs = (message) => {
  for (const ws of MOCK_SOCKETS) {
    try {
      if (ws.onmessage) {
        ws.onmessage({ data: message });
      }
    } catch (err) {
      console.error("Mock WebSocket broadcast fail:", err);
    }
  }
};

// Mock WebSocket implementation
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
    MOCK_SOCKETS.add(this);

    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 50);
  }

  send(data) {
    console.log("Mock WebSocket sent:", data);
  }

  close() {
    MOCK_SOCKETS.delete(this);
    setTimeout(() => {
      if (this.onclose) this.onclose();
    }, 50);
  }
}

// Global fetch interceptor routing matching API routes locally
const setupMockApi = () => {
  // Bind broadcaster to window so firebaseService can call it
  window.broadcastMockWs = broadcastMockWs;

  // Override WebSocket globally
  window.WebSocket = MockWebSocket;

  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input.url;
    
    // Only intercept local API calls matching our backend port or relative paths
    const isLocalApi = urlStr.startsWith('/api/') || 
                       urlStr.startsWith(window.location.origin + '/api/') ||
                       urlStr.startsWith('http://127.0.0.1:8000/api/') ||
                       urlStr.startsWith('http://localhost:8000/api/') ||
                       (urlStr.includes('/api/') && !urlStr.includes('extendsclass.com'));

    if (!isLocalApi) {
      return originalFetch(input, init);
    }

    const urlObj = new URL(urlStr);
    const path = urlObj.pathname;
    const method = (init && init.method || 'GET').toUpperCase();
    
    console.log(`[Mock API Intercept] ${method} ${path}`);

    // Read directly from firebaseService in-memory state
    const getDB = (key, fallback = []) => {
      const dbState = getDbState();
      switch (key) {
        case 'ricemill_settings': return dbState.settings || fallback;
        case 'ricemill_stock': return dbState.stock || fallback;
        case 'ricemill_tokens': return dbState.tokens || fallback;
        case 'ricemill_sales': return dbState.sales || fallback;
        case 'ricemill_price_history': return dbState.price_history || fallback;
        case 'ricemill_sms_inbox': return dbState.sms_inbox || fallback;
        case 'ricemill_locked_accounts': return dbState.locked_accounts || fallback;
        default: return fallback;
      }
    };

    // Write directly to firebaseService mutators
    const setDB = (key, data) => {
      switch (key) {
        case 'ricemill_settings':
          updateSettings(data);
          break;
        case 'ricemill_stock':
          updateStock(data);
          break;
        case 'ricemill_tokens':
          updateTokens(data);
          break;
        case 'ricemill_sales':
          updateSales(data);
          break;
        case 'ricemill_price_history':
          updatePriceHistory(data);
          break;
        case 'ricemill_sms_inbox':
          updateSmsInbox(data);
          break;
        case 'ricemill_locked_accounts':
          updateLockedAccounts(data);
          break;
      }
    };

    const makeResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    try {
      // 1. Auth Endpoint (Only Admin Console login allowed)
      if (path === '/api/auth/login') {
        const body = JSON.parse(init.body);
        const username = body.username ? body.username.trim().toLowerCase() : '';
        const password = body.password ? body.password.trim() : '';
        
        if (password === 'Shanmukha29*') {
          if (username === 'owner' || username === 'shanmukha') {
            return makeResponse({
              access_token: 'mock_jwt_token_for_owner',
              token_type: 'bearer',
              role: 'owner',
              full_name: 'Shanmukha'
            });
          }
        }
        return makeResponse({ detail: 'Invalid username or password' }, 401);
      }

      // 2. Settings Endpoints
      if (path === '/api/settings') {
        const defaultSettings = getDbState().settings;
        if (method === 'GET') {
          return makeResponse(getDB('ricemill_settings', defaultSettings));
        }
        if (method === 'PUT') {
          const body = JSON.parse(init.body);
          setDB('ricemill_settings', body);
          broadcastMockWs('REFRESH_QUEUE');
          return makeResponse(body);
        }
      }

      // 3. User Security Endpoint
      if (path === '/api/users/security') {
        return makeResponse([
          { username: 'Shanmukha', full_name: 'Shanmukha', role: 'owner', is_locked: false, failed_attempts: 0 }
        ]);
      }

      // 4. Stock Endpoints
      if (path === '/api/stock') {
        if (method === 'GET') {
          const stock = getDB('ricemill_stock');
          const stockWithBags = stock.map(s => {
            const quantity = typeof s.quantity_kg === 'number' ? s.quantity_kg : parseFloat(s.quantity_kg) || 0;
            const price = typeof s.price_per_kg === 'number' ? s.price_per_kg : parseFloat(s.price_per_kg) || 0;
            const threshold = typeof s.low_stock_threshold === 'number' ? s.low_stock_threshold : parseFloat(s.low_stock_threshold) || 0;
            return {
              ...s,
              quantity_kg: quantity,
              price_per_kg: price,
              low_stock_threshold: threshold,
              bags_count: quantity / 10.0,
              created_at: s.created_at || new Date().toISOString(),
              updated_at: s.updated_at || new Date().toISOString()
            };
          });
          return makeResponse(stockWithBags);
        }

        if (method === 'POST') {
          const body = JSON.parse(init.body);
          const stock = getDB('ricemill_stock');
          const newVariety = {
            id: stock.length + 1,
            variety_name: body.variety_name || 'New Variety',
            quantity_kg: parseFloat(body.quantity_kg) || 0,
            price_per_kg: parseFloat(body.price_per_kg) || 0,
            low_stock_threshold: parseFloat(body.low_stock_threshold) || 50,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          stock.push(newVariety);
          setDB('ricemill_stock', stock);
          broadcastMockWs('REFRESH_QUEUE');
          return makeResponse(newVariety);
        }
      }

      if (path.startsWith('/api/stock/')) {
        const parts = path.split('/');
        
        // POST /api/stock/bulk-import
        if (parts[3] === 'bulk-import') {
          const body = JSON.parse(init.body);
          const stock = getDB('ricemill_stock');
          body.forEach(importItem => {
            const match = stock.find(s => s.variety_name.toLowerCase() === importItem.variety_name.toLowerCase());
            if (match) {
              match.quantity_kg += importItem.quantity_kg;
              if (importItem.price_per_kg) match.price_per_kg = importItem.price_per_kg;
            } else {
              stock.push({
                id: stock.length + 1,
                variety_name: importItem.variety_name,
                quantity_kg: importItem.quantity_kg,
                price_per_kg: importItem.price_per_kg || 60,
                low_stock_threshold: 50
              });
            }
          });
          setDB('ricemill_stock', stock);
          broadcastMockWs('REFRESH_QUEUE');
          return makeResponse({ message: 'Stock imported successfully' });
        }

        // GET /api/stock/price-history
        if (parts[3] === 'price-history') {
          return makeResponse(getDB('ricemill_price_history'));
        }

        // PUT /api/stock/{id}
        const stockId = parseInt(parts[3]);
        if (stockId && method === 'PUT') {
          const body = JSON.parse(init.body);
          const stock = getDB('ricemill_stock');
          const idx = stock.findIndex(s => s.id === stockId);
          if (idx !== -1) {
            const oldPrice = typeof stock[idx].price_per_kg === 'number' ? stock[idx].price_per_kg : parseFloat(stock[idx].price_per_kg) || 0;
            const newPrice = typeof body.price_per_kg === 'number' ? body.price_per_kg : parseFloat(body.price_per_kg) || 0;
            const newQty = typeof body.quantity_kg === 'number' ? body.quantity_kg : parseFloat(body.quantity_kg) || 0;
            const newThreshold = typeof body.low_stock_threshold === 'number' ? body.low_stock_threshold : parseFloat(body.low_stock_threshold) || 0;

            stock[idx] = { 
              ...stock[idx], 
              ...body,
              quantity_kg: newQty,
              price_per_kg: newPrice,
              low_stock_threshold: newThreshold
            };
            setDB('ricemill_stock', stock);

            // Log price history changes
            if (oldPrice !== newPrice) {
              const history = getDB('ricemill_price_history');
              history.unshift({
                id: history.length + 1,
                variety_name: stock[idx].variety_name,
                old_price: oldPrice,
                new_price: newPrice,
                changed_by: 'Shanmukha',
                changed_at: new Date().toISOString()
              });
              setDB('ricemill_price_history', history);
            }

            // Alert low stock
            if (newQty <= newThreshold) {
              const smsInbox = getDB('ricemill_sms_inbox');
              smsInbox.unshift({
                phone_number: '+919999999999',
                message: `⚠️ Sri Trimula Mill Stock Alert: ${stock[idx].variety_name} low: ${newQty} kg (Threshold: ${newThreshold} kg). Reorder: 500 kg.`,
                timestamp: new Date().toLocaleTimeString(),
                provider: 'SIMULATOR'
              });
              setDB('ricemill_sms_inbox', smsInbox);
              broadcastMockWs('NEW_SMS_MOCKED');
            }

            const responseItem = {
              ...stock[idx],
              bags_count: newQty / 10.0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            broadcastMockWs('REFRESH_QUEUE');
            return makeResponse(responseItem);
          }
          return makeResponse({ detail: 'Stock item not found' }, 404);
        }
      }

      // 5. Token Endpoints
      if (path === '/api/tokens') {
        if (method === 'GET') {
          return makeResponse(getDB('ricemill_tokens'));
        }
        if (method === 'POST') {
          const body = JSON.parse(init.body);
          const tokens = getDB('ricemill_tokens');
          const settings = getDB('ricemill_settings');

          if (settings && settings.holiday_mode) {
            return makeResponse({ detail: 'Holiday mode active' }, 400);
          }

          const tokenNum = `T-${String(tokens.length + 1).padStart(3, '0')}`;
          const ahead = tokens.filter(t => t.status === 'waiting').length;
          const waitTime = (ahead + 1) * (settings ? settings.avg_service_time : 8);

          const newToken = {
            id: tokens.length + 1,
            token_number: tokenNum,
            phone_number: body.phone_number || '+910000000000',
            customer_name: body.customer_name || `Customer #${tokens.length + 1}`,
            status: 'waiting',
            priority: body.priority || false,
            priority_reason: body.priority_reason || null,
            wait_time_minutes: waitTime,
            created_at: new Date().toISOString(),
            called_at: null,
            no_show_at: null,
            counter_assigned: null
          };

          tokens.push(newToken);
          setDB('ricemill_tokens', tokens);

          const smsInbox = getDB('ricemill_sms_inbox');
          const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
          smsInbox.unshift({
            phone_number: newToken.phone_number,
            message: `నమస్కారం! మీ టోకెన్ ${tokenNum}.\n${ahead} మంది ముందున్నారు. సమయం ~${waitTime} ని. - ${millName}\n\nHello! Token ${tokenNum}.\n${ahead} ahead. Wait ~${waitTime} mins. - ${millName}`,
            timestamp: new Date().toLocaleTimeString(),
            provider: 'SIMULATOR'
          });
          setDB('ricemill_sms_inbox', smsInbox);

          broadcastMockWs('REFRESH_QUEUE');
          broadcastMockWs('NEW_SMS_MOCKED');
          return makeResponse(newToken);
        }
      }

      if (path === '/api/tokens/call-next') {
        if (method === 'POST') {
          const body = JSON.parse(init.body);
          const counter = body.counter || 'Counter 1';
          const tokens = getDB('ricemill_tokens');
          
          tokens.forEach(t => {
            if (t.status === 'active' && t.counter_assigned === counter) {
              t.status = 'no_show';
              t.no_show_at = new Date().toISOString();
            }
          });

          const nextIndex = tokens.findIndex(t => t.status === 'waiting');
          if (nextIndex !== -1) {
            tokens[nextIndex].status = 'active';
            tokens[nextIndex].counter_assigned = counter;
            tokens[nextIndex].called_at = new Date().toISOString();
            setDB('ricemill_tokens', tokens);

            const settings = getDB('ricemill_settings');
            const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
            const smsInbox = getDB('ricemill_sms_inbox');
            smsInbox.unshift({
              phone_number: tokens[nextIndex].phone_number,
              message: `టోకెన్ ${tokens[nextIndex].token_number} యాక్టివ్ అయింది! దయచేసి వెంటనే ${counter} కి వెళ్ళండి.\n\nToken ${tokens[nextIndex].token_number} is NOW ACTIVE! Proceed to ${counter} immediately. - ${millName}`,
              timestamp: new Date().toLocaleTimeString(),
              provider: 'SIMULATOR'
            });

            const waitIdx = tokens.findIndex((t, i) => t.status === 'waiting' && i > nextIndex);
            if (waitIdx !== -1) {
              smsInbox.unshift({
                phone_number: tokens[waitIdx].phone_number,
                message: `మీ టోకెన్ ${tokens[waitIdx].token_number} కౌంటర్ కి దగ్గరగా ఉంది. 2 మంది ముందున్నారు (~10 ని). సిద్ధంగా ఉండండి.\n\nToken ${tokens[waitIdx].token_number} is close. 2 people ahead (~10 mins). Please get ready. - ${millName}`,
                timestamp: new Date().toLocaleTimeString(),
                provider: 'SIMULATOR'
              });
            }
            setDB('ricemill_sms_inbox', smsInbox);

            broadcastMockWs('REFRESH_QUEUE');
            broadcastMockWs('NEW_SMS_MOCKED');
            return makeResponse(tokens[nextIndex]);
          }
          return makeResponse({ detail: 'No waiting customers.' }, 404);
        }
      }

      if (path.startsWith('/api/tokens/')) {
        const parts = path.split('/');
        const tokenId = parseInt(parts[3]);
        const action = parts[4];

        const tokens = getDB('ricemill_tokens');
        const tokenIdx = tokens.findIndex(t => t.id === tokenId);

        if (tokenIdx !== -1) {
          if (action === 'serve' && method === 'POST') {
            const body = JSON.parse(init.body);
            const stock = getDB('ricemill_stock');
            const itemIdx = stock.findIndex(s => s.variety_name === body.variety_name);
            
            const reqQty = parseFloat(body.quantity_kg) || 0;
            let reqPrice = parseFloat(body.price_per_kg) || 0;
            if (!reqPrice && itemIdx !== -1) {
              reqPrice = parseFloat(stock[itemIdx].price_per_kg) || 0;
            }
            let reqTotal = parseFloat(body.total_price) || 0;
            if (!reqTotal) {
              reqTotal = reqQty * reqPrice;
            }

            if (itemIdx !== -1) {
              const currentStockQty = parseFloat(stock[itemIdx].quantity_kg) || 0;
              if (currentStockQty < reqQty) {
                return makeResponse({ detail: 'Insufficient stock!' }, 400);
              }
              stock[itemIdx].quantity_kg = currentStockQty - reqQty;
              setDB('ricemill_stock', stock);
            }

            tokens[tokenIdx].status = 'served';
            setDB('ricemill_tokens', tokens);

            const sales = getDB('ricemill_sales');
            const newSale = {
              id: sales.length + 1,
              token_number: tokens[tokenIdx].token_number,
              customer_name: tokens[tokenIdx].customer_name || 'Customer',
              variety_name: body.variety_name,
              quantity_kg: reqQty,
              price_per_kg: reqPrice,
              total_price: reqTotal,
              payment_mode: body.payment_mode,
              service_time_seconds: Math.floor(Math.random() * 200) + 150,
              created_at: new Date().toISOString()
            };
            sales.push(newSale);
            setDB('ricemill_sales', sales);

            const settings = getDB('ricemill_settings');
            const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
            const smsInbox = getDB('ricemill_sms_inbox');
            smsInbox.unshift({
              phone_number: tokens[tokenIdx].phone_number,
              message: `టోకెన్ ${tokens[tokenIdx].token_number} పూర్తయింది. ధన్యవాదాలు! మొత్తం బిల్లు: ₹${reqTotal.toFixed(2)}.\n\nToken ${tokens[tokenIdx].token_number} served. Thank you! Total: ₹${reqTotal.toFixed(2)}. - ${millName}`,
              timestamp: new Date().toLocaleTimeString(),
              provider: 'SIMULATOR'
            });
            setDB('ricemill_sms_inbox', smsInbox);

            broadcastMockWs('REFRESH_QUEUE');
            broadcastMockWs('NEW_SMS_MOCKED');
            return makeResponse(newSale);
          }

          if (action === 'no-show' && method === 'POST') {
            tokens[tokenIdx].status = 'no_show';
            tokens[tokenIdx].no_show_at = new Date().toISOString();
            setDB('ricemill_tokens', tokens);

            const settings = getDB('ricemill_settings');
            const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
            const smsInbox = getDB('ricemill_sms_inbox');
            smsInbox.unshift({
              phone_number: tokens[tokenIdx].phone_number,
              message: `టోకెన్ ${tokens[tokenIdx].token_number}: హాజరు కాలేదు. మీ టోకెన్ రద్దు చేయబడింది.\n\nToken ${tokens[tokenIdx].token_number}: No-show recorded. Token expired. - ${millName}`,
              timestamp: new Date().toLocaleTimeString(),
              provider: 'SIMULATOR'
            });
            setDB('ricemill_sms_inbox', smsInbox);

            broadcastMockWs('REFRESH_QUEUE');
            broadcastMockWs('NEW_SMS_MOCKED');
            return makeResponse(tokens[tokenIdx]);
          }

          if (action === 'reactivate' && method === 'POST') {
            const elapsed = (new Date() - new Date(tokens[tokenIdx].no_show_at)) / 60000;
            if (elapsed > 10) {
              return makeResponse({ detail: 'Reactivation window closed (>10 minutes elapsed).' }, 400);
            }
            tokens[tokenIdx].status = 'waiting';
            tokens[tokenIdx].no_show_at = null;
            setDB('ricemill_tokens', tokens);

            broadcastMockWs('REFRESH_QUEUE');
            return makeResponse(tokens[tokenIdx]);
          }
        }
        return makeResponse({ detail: 'Token not found' }, 404);
      }

      // 6. Reports Endpoints
      if (path === '/api/reports/daily') {
        const sales = getDB('ricemill_sales');
        const tokens = getDB('ricemill_tokens');
        const todayStr = new Date().toDateString();

        const todayTokens = tokens.filter(t => new Date(t.created_at || new Date()).toDateString() === todayStr);
        const todaySales = sales.filter(s => new Date(s.created_at || new Date()).toDateString() === todayStr);

        const served = todayTokens.filter(t => t.status === 'served').length;
        const noShows = todayTokens.filter(t => t.status === 'no_show').length;
        const totalRevenue = todaySales.reduce((sum, s) => sum + (parseFloat(s.total_price) || 0), 0);

        const stockConsumed = {};
        todaySales.forEach(s => {
          const qty = parseFloat(s.quantity_kg) || 0;
          stockConsumed[s.variety_name] = (stockConsumed[s.variety_name] || 0) + qty;
        });

        const paymentBreakdown = { Cash: 0, UPI: 0, Credit: 0 };
        todaySales.forEach(s => {
          const mode = s.payment_mode || 'Cash';
          const amt = parseFloat(s.total_price) || 0;
          paymentBreakdown[mode] = (paymentBreakdown[mode] || 0) + amt;
        });

        return makeResponse({
          date: new Date().toLocaleDateString('en-IN'),
          tokens_served: served,
          no_shows: noShows,
          no_show_rate: todayTokens.length ? (noShows / todayTokens.length * 100) : 0.0,
          total_revenue: totalRevenue,
          payment_breakdown: paymentBreakdown,
          stock_consumed: stockConsumed
        });
      }

      if (path === '/api/reports/trends') {
        const sales = getDB('ricemill_sales');
        
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weekly_revenue = [];
        const today = new Date();

        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          
          const dayName = daysOfWeek[d.getDay()];
          const dateStr = d.toLocaleDateString('en-IN');
          
          const daySales = sales.filter(s => {
            const saleDate = new Date(s.created_at || new Date());
            return saleDate.toDateString() === d.toDateString();
          });

          const revenue = daySales.reduce((sum, s) => sum + (parseFloat(s.total_price) || 0), 0);
          const tokens = daySales.length;

          weekly_revenue.push({
            day: dayName,
            revenue: revenue,
            tokens: tokens,
            date: dateStr
          });
        }

        const time_blocks = {
          "06-08 AM": 0, "08-10 AM": 0, "10-12 PM": 0, "12-02 PM": 0,
          "02-04 PM": 0, "04-06 PM": 0, "06-08 PM": 0
        };
        sales.forEach(s => {
          const saleDate = new Date(s.created_at || new Date());
          const h = saleDate.getHours();
          if (6 <= h && h < 8) time_blocks["06-08 AM"] += 1;
          else if (8 <= h && h < 10) time_blocks["08-10 AM"] += 1;
          else if (10 <= h && h < 12) time_blocks["10-12 PM"] += 1;
          else if (12 <= h && h < 14) time_blocks["12-02 PM"] += 1;
          else if (14 <= h && h < 16) time_blocks["02-04 PM"] += 1;
          else if (16 <= h && h < 18) time_blocks["04-06 PM"] += 1;
          else if (18 <= h && h < 20) time_blocks["06-08 PM"] += 1;
        });
        const peak_hours = Object.entries(time_blocks).map(([hour, count]) => ({ hour, count }));

        const variety_sales = {};
        sales.forEach(s => {
          variety_sales[s.variety_name] = (variety_sales[s.variety_name] || 0) + (parseFloat(s.quantity_kg) || 0);
        });
        const varieties_split = Object.entries(variety_sales).map(([name, value]) => ({ name, value }));

        return makeResponse({ weekly_revenue, peak_hours, varieties_split });
      }

      if (path === '/api/reports/weekly' || path === '/api/reports/monthly') {
        const sales = getDB('ricemill_sales');
        const weeklyData = [];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dayName = days[d.getDay()];
          const dateStr = d.toLocaleDateString('en-IN');
          
          const matchSales = sales.filter(s => new Date(s.created_at).toDateString() === d.toDateString());
          const rev = matchSales.reduce((sum, s) => sum + (parseFloat(s.total_price) || 0), 0);
          
          weeklyData.push({
            date: dateStr,
            day: dayName,
            revenue: rev > 0 ? rev : (Math.floor(Math.random() * 8000) + 2000),
            tokens: matchSales.length || Math.floor(Math.random() * 15) + 5
          });
        }
        return makeResponse(weeklyData);
      }

      // 7. Simulated Telephony Webhooks
      if (path === '/api/webhooks/sms') {
        const params = new URLSearchParams(await init.body);
        const from = params.get('From') || '+910000000000';
        const bodyText = params.get('Body') || '';
        const cleanCmd = bodyText.trim().toUpperCase();

        const settings = getDB('ricemill_settings');
        const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
        const smsInbox = getDB('ricemill_sms_inbox');

        smsInbox.unshift({
          phone_number: from,
          message: `[INCOMING SMS] ${bodyText}`,
          timestamp: new Date().toLocaleTimeString(),
          provider: 'USER'
        });

        const makeReply = (replyMsg) => {
          smsInbox.unshift({
            phone_number: from,
            message: replyMsg,
            timestamp: new Date().toLocaleTimeString(),
            provider: 'SIMULATOR'
          });
          setDB('ricemill_sms_inbox', smsInbox);
          broadcastMockWs('NEW_SMS_MOCKED');
          return makeResponse({ status: 'success' });
        };

        if (cleanCmd.startsWith('MOCK_SMS_REPORT:')) {
          return makeReply(bodyText.replace('MOCK_SMS_REPORT: ', ''));
        }

        if (cleanCmd === 'TOKEN') {
          const tokens = getDB('ricemill_tokens');
          const tokenNum = `T-${String(tokens.length + 1).padStart(3, '0')}`;
          const ahead = tokens.filter(t => t.status === 'waiting').length;
          const waitTime = (ahead + 1) * (settings ? settings.avg_service_time : 8);

          tokens.push({
            id: tokens.length + 1,
            token_number: tokenNum,
            phone_number: from,
            customer_name: `Customer #${tokens.length + 1}`,
            status: 'waiting',
            priority: false,
            priority_reason: null,
            wait_time_minutes: waitTime,
            created_at: new Date().toISOString(),
            called_at: null,
            no_show_at: null,
            counter_assigned: null
          });
          setDB('ricemill_tokens', tokens);
          broadcastMockWs('REFRESH_QUEUE');

          return makeReply(`నమస్కారం! మీ టోకెన్ ${tokenNum}.\n${ahead} మంది ముందున్నారు. సమయం ~${waitTime} ని. - ${millName}\n\nHello! Token ${tokenNum}.\n${ahead} ahead. Wait ~${waitTime} mins. - ${millName}`);
        }

        if (cleanCmd === 'PRICE') {
          const stock = getDB('ricemill_stock');
          const pricePairs = stock.map(s => {
            const price = typeof s.price_per_kg === 'number' ? s.price_per_kg : parseFloat(s.price_per_kg) || 0;
            return `${s.variety_name}: ₹${price.toFixed(0)}/kg`;
          }).join(' | ');
          const totalStock = stock.reduce((sum, s) => sum + (parseFloat(s.quantity_kg) || 0), 0);
          return makeReply(`Today's Prices @ ${millName}:\n${pricePairs}\nTotal Stock: ${totalStock.toFixed(0)}kg (${(totalStock / 10).toFixed(0)} bags)`);
        }

        if (cleanCmd === 'STATUS') {
          const tokens = getDB('ricemill_tokens');
          const match = tokens.find(t => t.phone_number === from && ['waiting', 'active'].includes(t.status));
          if (!match) {
            return makeReply(`You do not have an active token today. SMS 'TOKEN' or give a missed call to register.`);
          }
          if (match.status === 'active') {
            return makeReply(`Your token ${match.token_number} is ACTIVE! Please proceed to ${match.counter_assigned || 'Counter 1'} immediately.`);
          }
          const ahead = tokens.filter(t => t.status === 'waiting' && t.id < match.id).length;
          const waitTime = (ahead + 1) * (settings ? settings.avg_service_time : 8);
          return makeReply(`Token ${match.token_number}: ${ahead} ahead. Est. wait: ~${waitTime} mins. - ${millName}`);
        }

        if (cleanCmd === 'STOP') {
          const tokens = getDB('ricemill_tokens');
          let cancelled = false;
          tokens.forEach(t => {
            if (t.phone_number === from && ['waiting', 'active'].includes(t.status)) {
              t.status = 'expired';
              cancelled = true;
            }
          });
          if (cancelled) {
            setDB('ricemill_tokens', tokens);
            broadcastMockWs('REFRESH_QUEUE');
            return makeReply(`You have been unsubscribed. Active tokens canceled. ${millName}.`);
          }
          return makeReply(`You do not have any active tokens to cancel.`);
        }

        return makeReply(`Invalid command. Supported: 'TOKEN' (register), 'PRICE' (rates), 'STATUS' (position), 'STOP' (cancel). - ${millName}`);
      }

      if (path === '/api/webhooks/missed-call') {
        const params = new URLSearchParams(await init.body);
        const from = params.get('From') || '+910000000000';
        
        const tokens = getDB('ricemill_tokens');
        const settings = getDB('ricemill_settings');
        const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';

        if (settings && settings.holiday_mode) {
          const smsInbox = getDB('ricemill_sms_inbox');
          smsInbox.unshift({
            phone_number: from,
            message: `ఈరోజు మిల్లుకు సెలవు. రేపు ఉదయం 6 గంటలకు తెరవబడుతుంది. Closed today. Open tomorrow 6 AM. - ${millName}`,
            timestamp: new Date().toLocaleTimeString(),
            provider: 'SIMULATOR'
          });
          setDB('ricemill_sms_inbox', smsInbox);
          broadcastMockWs('NEW_SMS_MOCKED');
          return makeResponse('<Response><Hangup/></Response>', 200);
        }

        const tokenNum = `T-${String(tokens.length + 1).padStart(3, '0')}`;
        const ahead = tokens.filter(t => t.status === 'waiting').length;
        const waitTime = (ahead + 1) * (settings ? settings.avg_service_time : 8);

        tokens.push({
          id: tokens.length + 1,
          token_number: tokenNum,
          phone_number: from,
          customer_name: `Customer #${tokens.length + 1}`,
          status: 'waiting',
          priority: false,
          priority_reason: null,
          wait_time_minutes: waitTime,
          created_at: new Date().toISOString(),
          called_at: null,
          no_show_at: null,
          counter_assigned: null
        });
        setDB('ricemill_tokens', tokens);
        
        const smsInbox = getDB('ricemill_sms_inbox');
        smsInbox.unshift({
          phone_number: from,
          message: `నమస్కారం! మీ టోకెన్ ${tokenNum}.\n${ahead} మంది ముందున్నారు. సమయం ~${waitTime} ని. - ${millName}\n\nHello! Token ${tokenNum}.\n${ahead} ahead. Wait ~${waitTime} mins. - ${millName}`,
          timestamp: new Date().toLocaleTimeString(),
          provider: 'SIMULATOR'
        });
        setDB('ricemill_sms_inbox', smsInbox);

        broadcastMockWs('REFRESH_QUEUE');
        broadcastMockWs('NEW_SMS_MOCKED');

        return makeResponse('<Response><Hangup/></Response>', 200);
      }

      // GET /api/simulator/sms-inbox
      if (path === '/api/simulator/sms-inbox') {
        return makeResponse(getDB('ricemill_sms_inbox'));
      }

      return makeResponse({ detail: 'Mock route not implemented' }, 501);

    } catch (err) {
      console.error("[Mock API Error]", err);
      return makeResponse({ detail: err.message }, 500);
    }
  };
};

export { setupMockApi };
