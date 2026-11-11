/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Shucadea Manager — Persistent Storage Manager
 * Uses IndexedDB as the primary source of truth with in-memory write-through caching.
 */

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
import { DEFAULT_BUSINESS_SETTINGS } from '../constants';
import { multMoney, subMoney, addMoney } from '../utils/math';
import { shucadeaDB, MigrationSummary } from './db';

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  summary?: {
    exportDate?: string;
    quotationCount: number;
    priceLibraryCount: number;
    whiteBatchesCount: number;
    brownPurchasesCount: number;
    transactionsCount: number;
    dailyClosingsCount: number;
  };
}

class StorageManager {
  private memoryState: AppDatabaseState | null = null;
  private isInitializing: Promise<AppDatabaseState> | null = null;

  constructor() {
    // Initial sync bootstrap
  }

  /**
   * Initializes IndexedDB, handles safe migration from localStorage,
   * and loads state into memory cache.
   */
  public async init(): Promise<AppDatabaseState> {
    if (this.isInitializing) {
      return this.isInitializing;
    }

    this.isInitializing = (async () => {
      try {
        // Run migration check first
        await shucadeaDB.migrateFromLocalStorageIfNeeded();

        // Load settings to check demo mode
        const live = await shucadeaDB.loadLiveState();
        if (live.settings.is_demo_mode) {
          this.memoryState = await shucadeaDB.loadDemoState(live.settings);
        } else {
          this.memoryState = live;
        }

        return this.memoryState;
      } catch (err) {
        console.error('Failed to initialize IndexedDB storage:', err);
        // Fallback to defaults in memory if DB fails
        this.memoryState = {
          settings: DEFAULT_BUSINESS_SETTINGS,
          whiteBatches: [],
          whiteSales: [],
          brownPurchases: [],
          brownSales: [],
          brownWithdrawals: [],
          doorTransactions: [],
          hardwareTransactions: [],
          dailyClosings: [],
          priceLibrary: [],
          quotations: [],
        };
        return this.memoryState;
      } finally {
        this.isInitializing = null;
      }
    })();

    return this.isInitializing;
  }

  /**
   * Synchronous getter for in-memory state
   */
  public getState(): AppDatabaseState {
    if (!this.memoryState) {
      // Return safe empty state while DB is resolving
      return {
        settings: DEFAULT_BUSINESS_SETTINGS,
        whiteBatches: [],
        whiteSales: [],
        brownPurchases: [],
        brownSales: [],
        brownWithdrawals: [],
        doorTransactions: [],
        hardwareTransactions: [],
        dailyClosings: [],
        priceLibrary: [],
        quotations: [],
      };
    }
    return this.memoryState;
  }

  public getMigrationStatus(): MigrationSummary | null {
    return shucadeaDB.getMigrationStatus();
  }

  /**
   * Save Business Settings
   */
  public async saveSettings(settings: BusinessSettings): Promise<void> {
    const state = this.getState();
    state.settings = settings;
    await shucadeaDB.saveSettings(settings);
    if (settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    }
  }

  /**
   * Toggle between Demo mode and Live mode
   */
  public async toggleDemoMode(enableDemo: boolean): Promise<AppDatabaseState> {
    const state = this.getState();
    state.settings.is_demo_mode = enableDemo;
    await shucadeaDB.saveSettings(state.settings);

    if (enableDemo) {
      this.memoryState = await shucadeaDB.loadDemoState(state.settings);
    } else {
      this.memoryState = await shucadeaDB.loadLiveState();
    }

    return this.memoryState;
  }

  // ==========================================
  // WHITE DOORS ACTIONS
  // ==========================================

  public async createWhiteBatch(data: {
    batch_number: string;
    purchase_date: string;
    quantity_purchased: number;
    purchase_price_per_door: number;
    transport_cost: number;
    notes?: string;
  }): Promise<WhiteDoorBatch> {
    const state = this.getState();
    const totalCost = multMoney(data.purchase_price_per_door, data.quantity_purchased);

    const newBatch: WhiteDoorBatch = {
      id: `wb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      batch_number: data.batch_number,
      purchase_date: data.purchase_date,
      quantity_purchased: data.quantity_purchased,
      purchase_price_per_door: data.purchase_price_per_door,
      total_purchase_cost: totalCost,
      transport_cost: data.transport_cost,
      quantity_sold: 0,
      quantity_remaining: data.quantity_purchased,
      damaged_doors: 0,
      returned_doors: 0,
      total_collected_revenue: 0,
      unpaid_sales_amount: 0,
      gross_profit: 0,
      net_profit: subMoney(0, data.transport_cost),
      status: 'active',
      notes: data.notes,
      created_at: new Date().toISOString(),
    };

    state.whiteBatches.unshift(newBatch);

    const tx1: FinancialTransaction = {
      id: `dt-${Date.now()}-1`,
      date: data.purchase_date,
      business_segment: 'doors',
      door_type: 'white',
      type: 'expense',
      category: 'Stock Restock',
      amount: totalCost,
      payment_method: 'cash',
      description: `Purchased ${data.quantity_purchased} White Doors @ $${data.purchase_price_per_door} (Batch ${data.batch_number})`,
      reference_id: newBatch.id,
      is_personal_withdrawal: false,
      created_at: new Date().toISOString(),
    };
    state.doorTransactions.unshift(tx1);

    let tx2: FinancialTransaction | null = null;
    if (data.transport_cost > 0) {
      tx2 = {
        id: `dt-${Date.now()}-2`,
        date: data.purchase_date,
        business_segment: 'doors',
        door_type: 'white',
        type: 'expense',
        category: 'Transport',
        amount: data.transport_cost,
        payment_method: 'cash',
        description: `Transport fee for White Doors Batch ${data.batch_number}`,
        reference_id: newBatch.id,
        is_personal_withdrawal: false,
        created_at: new Date().toISOString(),
      };
      state.doorTransactions.unshift(tx2);
    }

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('white_batches', newBatch);
      await shucadeaDB.putItem('door_transactions', tx1);
      if (tx2) await shucadeaDB.putItem('door_transactions', tx2);
    }

    return newBatch;
  }

  public async recordWhiteSale(
    saleData: Omit<WhiteDoorSale, 'id' | 'created_at' | 'total_amount' | 'outstanding_balance'>
  ): Promise<WhiteDoorSale> {
    const state = this.getState();
    const batch = state.whiteBatches.find((b) => b.id === saleData.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const totalAmount = multMoney(saleData.unit_price, saleData.quantity);
    const outstanding = Math.max(0, subMoney(totalAmount, saleData.amount_received));

    const newSale: WhiteDoorSale = {
      id: `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...saleData,
      total_amount: totalAmount,
      outstanding_balance: outstanding,
      created_at: new Date().toISOString(),
    };

    state.whiteSales.unshift(newSale);
    this.recalculateBatch(batch.id);

    let incomeTx: FinancialTransaction | null = null;
    if (saleData.amount_received > 0) {
      incomeTx = {
        id: `dt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: saleData.sale_date,
        business_segment: 'doors',
        door_type: 'white',
        type: 'income',
        category: 'Door Sale',
        amount: saleData.amount_received,
        payment_method: saleData.payment_method,
        description: `White Door Sale: ${saleData.quantity} doors (${saleData.channel}) - Batch ${batch.batch_number}`,
        reference_id: newSale.id,
        is_personal_withdrawal: false,
        created_at: new Date().toISOString(),
      };
      state.doorTransactions.unshift(incomeTx);
    }

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('white_sales', newSale);
      await shucadeaDB.putItem('white_batches', batch);
      if (incomeTx) await shucadeaDB.putItem('door_transactions', incomeTx);
    }

    return newSale;
  }

  public async updateWhiteBatchDamages(
    batchId: string,
    damagedDelta: number,
    returnedDelta: number
  ): Promise<void> {
    const state = this.getState();
    const batch = state.whiteBatches.find((b) => b.id === batchId);
    if (!batch) return;

    batch.damaged_doors = Math.max(0, (batch.damaged_doors || 0) + damagedDelta);
    batch.returned_doors = Math.max(0, (batch.returned_doors || 0) + returnedDelta);
    this.recalculateBatch(batchId);

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('white_batches', batch);
    }
  }

  private recalculateBatch(batchId: string): void {
    const state = this.getState();
    const batch = state.whiteBatches.find((b) => b.id === batchId);
    if (!batch) return;

    const sales = state.whiteSales.filter((s) => s.batch_id === batchId);
    const quantitySold = sales.reduce((acc, s) => acc + s.quantity, 0);
    const totalCollected = sales.reduce((acc, s) => addMoney(acc, s.amount_received), 0);
    const totalUnpaid = sales.reduce((acc, s) => addMoney(acc, s.outstanding_balance), 0);

    const remaining = Math.max(
      0,
      batch.quantity_purchased - quantitySold - (batch.damaged_doors || 0) + (batch.returned_doors || 0)
    );

    const grossProfit = sales.reduce((acc, s) => {
      const margin = subMoney(s.unit_price, batch.purchase_price_per_door);
      return addMoney(acc, multMoney(margin, s.quantity));
    }, 0);

    const netProfit = subMoney(grossProfit, batch.transport_cost);

    batch.quantity_sold = quantitySold;
    batch.quantity_remaining = remaining;
    batch.total_collected_revenue = totalCollected;
    batch.unpaid_sales_amount = totalUnpaid;
    batch.gross_profit = grossProfit;
    batch.net_profit = netProfit;
    batch.status = remaining === 0 ? 'depleted' : 'active';
  }

  // ==========================================
  // BROWN DOORS ACTIONS
  // ==========================================

  public async recordBrownPurchase(data: {
    purchase_date: string;
    quantity: number;
    purchase_price_per_door: number;
    supplier_notes?: string;
  }): Promise<BrownDoorPurchase> {
    const state = this.getState();
    const totalCost = multMoney(data.purchase_price_per_door, data.quantity);

    const purchase: BrownDoorPurchase = {
      id: `bp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      purchase_date: data.purchase_date,
      quantity: data.quantity,
      purchase_price_per_door: data.purchase_price_per_door,
      total_cost: totalCost,
      supplier_notes: data.supplier_notes,
      created_at: new Date().toISOString(),
    };

    state.brownPurchases.unshift(purchase);

    const tx: FinancialTransaction = {
      id: `dt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: data.purchase_date,
      business_segment: 'doors',
      door_type: 'brown',
      type: 'expense',
      category: 'Stock Restock',
      amount: totalCost,
      payment_method: 'cash',
      description: `Reinvestment: Purchased ${data.quantity} Brown Doors @ $${data.purchase_price_per_door}`,
      reference_id: purchase.id,
      is_personal_withdrawal: false,
      created_at: new Date().toISOString(),
    };
    state.doorTransactions.unshift(tx);

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('brown_purchases', purchase);
      await shucadeaDB.putItem('door_transactions', tx);
    }

    return purchase;
  }

  public async recordBrownSale(data: {
    sale_date: string;
    customer_name?: string;
    customer_phone?: string;
    quantity: number;
    unit_price: number;
    payment_status: 'paid' | 'partial' | 'credit';
    amount_received: number;
    payment_method: 'cash' | 'ecocash' | 'bank_transfer' | 'other';
    notes?: string;
  }): Promise<BrownDoorSale> {
    const state = this.getState();
    const totalAmount = multMoney(data.unit_price, data.quantity);
    const outstanding = Math.max(0, subMoney(totalAmount, data.amount_received));

    const sale: BrownDoorSale = {
      id: `bs-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...data,
      total_amount: totalAmount,
      outstanding_balance: outstanding,
      created_at: new Date().toISOString(),
    };

    state.brownSales.unshift(sale);

    let tx: FinancialTransaction | null = null;
    if (data.amount_received > 0) {
      tx = {
        id: `dt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        date: data.sale_date,
        business_segment: 'doors',
        door_type: 'brown',
        type: 'income',
        category: 'Door Sale',
        amount: data.amount_received,
        payment_method: data.payment_method,
        description: `Brown Door Sale: ${data.quantity} doors @ $${data.unit_price} each`,
        reference_id: sale.id,
        is_personal_withdrawal: false,
        created_at: new Date().toISOString(),
      };
      state.doorTransactions.unshift(tx);
    }

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('brown_sales', sale);
      if (tx) await shucadeaDB.putItem('door_transactions', tx);
    }

    return sale;
  }

  public async recordBrownWithdrawal(data: {
    withdrawal_date: string;
    amount: number;
    withdrawn_by: string;
    reason: string;
  }): Promise<BrownDoorWithdrawal> {
    const state = this.getState();
    const withdrawal: BrownDoorWithdrawal = {
      id: `bw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...data,
      created_at: new Date().toISOString(),
    };

    state.brownWithdrawals.unshift(withdrawal);

    const tx: FinancialTransaction = {
      id: `dt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: data.withdrawal_date,
      business_segment: 'doors',
      door_type: 'brown',
      type: 'withdrawal',
      category: 'Personal Withdrawal',
      amount: data.amount,
      payment_method: 'cash',
      description: `Personal withdrawal by ${data.withdrawn_by}: ${data.reason}`,
      reference_id: withdrawal.id,
      is_personal_withdrawal: true,
      created_at: new Date().toISOString(),
    };
    state.doorTransactions.unshift(tx);

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('brown_withdrawals', withdrawal);
      await shucadeaDB.putItem('door_transactions', tx);
    }

    return withdrawal;
  }

  // ==========================================
  // FINANCIAL TRANSACTIONS
  // ==========================================

  public async recordTransaction(
    segment: 'doors' | 'hardware',
    tx: Omit<FinancialTransaction, 'id' | 'created_at' | 'business_segment'>
  ): Promise<FinancialTransaction> {
    const state = this.getState();
    const newTx: FinancialTransaction = {
      id: `${segment === 'doors' ? 'dt' : 'ht'}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      business_segment: segment,
      ...tx,
      created_at: new Date().toISOString(),
    };

    if (segment === 'doors') {
      state.doorTransactions.unshift(newTx);
    } else {
      state.hardwareTransactions.unshift(newTx);
    }

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      const store = segment === 'doors' ? 'door_transactions' : 'hardware_transactions';
      await shucadeaDB.putItem(store, newTx);
    }

    return newTx;
  }

  // ==========================================
  // DAILY CLOSING
  // ==========================================

  public async recordDailyClosing(
    closing: Omit<DailyClosing, 'id' | 'created_at' | 'discrepancy'>
  ): Promise<DailyClosing> {
    const state = this.getState();
    const discrepancy = subMoney(closing.actual_cash_counted, closing.expected_cash);

    const newClosing: DailyClosing = {
      id: `dc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...closing,
      discrepancy,
      status: discrepancy === 0 ? 'balanced' : 'discrepancy',
    };

    const existingIndex = state.dailyClosings.findIndex((c) => c.closing_date === closing.closing_date);
    if (existingIndex >= 0) {
      newClosing.audit_history = [
        ...state.dailyClosings[existingIndex].audit_history,
        {
          timestamp: new Date().toISOString(),
          action: 'Closing Updated',
          user: closing.closed_by,
          changes: `Adjusted counted cash to $${closing.actual_cash_counted}. Discrepancy: $${discrepancy}.`,
        },
      ];
      state.dailyClosings[existingIndex] = newClosing;
    } else {
      state.dailyClosings.unshift(newClosing);
    }

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('daily_closings', newClosing);
    }

    return newClosing;
  }

  // ==========================================
  // PRICE LIBRARY & SAFE PRICE UPDATE
  // ==========================================

  public async saveOrUpdatePriceItem(itemData: {
    product_name: string;
    standardized_name: string;
    category: 'plumbing' | 'electrical' | 'building' | 'hardware' | 'other';
    unit: string;
    current_unit_price: number;
    reason?: string;
  }): Promise<PriceItem> {
    const state = this.getState();
    const existingIndex = state.priceLibrary.findIndex(
      (p) =>
        p.standardized_name === itemData.standardized_name ||
        p.product_name.toLowerCase().trim() === itemData.product_name.toLowerCase().trim()
    );

    const now = new Date().toISOString();
    let savedItem: PriceItem;

    if (existingIndex >= 0) {
      const existing = state.priceLibrary[existingIndex];
      if (existing.current_unit_price !== itemData.current_unit_price) {
        existing.previous_prices.unshift({
          price: existing.current_unit_price,
          changed_at: existing.last_updated || now,
          reason: itemData.reason || 'Price adjustment',
        });
      }
      existing.current_unit_price = itemData.current_unit_price;
      existing.unit = itemData.unit || existing.unit;
      existing.category = itemData.category || existing.category;
      existing.last_updated = now.split('T')[0];
      existing.quotation_count = (existing.quotation_count || 1) + 1;
      savedItem = existing;
    } else {
      savedItem = {
        id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        product_name: itemData.product_name,
        standardized_name: itemData.standardized_name,
        category: itemData.category,
        unit: itemData.unit,
        current_unit_price: itemData.current_unit_price,
        previous_prices: [],
        quotation_count: 1,
        last_updated: now.split('T')[0],
        created_at: now,
      };
      state.priceLibrary.unshift(savedItem);
    }

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('price_library', savedItem);
    }

    return savedItem;
  }

  /**
   * Explicitly updates price library from confirmed quotation items
   * Only called when the user explicitly confirms price updates.
   */
  public async batchUpdatePriceLibrary(
    itemsToUpdate: Array<{
      product_name: string;
      standardized_name: string;
      category: 'plumbing' | 'electrical' | 'building' | 'hardware' | 'other';
      unit: string;
      current_unit_price: number;
      reason: string;
    }>
  ): Promise<number> {
    let count = 0;
    for (const item of itemsToUpdate) {
      await this.saveOrUpdatePriceItem(item);
      count++;
    }
    return count;
  }

  public async deletePriceItem(id: string): Promise<void> {
    const state = this.getState();
    state.priceLibrary = state.priceLibrary.filter((p) => p.id !== id);

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.deleteItem('price_library', id);
    }
  }

  // ==========================================
  // QUOTATIONS
  // ==========================================

  public async saveQuotation(
    quote: Omit<Quotation, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Quotation> {
    const state = this.getState();
    const now = new Date().toISOString();

    const newQuote: Quotation = {
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      ...quote,
      created_at: now,
      updated_at: now,
    };

    state.quotations.unshift(newQuote);

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('quotations', newQuote);
    }

    return newQuote;
  }

  public async updateQuotation(id: string, updates: Partial<Quotation>): Promise<Quotation> {
    const state = this.getState();
    const index = state.quotations.findIndex((q) => q.id === id);
    if (index === -1) throw new Error('Quotation not found');

    const updated = {
      ...state.quotations[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    state.quotations[index] = updated;

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.putItem('quotations', updated);
    }

    return updated;
  }

  public async deleteQuotation(id: string): Promise<void> {
    const state = this.getState();
    state.quotations = state.quotations.filter((q) => q.id !== id);

    if (state.settings.is_demo_mode) {
      await shucadeaDB.saveDemoState(state);
    } else {
      await shucadeaDB.deleteItem('quotations', id);
    }
  }

  // ==========================================
  // BACKUP, VALIDATION & RESTORE
  // ==========================================

  public async exportBackupJson(): Promise<string> {
    const state = this.getState();
    const exportTime = new Date().toISOString();

    // Update last backup date
    state.settings.last_backup_date = exportTime;
    await this.saveSettings(state.settings);

    const payload = {
      app: 'SHUCADEA_MANAGER',
      format_version: 1,
      exported_at: exportTime,
      data: state,
    };

    return JSON.stringify(payload, null, 2);
  }

  public validateBackup(jsonString: string): BackupValidationResult {
    try {
      const parsed = JSON.parse(jsonString);
      const data = parsed.data || parsed;

      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'File is not a valid JSON object.' };
      }

      if (!Array.isArray(data.quotations) && !Array.isArray(data.priceLibrary)) {
        return {
          valid: false,
          error: 'File does not contain valid Shucadea business data collections.',
        };
      }

      return {
        valid: true,
        summary: {
          exportDate: parsed.exported_at || new Date().toISOString(),
          quotationCount: Array.isArray(data.quotations) ? data.quotations.length : 0,
          priceLibraryCount: Array.isArray(data.priceLibrary) ? data.priceLibrary.length : 0,
          whiteBatchesCount: Array.isArray(data.whiteBatches) ? data.whiteBatches.length : 0,
          brownPurchasesCount: Array.isArray(data.brownPurchases) ? data.brownPurchases.length : 0,
          transactionsCount:
            (Array.isArray(data.doorTransactions) ? data.doorTransactions.length : 0) +
            (Array.isArray(data.hardwareTransactions) ? data.hardwareTransactions.length : 0),
          dailyClosingsCount: Array.isArray(data.dailyClosings) ? data.dailyClosings.length : 0,
        },
      };
    } catch (e: any) {
      return { valid: false, error: 'JSON parsing failed: ' + (e?.message || 'Invalid syntax') };
    }
  }

  public async importBackupJson(
    jsonString: string
  ): Promise<{ success: boolean; error?: string }> {
    const validation = this.validateBackup(jsonString);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const parsed = JSON.parse(jsonString);
      const data: AppDatabaseState = parsed.data || parsed;

      // 1. Create a safety backup of current state before restoring
      const currentBackup = await this.exportBackupJson();
      try {
        localStorage.setItem(
          'shucadea_auto_pre_restore_backup',
          JSON.stringify({
            created_at: new Date().toISOString(),
            backup: currentBackup,
          })
        );
      } catch (err) {
        console.warn('Could not save pre-restore backup in localStorage', err);
      }

      // 2. Perform atomic replacement in IndexedDB
      await shucadeaDB.replaceAllLiveData(data);

      // 3. Update memory state
      this.memoryState = data;

      return { success: true };
    } catch (err: any) {
      console.error('Failed to import backup:', err);
      return { success: false, error: err?.message || 'Failed to restore backup' };
    }
  }
}

export const storage = new StorageManager();
