// In-browser LocalStorage Mock DB and API Interceptor for Smart Rice Mill System
const MOCK_SOCKETS = new Set();

// Helper to seed localStorage database keys if not initialized
const initMockDatabase = () => {
  if (!localStorage.getItem('ricemill_settings')) {
    localStorage.setItem('ricemill_settings', JSON.stringify({
      id: 1,
      mill_name: 'Sri Trimula Rice Mill',
      virtual_number: '+917075295440',
      holiday_mode: false,
      queue_hold: false,
      avg_service_time: 8,
      sms_gateway_active: true
    }));
  }

  if (!localStorage.getItem('ricemill_stock')) {
    localStorage.setItem('ricemill_stock', JSON.stringify([
      { id: 1, variety_name: 'Basmati', quantity_kg: 500, price_per_kg: 120, low_stock_threshold: 50 },
      { id: 2, variety_name: 'Sona Masuri', quantity_kg: 800, price_per_kg: 55, low_stock_threshold: 100 },
      { id: 3, variety_name: 'Sharbati', quantity_kg: 300, price_per_kg: 75, low_stock_threshold: 50 }
    ]));
  }

  if (!localStorage.getItem('ricemill_tokens')) {
    localStorage.setItem('ricemill_tokens', JSON.stringify([]));
  }

  if (!localStorage.getItem('ricemill_sales')) {
    localStorage.setItem('ricemill_sales', JSON.stringify([]));
  }

  if (!localStorage.getItem('ricemill_price_history')) {
    localStorage.setItem('ricemill_price_history', JSON.stringify([]));
  }

  if (!localStorage.getItem('ricemill_sms_inbox')) {
    localStorage.setItem('ricemill_sms_inbox', JSON.stringify([]));
  }

  if (!localStorage.getItem('ricemill_locked_accounts')) {
    localStorage.setItem('ricemill_locked_accounts', JSON.stringify([]));
  }
};

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
  initMockDatabase();

  // Override WebSocket globally
  window.WebSocket = MockWebSocket;

  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input.url;
    
    // Check if the request is targeting our backend API
    if (!urlStr.includes('/api/')) {
      return originalFetch(input, init);
    }

    // Parse URL path
    const urlObj = new URL(urlStr);
    const path = urlObj.pathname;
    const method = (init && init.method || 'GET').toUpperCase();
    
    console.log(`[Mock API Intercept] ${method} ${path}`);

    // Helper functions to fetch and save local JSON state
    const getDB = (key) => JSON.parse(localStorage.getItem(key) || '[]');
    const setDB = (key, data) => localStorage.setItem(key, JSON.stringify(data));

    // Construct mock response generator
    const makeResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    try {
      // 1. Auth Endpoint
      if (path === '/api/auth/login') {
        const body = JSON.parse(init.body);
        if (body.username === 'Shanmukha' && body.password === 'Shanmukha29*') {
          return makeResponse({
            access_token: 'mock_jwt_token_for_shanmukha',
            token_type: 'bearer',
            role: 'owner',
            full_name: 'Shanmukha'
          });
        }
        return makeResponse({ detail: 'Invalid username or password' }, 401);
      }

      // 2. Settings Endpoints
      if (path === '/api/settings') {
        if (method === 'GET') {
          const settings = JSON.parse(localStorage.getItem('ricemill_settings'));
          return makeResponse(settings);
        }
        if (method === 'PUT') {
          const body = JSON.parse(init.body);
          localStorage.setItem('ricemill_settings', JSON.stringify(body));
          // Notify WebSocket client screens to refresh settings
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
          return makeResponse(getDB('ricemill_stock'));
        }
      }

      if (path.startsWith('/api/stock/')) {
        const parts = path.split('/');
        
        // POST /api/stock/bulk-import
        if (parts[3] === 'bulk-import') {
          const body = JSON.parse(init.body); // will receive array of records
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
            const oldPrice = stock[idx].price_per_kg;
            const oldQty = stock[idx].quantity_kg;
            stock[idx] = { ...stock[idx], ...body };
            setDB('ricemill_stock', stock);

            // Log price history changes
            if (oldPrice !== body.price_per_kg) {
              const history = getDB('ricemill_price_history');
              history.unshift({
                id: history.length + 1,
                variety_name: stock[idx].variety_name,
                old_price: oldPrice,
                new_price: body.price_per_kg,
                changed_by: 'Shanmukha',
                changed_at: new Date().toISOString()
              });
              setDB('ricemill_price_history', history);
            }
            
            // Check low stock threshold alert
            if (body.quantity_kg <= stock[idx].low_stock_threshold) {
              const smsInbox = getDB('ricemill_sms_inbox');
              smsInbox.unshift({
                phone_number: '+919999999999',
                message: `⚠️ Sri Trimula Mill Stock Alert: ${stock[idx].variety_name} low: ${body.quantity_kg} kg (Threshold: ${stock[idx].low_stock_threshold} kg). Reorder: 500 kg.`,
                timestamp: new Date().toLocaleTimeString(),
                provider: 'SIMULATOR'
              });
              setDB('ricemill_sms_inbox', smsInbox);
              // Trigger reload in simulator
              broadcastMockWs('NEW_SMS_MOCKED');
            }

            broadcastMockWs('REFRESH_QUEUE');
            return makeResponse(stock[idx]);
          }
          return makeResponse({ detail: 'Stock item not found' }, 404);
        }
      }

      // 5. Token Endpoints
      if (path === '/api/tokens') {
        if (method === 'GET') {
          const tokens = getDB('ricemill_tokens');
          return makeResponse(tokens);
        }
        if (method === 'POST') {
          const body = JSON.parse(init.body);
          const tokens = getDB('ricemill_tokens');
          const settings = JSON.parse(localStorage.getItem('ricemill_settings'));

          // Check closed day / holiday mode
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

          // Simulated Registration SMS
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
          
          // Auto skip currently called active tokens on this counter to prevent queue block
          tokens.forEach(t => {
            if (t.status === 'active' && t.counter_assigned === counter) {
              t.status = 'no_show';
              t.no_show_at = new Date().toISOString();
            }
          });

          // Fetch next waiting (Priority sorted first, then created_at)
          const nextIndex = tokens.findIndex(t => t.status === 'waiting');
          if (nextIndex !== -1) {
            tokens[nextIndex].status = 'active';
            tokens[nextIndex].counter_assigned = counter;
            tokens[nextIndex].called_at = new Date().toISOString();
            setDB('ricemill_tokens', tokens);

            // Simulated Call Active SMS
            const settings = JSON.parse(localStorage.getItem('ricemill_settings'));
            const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
            const smsInbox = getDB('ricemill_sms_inbox');
            smsInbox.unshift({
              phone_number: tokens[nextIndex].phone_number,
              message: `టోకెన్ ${tokens[nextIndex].token_number} యాక్టివ్ అయింది! దయచేసి వెంటనే ${counter} కి వెళ్ళండి.\n\nToken ${tokens[nextIndex].token_number} is NOW ACTIVE! Proceed to ${counter} immediately. - ${millName}`,
              timestamp: new Date().toLocaleTimeString(),
              provider: 'SIMULATOR'
            });
            setDB('ricemill_sms_inbox', smsInbox);

            // Alert token position 2 (2 Away)
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
        const action = parts[4]; // serve, no-show, reactivate

        const tokens = getDB('ricemill_tokens');
        const tokenIdx = tokens.findIndex(t => t.id === tokenId);

        if (tokenIdx !== -1) {
          // Serve customer checkout
          if (action === 'serve' && method === 'POST') {
            const body = JSON.parse(init.body);
            const stock = getDB('ricemill_stock');
            const itemIdx = stock.findIndex(s => s.variety_name === body.variety_name);
            
            if (itemIdx !== -1) {
              if (stock[itemIdx].quantity_kg < body.quantity_kg) {
                return makeResponse({ detail: 'Insufficient stock!' }, 400);
              }
              stock[itemIdx].quantity_kg -= body.quantity_kg;
              setDB('ricemill_stock', stock);
            }

            tokens[tokenIdx].status = 'served';
            setDB('ricemill_tokens', tokens);

            // Record Sale
            const sales = getDB('ricemill_sales');
            const newSale = {
              id: sales.length + 1,
              token_number: tokens[tokenIdx].token_number,
              variety_name: body.variety_name,
              quantity_kg: body.quantity_kg,
              price_per_kg: body.price_per_kg,
              total_price: body.total_price,
              payment_mode: body.payment_mode,
              service_time_seconds: Math.floor(Math.random() * 200) + 150,
              created_at: new Date().toISOString()
            };
            sales.push(newSale);
            setDB('ricemill_sales', sales);

            // Served SMS
            const settings = JSON.parse(localStorage.getItem('ricemill_settings'));
            const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
            const smsInbox = getDB('ricemill_sms_inbox');
            smsInbox.unshift({
              phone_number: tokens[tokenIdx].phone_number,
              message: `టోకెన్ ${tokens[tokenIdx].token_number} పూర్తయింది. ధన్యవాదాలు! మొత్తం బిల్లు: ₹${body.total_price.toFixed(2)}.\n\nToken ${tokens[tokenIdx].token_number} served. Thank you! Total: ₹${body.total_price.toFixed(2)}. - ${millName}`,
              timestamp: new Date().toLocaleTimeString(),
              provider: 'SIMULATOR'
            });
            setDB('ricemill_sms_inbox', smsInbox);

            broadcastMockWs('REFRESH_QUEUE');
            broadcastMockWs('NEW_SMS_MOCKED');
            return makeResponse(newSale);
          }

          // No show mark
          if (action === 'no-show' && method === 'POST') {
            tokens[tokenIdx].status = 'no_show';
            tokens[tokenIdx].no_show_at = new Date().toISOString();
            setDB('ricemill_tokens', tokens);

            // No show SMS
            const settings = JSON.parse(localStorage.getItem('ricemill_settings'));
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

          // Reactivate skipped customer
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

        const served = tokens.filter(t => t.status === 'served').length;
        const noShows = tokens.filter(t => t.status === 'no_show').length;
        const totalRevenue = sales.reduce((sum, s) => sum + s.total_price, 0);

        const stockConsumed = {};
        sales.forEach(s => {
          stockConsumed[s.variety_name] = (stockConsumed[s.variety_name] || 0) + s.quantity_kg;
        });

        return makeResponse({
          date: new Date().toLocaleDateString('en-IN'),
          tokens_served: served,
          no_shows: noShows,
          no_show_rate: tokens.length ? (noShows / tokens.length * 100) : 0,
          total_revenue: totalRevenue,
          stock_consumed: stockConsumed
        });
      }

      if (path === '/api/reports/weekly' || path === '/api/reports/monthly') {
        const sales = getDB('ricemill_sales');
        // Group by day of week or date
        const weeklyData = [];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        // Create mock default chart trends to populate view
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dayName = days[d.getDay()];
          const dateStr = d.toLocaleDateString('en-IN');
          
          // filter actual sales matching this date
          const matchSales = sales.filter(s => new Date(s.created_at).toDateString() === d.toDateString());
          const rev = matchSales.reduce((sum, s) => sum + s.total_price, 0);
          
          weeklyData.push({
            date: dateStr,
            day: dayName,
            revenue: rev > 0 ? rev : (Math.floor(Math.random() * 8000) + 2000), // seed random trend placeholder
            tokens: matchSales.length || Math.floor(Math.random() * 15) + 5
          });
        }
        return makeResponse(weeklyData);
      }

      // 7. Simulated Telephony Webhooks (Command parsing simulator)
      if (path === '/api/webhooks/sms') {
        const params = new URLSearchParams(await init.body);
        const from = params.get('From') || '+910000000000';
        const bodyText = params.get('Body') || '';
        const cleanCmd = bodyText.trim().toUpperCase();

        const settings = JSON.parse(localStorage.getItem('ricemill_settings'));
        const millName = settings ? settings.mill_name : 'Sri Trimula Rice Mill';
        const smsInbox = getDB('ricemill_sms_inbox');

        // Log incoming command to inbox
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
          // Manual report simulation triggers from settings dashboard
          return makeReply(bodyText.replace('MOCK_SMS_REPORT: ', ''));
        }

        if (cleanCmd === 'TOKEN') {
          // Register via SMS
          const tokens = getDB('ricemill_tokens');
          const tokenNum = `T-${String(tokens.length + 1).padStart(3, '0')}`;
          const ahead = tokens.filter(t => t.status === 'waiting').length;
          const waitTime = (ahead + 1) * (settings ? settings.avg_service_time : 8);

          tokens.push({
            id: tokens.length + 1,
            token_number: tokenNum,
            phone_number: from,
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
          const pricePairs = stock.map(s => `${s.variety_name}: ₹${s.price_per_kg.toFixed(0)}/kg`).join(' | ');
          const totalStock = stock.reduce((sum, s) => sum + s.quantity_kg, 0);
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
        
        // Simulates missed call token generation
        const tokens = getDB('ricemill_tokens');
        const settings = JSON.parse(localStorage.getItem('ricemill_settings'));
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

      // Default fallback
      return makeResponse({ detail: 'Mock route not implemented' }, 501);

    } catch (err) {
      console.error("[Mock API Error]", err);
      return makeResponse({ detail: err.message }, 500);
    }
  };
};

export { setupMockApi };
