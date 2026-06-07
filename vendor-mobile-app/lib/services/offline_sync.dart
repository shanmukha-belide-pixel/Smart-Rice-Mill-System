import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

class OfflineSyncService {
  static final OfflineSyncService _instance = OfflineSyncService._internal();
  factory OfflineSyncService() => _instance;
  OfflineSyncService._internal();

  Database? _db;
  final String _baseUrl = "http://10.0.2.2:8000"; // Android loopback for localhost
  
  // Stream controller for connection monitoring
  final StreamController<bool> _connectivityController = StreamController<bool>.broadcast();
  Stream<bool> get connectivityStream => _connectivityController.stream;

  // Initialize SQLite Database
  Future<void> initializeDatabase() async {
    final dbPath = await getDatabasesPath();
    final pathString = join(dbPath, 'mill_offline.db');

    _db = await openDatabase(
      pathString,
      version: 1,
      onCreate: (db, version) async {
        // Cached tokens
        await db.execute('''
          CREATE TABLE tokens_cache (
            id INTEGER PRIMARY KEY,
            token_number TEXT,
            phone_number TEXT,
            status TEXT,
            priority INTEGER,
            counter_assigned TEXT,
            wait_time_minutes INTEGER,
            called_at TEXT,
            served_at TEXT,
            created_at TEXT
          )
        ''');

        // Cached stock
        await db.execute('''
          CREATE TABLE stock_cache (
            id INTEGER PRIMARY KEY,
            variety_name TEXT UNIQUE,
            quantity_kg REAL,
            price_per_kg REAL,
            low_stock_threshold REAL
          )
        ''');

        // Sync queue for mutations made offline
        await db.execute('''
          CREATE TABLE sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT, -- 'call_next', 'serve', 'no_show'
            payload TEXT, -- JSON string representation
            timestamp TEXT
          )
        ''');
      },
    );

    // Setup connectivity listeners
    Connectivity().onConnectivityChanged.listen((ConnectivityResult result) {
      bool isOnline = result != ConnectivityResult.none;
      _connectivityController.add(isOnline);
      if (isOnline) {
        syncOfflineChanges();
      }
    });
  }

  // Queue an offline operation
  Future<void> queueOfflineAction(String action, Map<String, dynamic> payload) async {
    if (_db == null) return;
    
    await _db!.insert('sync_queue', {
      'action': action,
      'payload': jsonEncode(payload),
      'timestamp': DateTime.now().toIso8601String()
    });
    
    // Process locally so local dashboard updates immediately
    await _applyActionLocally(action, payload);
  }

  // Local state modifier helper (optimistic updates)
  Future<void> _applyActionLocally(String action, Map<String, dynamic> payload) async {
    if (_db == null) return;
    
    if (action == 'no_show') {
      int tokenId = payload['token_id'];
      await _db!.update(
        'tokens_cache', 
        {'status': 'no_show'}, 
        where: 'id = ?', 
        whereArgs: [tokenId]
      );
    } else if (action == 'serve') {
      int tokenId = payload['token_id'];
      String variety = payload['variety_name'];
      double qty = payload['quantity_kg'];
      
      // Serve token
      await _db!.update(
        'tokens_cache', 
        {'status': 'served', 'served_at': DateTime.now().toIso8601String()}, 
        where: 'id = ?', 
        whereArgs: [tokenId]
      );
      
      // Consume stock
      final List<Map<String, dynamic>> items = await _db!.query(
        'stock_cache', 
        where: 'variety_name = ?', 
        whereArgs: [variety]
      );
      if (items.isNotEmpty) {
        double currentQty = items.first['quantity_kg'];
        await _db!.update(
          'stock_cache',
          {'quantity_kg': currentQty - qty},
          where: 'variety_name = ?',
          whereArgs: [variety]
        );
      }
    }
  }

  // Replay offline mutations on server reconnect
  Future<bool> syncOfflineChanges() async {
    if (_db == null) return false;

    final List<Map<String, dynamic>> queue = await _db!.query('sync_queue', orderBy: 'id ASC');
    if (queue.isEmpty) return true;

    try {
      for (var item in queue) {
        int id = item['id'];
        String action = item['action'];
        Map<String, dynamic> payload = jsonDecode(item['payload']);

        bool success = await _relayActionToServer(action, payload);
        if (success) {
          // Delete from sync queue
          await _db!.delete('sync_queue', where: 'id = ?', whereArgs: [id]);
        } else {
          // Stop sync run to preserve FIFO ordering of edits
          return false;
        }
      }
      
      // Refresh local cache with latest server state
      await pullServerState();
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> _relayActionToServer(String action, Map<String, dynamic> payload) async {
    try {
      if (action == 'no_show') {
        int tokenId = payload['token_id'];
        final res = await http.post(
          Uri.parse("$_baseUrl/api/tokens/$tokenId/no-show"),
          headers: {"Authorization": "Bearer ${payload['token']}"}
        );
        return res.statusCode == 200;
      } else if (action == 'serve') {
        int tokenId = payload['token_id'];
        final res = await http.post(
          Uri.parse("$_baseUrl/api/tokens/$tokenId/serve"),
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer ${payload['token']}"
          },
          body: jsonEncode({
            "variety_name": payload['variety_name'],
            "quantity_kg": payload['quantity_kg'],
            "payment_mode": payload['payment_mode']
          })
        );
        return res.statusCode == 200;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // Pull latest database states from server
  Future<void> pullServerState() async {
    if (_db == null) return;
    try {
      // Pull tokens
      final tokensRes = await http.get(Uri.parse("$_baseUrl/api/tokens"));
      if (tokensRes.statusCode == 200) {
        List<dynamic> tokens = jsonDecode(tokensRes.body);
        await _db!.transaction((txn) async {
          await txn.delete('tokens_cache');
          for (var t in tokens) {
            await txn.insert('tokens_cache', {
              'id': t['id'],
              'token_number': t['token_number'],
              'phone_number': t['phone_number'],
              'status': t['status'],
              'priority': t['priority'] ? 1 : 0,
              'counter_assigned': t['counter_assigned'],
              'wait_time_minutes': t['wait_time_minutes'],
              'called_at': t['called_at'],
              'served_at': t['served_at'],
              'created_at': t['created_at']
            });
          }
        });
      }

      // Pull stock
      final stockRes = await http.get(Uri.parse("$_baseUrl/api/stock"));
      if (stockRes.statusCode == 200) {
        List<dynamic> stocks = jsonDecode(stockRes.body);
        await _db!.transaction((txn) async {
          await txn.delete('stock_cache');
          for (var s in stocks) {
            await txn.insert('stock_cache', {
              'id': s['id'],
              'variety_name': s['variety_name'],
              'quantity_kg': s['quantity_kg'],
              'price_per_kg': s['price_per_kg'],
              'low_stock_threshold': s['low_stock_threshold']
            });
          }
        });
      }
    } catch (e) {
      // Fail silently, keep local cache
    }
  }

  // Setup periodic sync attempt (every 5 minutes)
  void startPeriodicSync() {
    Timer.periodic(const Duration(minutes: 5), (timer) {
      syncOfflineChanges();
    });
  }

  // Fetch local tokens cached
  Future<List<Map<String, dynamic>>> getLocalTokens() async {
    if (_db == null) return [];
    return await _db!.query('tokens_cache', orderBy: 'id ASC');
  }

  // Fetch local stock cached
  Future<List<Map<String, dynamic>>> getLocalStock() async {
    if (_db == null) return [];
    return await _db!.query('stock_cache', orderBy: 'id ASC');
  }
}
