// Firebase Real-time Data Sync Service for Sri Trimula Rice Mill
const MOCK_BIN_URL = 'https://extendsclass.com/api/json-storage/bin/ccfedec';

// Placeholder Firebase Config (User can replace with real credentials)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// State variables
let db = null;
let auth = null;
let isRealFirebase = false;
let docRef = null;

// Connection and Sync markers
let isConnected = navigator.onLine;
let lastSyncedTime = Date.now();
const connectionListeners = new Set();

export const getIsConnected = () => isConnected;
export const getLastSyncedTime = () => lastSyncedTime;
export const getIsRealFirebase = () => isRealFirebase;

export const subscribeToConnection = (callback) => {
  connectionListeners.add(callback);
  callback(isConnected, lastSyncedTime);
  return () => {
    connectionListeners.delete(callback);
  };
};

const updateConnectionState = (status) => {
  isConnected = status;
  if (status) lastSyncedTime = Date.now();
  for (const cb of connectionListeners) {
    try {
      cb(isConnected, lastSyncedTime);
    } catch (e) {
      console.warn("Connection listener callback failed", e);
    }
  }
};

window.addEventListener('online', () => updateConnectionState(true));
window.addEventListener('offline', () => updateConnectionState(false));

// Trigger WebSocket message to notify all components to re-fetch
const triggerWebsocketRefresh = () => {
  if (window.broadcastMockWs) {
    try {
      window.broadcastMockWs('REFRESH_QUEUE');
    } catch (e) {
      console.warn("Error calling broadcastMockWs:", e);
    }
  }
};

// Local cache database state (matches database schema)
const getInitialState = () => ({
  settings: {
    id: 1,
    mill_name: 'Sri Trimula Rice Mill',
    virtual_number: '+917075295440',
    holiday_mode: false,
    queue_hold: false,
    avg_service_time: 8,
    sms_gateway_active: true
  },
  stock: [
    { id: 1, variety_name: 'Basmati', quantity_kg: 500, price_per_kg: 120, low_stock_threshold: 50 },
    { id: 2, variety_name: 'Sona Masuri', quantity_kg: 800, price_per_kg: 55, low_stock_threshold: 100 },
    { id: 3, variety_name: 'Sharbati', quantity_kg: 300, price_per_kg: 75, low_stock_threshold: 50 }
  ],
  tokens: [],
  sales: [],
  price_history: [],
  sms_inbox: [],
  logs: [],
  locked_accounts: [],
  theme: 'dark' // Saved theme preference
});

// Setup Firebase Service
const initializeFirebaseService = () => {
  const sdk = window.FirebaseSDK;
  
  if (sdk && firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
      const app = sdk.initializeApp(firebaseConfig);
      db = sdk.getFirestore(app);
      auth = sdk.getAuth(app);
      isRealFirebase = true;
      docRef = sdk.doc(db, "mill", "ccfedec");
      
      // Try enabling offline persistence (IndexedDB managed by Firestore)
      sdk.enableIndexedDbPersistence(db).catch((err) => {
        console.warn("[Firebase Service] Offline persistence failed to enable:", err.code);
      });
      
      console.log("[Firebase Service] Real Firebase initialized successfully.");
    } catch (e) {
      console.error("[Firebase Service] Error initializing Firebase, falling back:", e);
      isRealFirebase = false;
    }
  } else {
    console.log("[Firebase Service] Placeholder config or SDK missing. Running on Fallback Cloud Sync.");
    isRealFirebase = false;
  }
};

// Initialize on load
initializeFirebaseService();

// State managers
let localState = getInitialState();
const listeners = new Set();
let pullPromise = null;
let lastLocalWriteTime = 0;
let isPolling = false;

// Expose getDbState
export const getDbState = () => localState;

// Notify listeners on state updates
const notify = () => {
  for (const cb of listeners) {
    try {
      cb(localState);
    } catch (err) {
      console.error("[Firebase Service] Callback notify error:", err);
    }
  }
};

// Helper to push to cloud mock bin
const pushToCloudMock = async () => {
  try {
    const res = await fetch(MOCK_BIN_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localState)
    });
    if (res.ok) {
      lastSyncedTime = Date.now();
      updateConnectionState(true);
    } else {
      updateConnectionState(false);
    }
  } catch (err) {
    console.error("[Mock DB] Cloud sync push failed:", err);
    updateConnectionState(false);
  }
};

// Helper to pull from cloud mock bin
const pullFromCloudMock = async () => {
  try {
    const res = await fetch(`${MOCK_BIN_URL}?nocache=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      const state = data.data ? JSON.parse(data.data) : data;
      if (state && typeof state === 'object') {
        localState = {
          settings: state.settings || localState.settings,
          stock: state.stock || localState.stock,
          tokens: state.tokens || localState.tokens,
          sales: state.sales || localState.sales,
          price_history: state.price_history || localState.price_history,
          sms_inbox: state.sms_inbox || localState.sms_inbox,
          logs: state.logs || localState.logs,
          theme: state.theme || localState.theme
        };
        lastSyncedTime = Date.now();
        updateConnectionState(true);
        notify();
        triggerWebsocketRefresh();
      }
    }
  } catch (err) {
    console.error("[Mock DB] Cloud sync pull failed:", err);
    updateConnectionState(false);
  }
};

// Set up polling for mock database sync when tab is active
const startMockSync = () => {
  setInterval(async () => {
    if (document.visibilityState === 'visible' && !isRealFirebase && !isPolling) {
      if (Date.now() - lastLocalWriteTime > 5000) {
        isPolling = true;
        try {
          await pullFromCloudMock();
        } finally {
          isPolling = false;
        }
      }
    }
  }, 5000);
};
startMockSync();

// Exported Subscribe functions
export const subscribeToDatabase = (callback) => {
  listeners.add(callback);
  
  if (isRealFirebase && docRef) {
    const sdk = window.FirebaseSDK;
    const unsub = sdk.onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        localState = docSnap.snap ? docSnap.data() : docSnap.data();
        lastSyncedTime = Date.now();
        updateConnectionState(true);
        callback(localState);
        triggerWebsocketRefresh();
      } else {
        // Seed default document in Firestore if not exists
        sdk.setDoc(docRef, getInitialState());
      }
    }, (err) => {
      console.error("[Firebase Service] onSnapshot error:", err);
      updateConnectionState(false);
    });
    
    return () => {
      listeners.delete(callback);
      unsub();
    };
  } else {
    // Return cached state immediately
    callback(localState);
    if (!pullPromise) {
      pullPromise = pullFromCloudMock().then(() => callback(localState));
    }
    return () => {
      listeners.delete(callback);
    };
  }
};

// Write operation updates helper
const updateDatabase = async (updater) => {
  localState = updater(localState);
  notify();
  triggerWebsocketRefresh();
  
  if (isRealFirebase && docRef) {
    const sdk = window.FirebaseSDK;
    try {
      await sdk.setDoc(docRef, localState);
      lastSyncedTime = Date.now();
      updateConnectionState(true);
    } catch (e) {
      console.error("[Firebase Service] error writing document:", e);
      updateConnectionState(false);
    }
  } else {
    lastLocalWriteTime = Date.now();
    await pushToCloudMock();
  }
};

// Database Mutators
export const updateSettings = (settings) => {
  return updateDatabase(state => ({
    ...state,
    settings: { ...state.settings, ...settings }
  }));
};

export const updateStock = (stockList) => {
  return updateDatabase(state => ({
    ...state,
    stock: stockList
  }));
};

export const updateTokens = (tokenList) => {
  return updateDatabase(state => ({
    ...state,
    tokens: tokenList
  }));
};

export const updateLockedAccounts = (lockedList) => {
  return updateDatabase(state => ({
    ...state,
    locked_accounts: lockedList
  }));
};

export const updateSales = (salesList) => {
  return updateDatabase(state => ({
    ...state,
    sales: salesList
  }));
};

export const updatePriceHistory = (historyList) => {
  return updateDatabase(state => ({
    ...state,
    price_history: historyList
  }));
};

export const updateSmsInbox = (inboxList) => {
  return updateDatabase(state => ({
    ...state,
    sms_inbox: inboxList
  }));
};

export const addSystemLog = (action, detail, user = "System") => {
  return updateDatabase(state => {
    const logs = [...(state.logs || [])];
    logs.unshift({
      id: logs.length + 1,
      user,
      action,
      detail,
      timestamp: new Date().toISOString()
    });
    return {
      ...state,
      logs: logs.slice(0, 100) // Keep last 100 logs
    };
  });
};

export const updateThemePreference = (theme) => {
  return updateDatabase(state => ({
    ...state,
    theme
  }));
};

// Auth Service Interfaces (Only Admin allowed for console logins)
export const loginUser = async (username, password) => {
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  if (isRealFirebase) {
    const sdk = window.FirebaseSDK;
    const email = username.includes('@') ? username : `${cleanUser}@mill.com`;
    try {
      const userCred = await sdk.signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;
      
      // Permit only owner, shanmukha, staff, accountant
      if (cleanUser !== 'owner' && cleanUser !== 'shanmukha' && cleanUser !== 'staff' && cleanUser !== 'accountant') {
        await sdk.signOut(auth);
        throw new Error("Access denied: Invalid account console");
      }
      
      let role = 'owner';
      let fullName = 'Shanmukha';
      if (cleanUser === 'staff') {
        role = 'staff';
        fullName = 'Staff User';
      } else if (cleanUser === 'accountant') {
        role = 'accountant';
        fullName = 'Accountant User';
      }

      return {
        uid: user.uid,
        username,
        role,
        full_name: fullName
      };
    } catch (e) {
      throw new Error(e.message || "Invalid username or password");
    }
  } else {
    // Standard mock auth: owner, staff, accountant
    if (cleanPass === 'Shanmukha29*') {
      if (cleanUser === 'owner' || cleanUser === 'shanmukha') {
        return { uid: `mock_uid_owner`, username: 'owner', role: 'owner', full_name: 'Shanmukha' };
      } else if (cleanUser === 'staff') {
        return { uid: `mock_uid_staff`, username: 'staff', role: 'staff', full_name: 'Staff User' };
      } else if (cleanUser === 'accountant') {
        return { uid: `mock_uid_accountant`, username: 'accountant', role: 'accountant', full_name: 'Accountant User' };
      }
      throw new Error("Access denied: Invalid user account");
    }
    throw new Error("Invalid username or password");
  }
};

export const logoutUser = async () => {
  if (isRealFirebase) {
    const sdk = window.FirebaseSDK;
    await sdk.signOut(auth);
  }
};

export const monitorAuthState = (callback) => {
  if (isRealFirebase) {
    const sdk = window.FirebaseSDK;
    return sdk.onAuthStateChanged(auth, (user) => {
      if (user) {
        const email = user.email || '';
        let username = email.split('@')[0] || 'viewer';
        if (username === 'owner' || username === 'shanmukha' || username === 'staff' || username === 'accountant') {
          let role = 'owner';
          let fullName = 'Shanmukha';
          if (username === 'staff') {
            role = 'staff';
            fullName = 'Staff User';
          } else if (username === 'accountant') {
            role = 'accountant';
            fullName = 'Accountant User';
          }
          callback({
            uid: user.uid,
            username,
            role,
            full_name: fullName
          });
        } else {
          sdk.signOut(auth);
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  } else {
    return () => {};
  }
};

