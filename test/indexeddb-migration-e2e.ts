/**
 * End-to-End IndexedDB & Migration Invariants Verification
 */

import 'fake-indexeddb/auto';
import { shucadeaDB, LS_MIGRATION_BACKUP_KEY } from '../src/services/db';
import { storage } from '../src/services/storage';

// Polyfill localStorage in Node.js environment
const memoryStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => memoryStorage[key] ?? null,
  setItem: (key: string, val: string) => { memoryStorage[key] = String(val); },
  removeItem: (key: string) => { delete memoryStorage[key]; },
  clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); },
  key: (index: number) => Object.keys(memoryStorage)[index] ?? null,
  length: 0,
};
Object.defineProperty(global.localStorage, 'length', {
  get: () => Object.keys(memoryStorage).length,
});

async function run() {
  console.log('--- Starting IndexedDB & Safe Migration Test ---');

  // 1. Seed legacy localStorage data
  const legacyLiveState = {
    settings: {
      business_name: 'Shucadea Hardware Bulawayo',
      tagline: 'Quality Tools & Materials',
      currency: 'USD',
      is_demo_mode: false,
    },
    whiteBatches: [
      {
        id: 'wb-legacy-1',
        batch_number: 'BATCH-2025-01',
        quantity_purchased: 20,
        purchase_price_per_door: 23,
        total_purchase_cost: 460,
        transport_cost: 25,
        quantity_sold: 15,
        quantity_remaining: 5,
        damaged_doors: 0,
        returned_doors: 0,
        total_collected_revenue: 395,
        unpaid_sales_amount: 0,
        gross_profit: 50,
        net_profit: 25,
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ],
    whiteSales: [],
    brownPurchases: [
      {
        id: 'bp-legacy-1',
        purchase_date: '2025-01-10',
        quantity: 10,
        purchase_price_per_door: 14,
        total_cost: 140,
        created_at: new Date().toISOString(),
      },
    ],
    brownSales: [],
    brownWithdrawals: [],
    doorTransactions: [],
    hardwareTransactions: [],
    dailyClosings: [],
    priceLibrary: [
      {
        id: 'pl-legacy-1',
        product_name: '15mm Copper Pipe',
        standardized_name: '15mm copper pipe',
        category: 'plumbing',
        unit: 'lengths',
        current_unit_price: 18.5,
        previous_prices: [],
        quotation_count: 3,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
    quotations: [
      {
        id: 'q-legacy-1',
        quotation_number: 'Q-2025-001',
        date: '2025-01-15',
        customer_name: 'Mr. Ndlovu',
        status: 'confirmed',
        currency: 'USD',
        items: [
          {
            id: 'qi-1',
            raw_input: '4 lengths 15mm Copper Pipe',
            item_description: '15mm Copper Pipe',
            quantity: 4,
            unit: 'lengths',
            unit_price: 18.5,
            line_total: 74,
            matched_from_library: true,
          },
        ],
        subtotal: 74,
        total_amount: 74,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };

  localStorage.setItem('shucadea_manager_live_data_v1', JSON.stringify(legacyLiveState));

  // 2. Execute migration
  const migrationResult = await shucadeaDB.migrateFromLocalStorageIfNeeded();
  console.log('Migration Result:', migrationResult);

  if (!migrationResult.success) {
    throw new Error('Migration did not trigger or succeed when legacy data was present');
  }

  // 3. Verify safety pre-migration backup was preserved
  const preBackup = localStorage.getItem(LS_MIGRATION_BACKUP_KEY);
  if (!preBackup) {
    throw new Error('Pre-migration backup was NOT created in localStorage under ' + LS_MIGRATION_BACKUP_KEY);
  }
  console.log('Pre-migration backup verified intact:', LS_MIGRATION_BACKUP_KEY);

  // 4. Verify data in IndexedDB
  const loadedState = await shucadeaDB.loadLiveState();
  if (loadedState.settings.business_name !== 'Shucadea Hardware Bulawayo') {
    throw new Error(`Expected business name 'Shucadea Hardware Bulawayo', got '${loadedState.settings.business_name}'`);
  }
  if (loadedState.whiteBatches.length !== 1 || loadedState.whiteBatches[0].batch_number !== 'BATCH-2025-01') {
    throw new Error('White batches not migrated properly');
  }
  if (loadedState.brownPurchases.length !== 1) {
    throw new Error('Brown purchases not migrated properly');
  }
  if (loadedState.priceLibrary.length !== 1 || loadedState.priceLibrary[0].product_name !== '15mm Copper Pipe') {
    throw new Error('Price library not migrated properly');
  }
  if (loadedState.quotations.length !== 1 || loadedState.quotations[0].quotation_number !== 'Q-2025-001') {
    throw new Error('Quotations not migrated properly');
  }
  console.log('IndexedDB record integrity verified: all entities matched.');

  // 5. Test Export and Import cycle via storage
  await storage.init();
  const exportedJson = await storage.exportBackupJson();
  const validation = storage.validateBackup(exportedJson);
  if (!validation.valid || validation.summary?.quotationCount !== 1) {
    throw new Error('Exported JSON failed validation');
  }
  console.log('Export validation succeeded.');

  // 6. Test Import replacement with pre-restore safety snapshot
  const restoreResult = await storage.importBackupJson(exportedJson);
  if (!restoreResult.success) {
    throw new Error('Restore failed: ' + restoreResult.error);
  }
  const preRestore = localStorage.getItem('shucadea_auto_pre_restore_backup');
  if (!preRestore) {
    throw new Error('Auto pre-restore backup was not recorded');
  }
  console.log('Pre-restore backup snapshot verified.');

  console.log('ALL INDEXEDDB & MIGRATION TESTS PASSED PERFECTLY!');
}

run().catch((err) => {
  console.error('Migration Test Failed:', err);
  process.exit(1);
});
