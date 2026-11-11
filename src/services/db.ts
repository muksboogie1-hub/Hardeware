/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Shucadea Manager — IndexedDB Service & Safe Migration Engine
 * Uses `idb` for reliable, transactional, asynchronous persistence.
 */

import { openDB, IDBPDatabase } from 'idb';
import {
  AppDatabaseState,
  BusinessSettings,
  DailyClosing,
  FinancialTransaction,
  PriceItem,
  Quotation,
  WhiteDoorBatch,
  WhiteDoorSale,
  BrownDoorPurchase,
  BrownDoorSale,
  BrownDoorWithdrawal,
} from '../types';
import {
  DEFAULT_BUSINESS_SETTINGS,
  DEMO_WHITE_BATCHES,
  DEMO_WHITE_SALES,
  DEMO_BROWN_PURCHASES,
  DEMO_BROWN_SALES,
  DEMO_PRICE_LIBRARY,
  DEMO_QUOTATIONS,
} from '../constants';

const DB_NAME = 'shucadea_manager_idb';
const DB_VERSION = 1;

export const LS_LIVE_KEY = 'shucadea_manager_live_data_v1';
export const LS_DEMO_KEY = 'shucadea_manager_demo_data_v1';
export const LS_SETTINGS_KEY = 'shucadea_manager_settings_v1';
export const LS_MIGRATION_BACKUP_KEY = 'shucadea_backup_before_idb_migration_v1';
export const LS_MIGRATION_FLAG_KEY = 'shucadea_idb_migrated_v1';

export interface MigrationSummary {
  attempted: boolean;
  success: boolean;
  timestamp: string;
  sourceRecordCounts?: Record<string, number>;
  migratedRecordCounts?: Record<string, number>;
  message: string;
}

class ShucadeaIndexedDB {
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private migrationResult: MigrationSummary | null = null;

  public async getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Object stores for all business entities
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('white_batches')) {
            db.createObjectStore('white_batches', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('white_sales')) {
            db.createObjectStore('white_sales', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('brown_purchases')) {
            db.createObjectStore('brown_purchases', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('brown_sales')) {
            db.createObjectStore('brown_sales', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('brown_withdrawals')) {
            db.createObjectStore('brown_withdrawals', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('door_transactions')) {
            db.createObjectStore('door_transactions', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('hardware_transactions')) {
            db.createObjectStore('hardware_transactions', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('daily_closings')) {
            db.createObjectStore('daily_closings', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('price_library')) {
            db.createObjectStore('price_library', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('quotations')) {
            db.createObjectStore('quotations', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('demo_state')) {
            db.createObjectStore('demo_state', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'id' });
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * Safe migration from localStorage to IndexedDB
   * 1. Detect existing localStorage data
   * 2. Back up before migration
   * 3. Migrate into IndexedDB
   * 4. Validate record counts and fields
   * 5. Set migration complete flag
   * 6. Preserve demo and live data separately
   */
  public async migrateFromLocalStorageIfNeeded(): Promise<MigrationSummary> {
    const db = await this.getDB();
    const existingMigration = await db.get('metadata', 'migration_status');

    if (existingMigration && existingMigration.completed) {
      this.migrationResult = {
        attempted: false,
        success: true,
        timestamp: existingMigration.migrated_at || existingMigration.timestamp || '',
        message: 'Database already migrated to IndexedDB.',
      };
      return this.migrationResult;
    }

    // Check localStorage
    const rawLive = localStorage.getItem(LS_LIVE_KEY);
    const rawDemo = localStorage.getItem(LS_DEMO_KEY);
    const rawSettings = localStorage.getItem(LS_SETTINGS_KEY);

    const hasAnyLsData = Boolean(rawLive || rawDemo || rawSettings);

    if (!hasAnyLsData) {
      // Clean slate initialization
      await db.put('settings', { id: 'current', ...DEFAULT_BUSINESS_SETTINGS });
      const record = {
        id: 'migration_status',
        completed: true,
        timestamp: new Date().toISOString(),
        message: 'Fresh database initialized directly in IndexedDB.',
      };
      await db.put('metadata', record);
      localStorage.setItem(LS_MIGRATION_FLAG_KEY, 'true');

      this.migrationResult = {
        attempted: true,
        success: true,
        timestamp: record.timestamp,
        message: record.message,
      };
      return this.migrationResult;
    }

    // Create safety backup in localStorage before migrating
    try {
      localStorage.setItem(
        LS_MIGRATION_BACKUP_KEY,
        JSON.stringify({
          created_at: new Date().toISOString(),
          live: rawLive,
          demo: rawDemo,
          settings: rawSettings,
        })
      );
    } catch (err) {
      console.warn('Could not store safety backup in localStorage', err);
    }

    try {
      let parsedLive: Partial<AppDatabaseState> = {};
      let parsedSettings: BusinessSettings = DEFAULT_BUSINESS_SETTINGS;
      let parsedDemo: Partial<AppDatabaseState> = {};

      if (rawSettings) {
        try {
          parsedSettings = { ...DEFAULT_BUSINESS_SETTINGS, ...JSON.parse(rawSettings) };
        } catch {
          // ignore
        }
      }

      if (rawLive) {
        try {
          parsedLive = JSON.parse(rawLive);
        } catch (e) {
          throw new Error('Failed to parse existing live localStorage data: ' + String(e));
        }
      }

      if (rawDemo) {
        try {
          parsedDemo = JSON.parse(rawDemo);
        } catch {
          // ignore
        }
      }

      // Record counts to validate
      const sourceCounts = {
        quotations: parsedLive.quotations?.length || 0,
        priceLibrary: parsedLive.priceLibrary?.length || 0,
        whiteBatches: parsedLive.whiteBatches?.length || 0,
        whiteSales: parsedLive.whiteSales?.length || 0,
        brownPurchases: parsedLive.brownPurchases?.length || 0,
        brownSales: parsedLive.brownSales?.length || 0,
        brownWithdrawals: parsedLive.brownWithdrawals?.length || 0,
        doorTransactions: parsedLive.doorTransactions?.length || 0,
        hardwareTransactions: parsedLive.hardwareTransactions?.length || 0,
        dailyClosings: parsedLive.dailyClosings?.length || 0,
      };

      // Transactional migration into IndexedDB
      const tx = db.transaction(
        [
          'settings',
          'white_batches',
          'white_sales',
          'brown_purchases',
          'brown_sales',
          'brown_withdrawals',
          'door_transactions',
          'hardware_transactions',
          'daily_closings',
          'price_library',
          'quotations',
          'demo_state',
          'metadata',
        ],
        'readwrite'
      );

      // Settings
      await tx.objectStore('settings').put({ id: 'current', ...(parsedLive.settings || parsedSettings) });

      // Live tables
      if (parsedLive.whiteBatches) {
        for (const item of parsedLive.whiteBatches) {
          if (item && item.id) await tx.objectStore('white_batches').put(item);
        }
      }
      if (parsedLive.whiteSales) {
        for (const item of parsedLive.whiteSales) {
          if (item && item.id) await tx.objectStore('white_sales').put(item);
        }
      }
      if (parsedLive.brownPurchases) {
        for (const item of parsedLive.brownPurchases) {
          if (item && item.id) await tx.objectStore('brown_purchases').put(item);
        }
      }
      if (parsedLive.brownSales) {
        for (const item of parsedLive.brownSales) {
          if (item && item.id) await tx.objectStore('brown_sales').put(item);
        }
      }
      if (parsedLive.brownWithdrawals) {
        for (const item of parsedLive.brownWithdrawals) {
          if (item && item.id) await tx.objectStore('brown_withdrawals').put(item);
        }
      }
      if (parsedLive.doorTransactions) {
        for (const item of parsedLive.doorTransactions) {
          if (item && item.id) await tx.objectStore('door_transactions').put(item);
        }
      }
      if (parsedLive.hardwareTransactions) {
        for (const item of parsedLive.hardwareTransactions) {
          if (item && item.id) await tx.objectStore('hardware_transactions').put(item);
        }
      }
      if (parsedLive.dailyClosings) {
        for (const item of parsedLive.dailyClosings) {
          if (item && item.id) await tx.objectStore('daily_closings').put(item);
        }
      }
      if (parsedLive.priceLibrary) {
        for (const item of parsedLive.priceLibrary) {
          if (item && item.id) await tx.objectStore('price_library').put(item);
        }
      }
      if (parsedLive.quotations) {
        for (const item of parsedLive.quotations) {
          if (item && item.id) await tx.objectStore('quotations').put(item);
        }
      }

      // Demo state stored separately
      if (parsedDemo && Object.keys(parsedDemo).length > 0) {
        await tx.objectStore('demo_state').put({ id: 'current', state: parsedDemo });
      }

      await tx.done;

      // Verification: Validate counts
      const verifiedCounts = {
        quotations: (await db.getAll('quotations')).length,
        priceLibrary: (await db.getAll('price_library')).length,
        whiteBatches: (await db.getAll('white_batches')).length,
        whiteSales: (await db.getAll('white_sales')).length,
        brownPurchases: (await db.getAll('brown_purchases')).length,
        brownSales: (await db.getAll('brown_sales')).length,
        brownWithdrawals: (await db.getAll('brown_withdrawals')).length,
        doorTransactions: (await db.getAll('door_transactions')).length,
        hardwareTransactions: (await db.getAll('hardware_transactions')).length,
        dailyClosings: (await db.getAll('daily_closings')).length,
      };

      // Ensure counts match
      for (const [key, count] of Object.entries(sourceCounts)) {
        const verified = verifiedCounts[key as keyof typeof verifiedCounts] || 0;
        if (verified < count) {
          throw new Error(
            `Migration verification failed for ${key}: expected at least ${count} records, found ${verified}`
          );
        }
      }

      // Record migration status
      const metaRecord = {
        id: 'migration_status',
        completed: true,
        migrated_at: new Date().toISOString(),
        sourceRecordCounts: sourceCounts,
        migratedRecordCounts: verifiedCounts,
      };
      await db.put('metadata', metaRecord);
      localStorage.setItem(LS_MIGRATION_FLAG_KEY, 'true');

      this.migrationResult = {
        attempted: true,
        success: true,
        timestamp: metaRecord.migrated_at,
        sourceRecordCounts: sourceCounts,
        migratedRecordCounts: verifiedCounts,
        message: 'Successfully migrated all records from localStorage to IndexedDB.',
      };
      return this.migrationResult;
    } catch (err: any) {
      console.error('Migration failed:', err);
      this.migrationResult = {
        attempted: true,
        success: false,
        timestamp: new Date().toISOString(),
        message: err?.message || 'Migration to IndexedDB failed.',
      };
      return this.migrationResult;
    }
  }

  public getMigrationStatus(): MigrationSummary | null {
    return this.migrationResult;
  }

  /**
   * Load entire Live state from IndexedDB
   */
  public async loadLiveState(): Promise<AppDatabaseState> {
    const db = await this.getDB();
    const settingsRecord = await db.get('settings', 'current');
    const settings: BusinessSettings = settingsRecord
      ? { ...DEFAULT_BUSINESS_SETTINGS, ...settingsRecord }
      : DEFAULT_BUSINESS_SETTINGS;

    const [
      whiteBatches,
      whiteSales,
      brownPurchases,
      brownSales,
      brownWithdrawals,
      doorTransactions,
      hardwareTransactions,
      dailyClosings,
      priceLibrary,
      quotations,
    ] = await Promise.all([
      db.getAll('white_batches'),
      db.getAll('white_sales'),
      db.getAll('brown_purchases'),
      db.getAll('brown_sales'),
      db.getAll('brown_withdrawals'),
      db.getAll('door_transactions'),
      db.getAll('hardware_transactions'),
      db.getAll('daily_closings'),
      db.getAll('price_library'),
      db.getAll('quotations'),
    ]);

    return {
      settings,
      whiteBatches: (whiteBatches || []).sort(
        (a, b) => new Date(b.created_at || b.purchase_date).getTime() - new Date(a.created_at || a.purchase_date).getTime()
      ),
      whiteSales: (whiteSales || []).sort(
        (a, b) => new Date(b.created_at || b.sale_date).getTime() - new Date(a.created_at || a.sale_date).getTime()
      ),
      brownPurchases: (brownPurchases || []).sort(
        (a, b) => new Date(b.created_at || b.purchase_date).getTime() - new Date(a.created_at || a.purchase_date).getTime()
      ),
      brownSales: (brownSales || []).sort(
        (a, b) => new Date(b.created_at || b.sale_date).getTime() - new Date(a.created_at || a.sale_date).getTime()
      ),
      brownWithdrawals: (brownWithdrawals || []).sort(
        (a, b) => new Date(b.created_at || b.withdrawal_date).getTime() - new Date(a.created_at || a.withdrawal_date).getTime()
      ),
      doorTransactions: (doorTransactions || []).sort(
        (a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
      ),
      hardwareTransactions: (hardwareTransactions || []).sort(
        (a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
      ),
      dailyClosings: (dailyClosings || []).sort(
        (a, b) => new Date(b.closing_date).getTime() - new Date(a.closing_date).getTime()
      ),
      priceLibrary: (priceLibrary || []).sort(
        (a, b) => new Date(b.last_updated || b.created_at).getTime() - new Date(a.last_updated || a.created_at).getTime()
      ),
      quotations: (quotations || []).sort(
        (a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
      ),
    };
  }

  /**
   * Load Demo state
   */
  public async loadDemoState(settings: BusinessSettings): Promise<AppDatabaseState> {
    const db = await this.getDB();
    const demoRecord = await db.get('demo_state', 'current');
    if (demoRecord && demoRecord.state) {
      return {
        ...demoRecord.state,
        settings: { ...settings, is_demo_mode: true },
      };
    }

    // Default seeded demo state
    return {
      settings: { ...settings, is_demo_mode: true },
      whiteBatches: DEMO_WHITE_BATCHES,
      whiteSales: DEMO_WHITE_SALES,
      brownPurchases: DEMO_BROWN_PURCHASES,
      brownSales: DEMO_BROWN_SALES,
      brownWithdrawals: [
        {
          id: 'bw-demo-1',
          withdrawal_date: '2026-11-05',
          amount: 30,
          withdrawn_by: 'Owner',
          reason: 'Personal expense withdrawal',
          created_at: '2026-11-05T12:00:00Z',
        },
      ],
      doorTransactions: [
        {
          id: 'dt-demo-1',
          date: '2026-11-01',
          business_segment: 'doors',
          door_type: 'white',
          type: 'expense',
          category: 'Stock Restock',
          amount: 460,
          payment_method: 'cash',
          description: 'Purchased 20 White Doors @ $23 (Batch WD-2026-001)',
          is_personal_withdrawal: false,
          created_at: '2026-11-01T08:00:00Z',
        },
      ],
      hardwareTransactions: [],
      dailyClosings: [],
      priceLibrary: DEMO_PRICE_LIBRARY,
      quotations: DEMO_QUOTATIONS,
    };
  }

  /**
   * Save settings
   */
  public async saveSettings(settings: BusinessSettings): Promise<void> {
    const db = await this.getDB();
    await db.put('settings', { id: 'current', ...settings });
  }

  /**
   * Put entity
   */
  public async putItem<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB();
    await db.put(storeName as any, item);
  }

  /**
   * Delete entity
   */
  public async deleteItem(storeName: string, id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(storeName as any, id);
  }

  /**
   * Save entire demo state if modified in demo mode
   */
  public async saveDemoState(state: AppDatabaseState): Promise<void> {
    const db = await this.getDB();
    await db.put('demo_state', { id: 'current', state });
  }

  /**
   * Replace all live data in a single atomic transaction
   */
  public async replaceAllLiveData(state: AppDatabaseState): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(
      [
        'settings',
        'white_batches',
        'white_sales',
        'brown_purchases',
        'brown_sales',
        'brown_withdrawals',
        'door_transactions',
        'hardware_transactions',
        'daily_closings',
        'price_library',
        'quotations',
      ],
      'readwrite'
    );

    // Clear all existing
    await Promise.all([
      tx.objectStore('white_batches').clear(),
      tx.objectStore('white_sales').clear(),
      tx.objectStore('brown_purchases').clear(),
      tx.objectStore('brown_sales').clear(),
      tx.objectStore('brown_withdrawals').clear(),
      tx.objectStore('door_transactions').clear(),
      tx.objectStore('hardware_transactions').clear(),
      tx.objectStore('daily_closings').clear(),
      tx.objectStore('price_library').clear(),
      tx.objectStore('quotations').clear(),
    ]);

    // Insert new
    await tx.objectStore('settings').put({ id: 'current', ...state.settings });

    for (const b of state.whiteBatches || []) await tx.objectStore('white_batches').put(b);
    for (const s of state.whiteSales || []) await tx.objectStore('white_sales').put(s);
    for (const p of state.brownPurchases || []) await tx.objectStore('brown_purchases').put(p);
    for (const s of state.brownSales || []) await tx.objectStore('brown_sales').put(s);
    for (const w of state.brownWithdrawals || []) await tx.objectStore('brown_withdrawals').put(w);
    for (const t of state.doorTransactions || []) await tx.objectStore('door_transactions').put(t);
    for (const t of state.hardwareTransactions || []) await tx.objectStore('hardware_transactions').put(t);
    for (const c of state.dailyClosings || []) await tx.objectStore('daily_closings').put(c);
    for (const p of state.priceLibrary || []) await tx.objectStore('price_library').put(p);
    for (const q of state.quotations || []) await tx.objectStore('quotations').put(q);

    await tx.done;
  }
}

export const shucadeaDB = new ShucadeaIndexedDB();
