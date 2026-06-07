import 'package:flutter/material';
import 'package:vendor_mobile_app/services/offline_sync.dart';

class TokenDashboardPage extends StatefulWidget {
  const TokenDashboardPage({super.key});

  @override
  State<TokenDashboardPage> createState() => _TokenDashboardPageState();
}

class _TokenDashboardPageState extends State<TokenDashboardPage> {
  final OfflineSyncService _syncService = OfflineSyncService();
  List<Map<String, dynamic>> _tokens = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadLocalTokens();
  }

  Future<void> _loadLocalTokens() async {
    setState(() {
      _isLoading = true;
    });
    
    // Seed/pull latest state first if online
    await _syncService.pullServerState();
    
    final localData = await _syncService.getLocalTokens();
    setState(() {
      _tokens = localData;
      _isLoading = false;
    });
  }

  // Simulate calling next
  Future<void> _callNextToken() async {
    // Call next relies on server routing.
    // If offline, we alert they must connect to register new arrivals, 
    // or let them manage existing cached items.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Calling next is only supported in Online Mode.')),
    );
  }

  // No-Show skip offline queue
  Future<void> _markNoShow(int tokenId) async {
    await _syncService.queueOfflineAction('no_show', {
      'token_id': tokenId,
      'token': 'mock-session-token' // Auth fallback
    });
    
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Token skipped. Action queued for sync.')),
    );
    
    // Reload local DB
    final updated = await _syncService.getLocalTokens();
    setState(() {
      _tokens = updated;
    });
  }

  // Open checkout sale dialog
  void _openServeDialog(Map<String, dynamic> token) async {
    final stockItems = await _syncService.getLocalStock();
    if (stockItems.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No stock data available to complete sale.')),
        );
      }
      return;
    }

    String selectedVariety = stockItems.first['variety_name'];
    double qty = 50.0;
    String payment = 'Cash';

    if (!mounted) return;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            double rate = stockItems.firstWhere((s) => s['variety_name'] == selectedVariety)['price_per_kg'];
            double total = qty * rate;
            
            return AlertDialog(
              title: Text('Checkout Token ${token['token_number']}'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DropdownButtonFormField<String>(
                      value: selectedVariety,
                      decoration: const InputDecoration(labelText: 'Rice Variety'),
                      items: stockItems.map((s) {
                        return DropdownMenuItem(
                          value: s['variety_name'] as String,
                          child: Text("${s['variety_name']} (₹${s['price_per_kg']}/kg)"),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) {
                          setDialogState(() {
                            selectedVariety = val;
                          });
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: qty.toString(),
                      decoration: const InputDecoration(labelText: 'Quantity (kg)'),
                      keyboardType: TextInputType.number,
                      onChanged: (val) {
                        setDialogState(() {
                          qty = double.tryParse(val) ?? 0;
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: payment,
                      decoration: const InputDecoration(labelText: 'Payment Mode'),
                      items: ['Cash', 'UPI', 'Credit'].map((mode) {
                        return DropdownMenuItem(value: mode, child: Text(mode));
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) {
                          setDialogState(() {
                            payment = val;
                          });
                        }
                      },
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      color: Colors.black26,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Total Bill:'),
                          Text(
                            '₹${total.toStringAsFixed(2)}',
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () async {
                    // Queue sale transaction
                    await _syncService.queueOfflineAction('serve', {
                      'token_id': token['id'],
                      'variety_name': selectedVariety,
                      'quantity_kg': qty,
                      'payment_mode': payment,
                      'token': 'mock-session-token'
                    });
                    
                    if (mounted) {
                      Navigator.pop(context);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Sale recorded locally.')),
                      );
                    }
                    
                    final updated = await _syncService.getLocalTokens();
                    setState(() {
                      _tokens = updated;
                    });
                  },
                  child: const Text('Record Sale'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final active = _tokens.where((t) => t['status'] == 'active').toList();
    final waiting = _tokens.where((t) => t['status'] == 'waiting').toList();

    return RefreshIndicator(
      onRefresh: _loadLocalTokens,
      child: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Active Token Dashboard card
                  Card(
                    elevation: 4,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const Text(
                            'NOW SERVING',
                            style: TextStyle(letterSpacing: 1.5, fontSize: 12, color: Colors.green),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            active.isNotEmpty ? active.first['token_number'] : 'NONE',
                            style: const TextStyle(fontSize: 48, fontWeight: FontWeight.black, fontFamily: 'monospace'),
                          ),
                          if (active.isNotEmpty) ...[
                            Text(
                              active.first['phone_number'],
                              style: const TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                            const SizedBox(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                ElevatedButton.icon(
                                  icon: const Icon(Icons.check),
                                  label: const Text('Serve'),
                                  style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                                  onPressed: () => _openServeDialog(active.first),
                                ),
                                const SizedBox(width: 12),
                                OutlinedButton.icon(
                                  icon: const Icon(Icons.close),
                                  label: const Text('No-Show'),
                                  onPressed: () => _markNoShow(active.first['id']),
                                ),
                              ],
                            ),
                          ] else ...[
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              icon: const Icon(Icons.arrow_forward),
                              label: const Text('Call Next Token'),
                              onPressed: _callNextToken,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Waiting Queue (${waiting.length})',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 10),
                  Expanded(
                    child: waiting.isNotEmpty
                        ? ListView.builder(
                            itemCount: waiting.length,
                            itemBuilder: (context, index) {
                              final t = waiting[index];
                              return ListTile(
                                leading: CircleAvatar(
                                  child: Text(t['token_number'].substring(2)),
                                ),
                                title: Text(t['token_number']),
                                subtitle: Text(t['phone_number']),
                                trailing: Text('~${t['wait_time_minutes']} min'),
                              );
                            },
                          )
                        : const Center(
                            child: Text(
                              'Queue is empty.',
                              style: TextStyle(color: Colors.grey),
                            ),
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
