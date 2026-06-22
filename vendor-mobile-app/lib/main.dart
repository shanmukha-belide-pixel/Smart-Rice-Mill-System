import 'package:flutter/material';
import 'package:vendor_mobile_app/pages/token_dashboard.dart';
import 'package:vendor_mobile_app/pages/stock_management.dart';
import 'package:vendor_mobile_app/services/offline_sync.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize offline Database
  final syncService = OfflineSyncService();
  await syncService.initializeDatabase();
  
  // Start background sync listener
  syncService.startPeriodicSync();

  runApp(const SriTirumalaApp());
}

class SriTirumalaApp extends StatelessWidget {
  const SriTirumalaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sri Tirumala Rice Mill',
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF10B981), // Emerald
        scaffoldBackgroundColor: const Color(0xFF0F172A), // Slate 900
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF10B981),
          secondary: Color(0xFFF59E0B), // Amber
          background: Color(0xFF0F172A),
        ),
        useMaterial3: true,
      ),
      home: const MainNavigationScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _selectedIndex = 0;
  bool _isOnline = true;
  String _syncStatus = "Synced";
  final OfflineSyncService _syncService = OfflineSyncService();

  final List<Widget> _pages = [
    const TokenDashboardPage(),
    const StockManagementPage(),
  ];

  @override
  void initState() {
    super.initState();
    // Listen to network changes
    _syncService.connectivityStream.listen((isOnline) {
      setState(() {
        _isOnline = isOnline;
        _syncStatus = isOnline ? "Synced" : "Working Offline";
      });
    });
  }

  Future<void> _triggerSync() async {
    setState(() {
      _syncStatus = "Syncing...";
    });
    
    bool success = await _syncService.syncOfflineChanges();
    
    setState(() {
      _syncStatus = success ? "Synced" : "Sync Failed";
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Sri Tirumala Rice Mill',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            Text(
              'Staff Workspace',
              style: TextStyle(fontSize: 10, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(
              _isOnline ? Icons.wifi : Icons.wifi_off,
              color: _isOnline ? Colors.green : Colors.red,
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(_isOnline ? 'Online mode active' : 'Running offline. Changes cached.'),
                  duration: const Duration(seconds: 2),
                ),
              );
            },
          ),
          if (!_isOnline)
            TextButton.icon(
              icon: const Icon(Icons.sync, size: 16, color: Colors.amber),
              label: const Text('Sync', style: TextStyle(color: Colors.amber, fontSize: 12)),
              onPressed: _triggerSync,
            )
        ],
      ),
      body: Column(
        children: [
          // Offline Status Bar
          Container(
            width: double.infinity,
            color: _isOnline ? Colors.emerald.withOpacity(0.1) : Colors.amber.withOpacity(0.1),
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  _syncStatus,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: _isOnline ? Colors.emerald : Colors.amber,
                  ),
                ),
                Text(
                  _isOnline ? "Server Connected" : "Local Database Mode",
                  style: const TextStyle(fontSize: 9, color: Colors.grey),
                ),
              ],
            ),
          ),
          Expanded(child: _pages[_selectedIndex]),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.queue_play_next),
            label: 'Queue',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.inventory_2_outlined),
            label: 'Stock',
          ),
        ],
      ),
    );
  }
}
