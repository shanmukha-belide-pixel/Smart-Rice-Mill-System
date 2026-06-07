import 'package:flutter/material';
import 'package:vendor_mobile_app/services/offline_sync.dart';

class StockManagementPage extends StatefulWidget {
  const StockManagementPage({super.key});

  @override
  State<StockManagementPage> createState() => _StockManagementPageState();
}

class _StockManagementPageState extends State<StockManagementPage> {
  final OfflineSyncService _syncService = OfflineSyncService();
  List<Map<String, dynamic>> _stock = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadLocalStock();
  }

  Future<void> _loadLocalStock() async {
    setState(() {
      _isLoading = true;
    });

    // Seed/pull latest state first if online
    await _syncService.pullServerState();
    
    final localData = await _syncService.getLocalStock();
    setState(() {
      _stock = localData;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _loadLocalStock,
      child: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Inventory Status',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: _stock.isNotEmpty
                        ? ListView.builder(
                            itemCount: _stock.length,
                            itemBuilder: (context, index) {
                              final item = _stock[index];
                              final qty = item['quantity_kg'] as double;
                              final threshold = item['low_stock_threshold'] as double;
                              final isLow = qty < threshold;
                              final bags = qty / 10.0;

                              return Card(
                                margin: const EdgeInsets.only(bottom: 12),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(
                                    color: isLow ? Colors.red.withOpacity(0.5) : Colors.transparent,
                                    width: 1,
                                  ),
                                ),
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                  title: Text(
                                    item['variety_name'],
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  subtitle: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const SizedBox(height: 4),
                                      Text('Weight: ${qty.toStringAsFixed(1)} kg'),
                                      Text('Bags (10kg): ${bags.toStringAsFixed(1)} bags'),
                                    ],
                                  ),
                                  trailing: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        '₹${item['price_per_kg']}/kg',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: Colors.green,
                                          fontSize: 16,
                                        ),
                                      ),
                                      if (isLow)
                                        Container(
                                          margin: const EdgeInsets.only(top: 4),
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: Colors.red.shade900.withOpacity(0.5),
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: const Text(
                                            'LOW STOCK',
                                            style: TextStyle(fontSize: 8, color: Colors.redAccent, fontWeight: FontWeight.bold),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          )
                        : const Center(
                            child: Text(
                              'No stock data found.',
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
