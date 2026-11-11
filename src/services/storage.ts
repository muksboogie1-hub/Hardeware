/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Persistent Storage & Supabase Sync Engine for Shucadea Manager
 * Guarantees local-first offline availability, safe storage, and Supabase integration.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
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
  AppDatabaseState,
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
import { multMoney, subMoney, addMoney } from '../utils/math';

const LIVE_STORAGE_KEY = 'shucadea_manager_live_data_v1';
const DEMO_STORAGE_KEY = 'shucadea_manager_demo_data_v1';
const SETTINGS_STORAGE_KEY = 'shucadea_manager_settings_v1';

function getInitialEmptyLiveState(settings: BusinessSettings): AppDatabaseState {
  return {
    settings,
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

function getInitialDemoState(settings: BusinessSettings): AppDatabaseState {
  // Precompute demo transactions
  const doorTransactions: FinancialTransaction[] = [
    {
      id: 'dt-1',
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
    {
      id: 'dt-2',
      date: '2026-11-01',
      business_segment: 'doors',
      door_type: 'white',
      type: 'expense',
      category: 'Transport',
      amount: 25,
      payment_method: 'cash',
      description: 'Transport for 20 White Doors (Batch WD-2026-001)',
      is_personal_withdrawal: false,
      created_at: '2026-11-01T08:15:00Z',
    },
    {
      id: 'dt-3',
      date: '2026-11-01',
      business_segment: 'doors',
      door_type: 'brown',
      type: 'expense',
      category: 'Stock Restock',
      amount: 140,
      payment_method: 'cash',
      description: 'Purchased 10 Brown Doors @ $14 (Initial capacity)',
      is_personal_withdrawal: false,
      created_at: '2026-11-01T08:30:00Z',
    },
    {
      id: 'dt-4',
      date: '2026-11-04',
      business_segment: 'doors',
      door_type: 'white',
      type: 'income',
      category: 'Door Sale',
      amount: 528,
      payment_method: 'cash',
      description: 'Collected revenue from Batch WD-2026-001 (12 FB @ $26, 8 Walk-in @ $27)',
      is_personal_withdrawal: false,
      created_at: '2026-11-04T15:00:00Z',
    },
    {
      id: 'dt-5',
      date: '2026-11-04',
      business_segment: 'doors',
      door_type: 'brown',
      type: 'income',
      category: 'Door Sale',
      amount: 180,
      payment_method: 'cash',
      description: 'Sold 10 Brown Doors @ $18 each',
      is_personal_withdrawal: false,
      created_at: '2026-11-04T16:00:00Z',
    },
    {
      id: 'dt-6',
      date: '2026-11-05',
      business_segment: 'doors',
      door_type: 'brown',
      type: 'withdrawal',
      category: 'Personal Withdrawal',
      amount: 30,
      payment_method: 'cash',
      description: 'Personal withdrawal by owner (kept separate from operating expenses)',
      is_personal_withdrawal: true,
      created_at: '2026-11-05T12:00:00Z',
    },
  ];

  const hardwareTransactions: FinancialTransaction[] = [
    {
      id: 'ht-1',
      date: '2026-11-03',
      business_segment: 'hardware',
      type: 'income',
      category: 'Hardware Sale',
      amount: 104.50,
      payment_method: 'cash',
      description: 'Quotation SH-2026-0084 paid in cash (PVC pipes & fittings)',
      is_personal_withdrawal: false,
      created_at: '2026-11-03T11:30:00Z',
    },
    {
      id: 'ht-2',
      date: '2026-11-04',
      business_segment: 'hardware',
      type: 'expense',
      category: 'Operating Expense',
      amount: 20,
      payment_method: 'cash',
      description: 'Shop lighting repair & electrical tape',
      is_personal_withdrawal: false,
      created_at: '2026-11-04T10:00:00Z',
    },
  ];

  const dailyClosings: DailyClosing[] = [
    {
      id: 'close-1',
      closing_date: '2026-11-09',
      closed_at: '2026-11-09T18:00:00Z',
      white_doors_sold: 5,
      brown_doors_sold: 6,
      sales_revenue: 238, // 5*26 (130) + 6*18 (108)
      collected_cash: 238,
      outstanding_payments: 0,
      transport_expenses: 0,
      other_expenses: 15, // shop consumable
      personal_withdrawals: 0,
      expected_cash: 223, // 238 - 15
      actual_cash_counted: 223,
      discrepancy: 0,
      closed_by: 'Shop Manager',
      status: 'balanced',
      audit_history: [
        {
          timestamp: '2026-11-09T18:00:00Z',
          action: 'Daily Closing Created',
          user: 'Shop Manager',
          changes: 'Closed with zero discrepancy. Cash in drawer: $223.',
        },
      ],
    },
  ];

  return {
    settings,
    whiteBatches: DEMO_WHITE_BATCHES,
    whiteSales: DEMO_WHITE_SALES,
    brownPurchases: DEMO_BROWN_PURCHASES,
    brownSales: DEMO_BROWN_SALES,
    brownWithdrawals: [
      {
        id: 'bw-1',
        withdrawal_date: '2026-11-05',
        amount: 30,
        withdrawn_by: 'Owner',
        reason: 'Personal expense withdrawal',
        created_at: '2026-11-05T12:00:00Z',
      },
    ],
    doorTransactions,
    hardwareTransactions,
    dailyClosings,
    priceLibrary: DEMO_PRICE_LIBRARY,
    quotations: DEMO_QUOTATIONS,
  };
}

class StorageManager {
  private memoryState: AppDatabaseState | null = null;
  private supabaseClient: SupabaseClient | null = null;

  constructor() {
    this.init();
  }

  private loadSettings(): BusinessSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_BUSINESS_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_BUSINESS_SETTINGS;
  }

  public saveSettings(settings: BusinessSettings): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      if (this.memoryState) {
        this.memoryState.settings = settings;
        this.persist();
      }
      this.reconnectSupabase(settings.supabase_url, settings.supabase_anon_key);
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }

  public reconnectSupabase(url: string, key: string): SupabaseClient | null {
    if (url && key) {
      try {
        this.supabaseClient = createClient(url, key);
        return this.supabaseClient;
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
      }
    }
    this.supabaseClient = null;
    return null;
  }

  public getSupabase(): SupabaseClient | null {
    return this.supabaseClient;
  }

  public init(): AppDatabaseState {
    const settings = this.loadSettings();
    if (settings.supabase_url && settings.supabase_anon_key) {
      this.reconnectSupabase(settings.supabase_url, settings.supabase_anon_key);
    }

    const key = settings.is_demo_mode ? DEMO_STORAGE_KEY : LIVE_STORAGE_KEY;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.memoryState = {
          ...parsed,
          settings,
        };
        return this.memoryState!;
      }
    } catch {
      // ignore
    }

    // Default initialization
    this.memoryState = settings.is_demo_mode
      ? getInitialDemoState(settings)
      : getInitialEmptyLiveState(settings);

    this.persist();
    return this.memoryState;
  }

  public getState(): AppDatabaseState {
    if (!this.memoryState) {
      return this.init();
    }
    return this.memoryState;
  }

  public toggleDemoMode(enableDemo: boolean): AppDatabaseState {
    const currentSettings = this.loadSettings();
    currentSettings.is_demo_mode = enableDemo;
    this.saveSettings(currentSettings);
    return this.init();
  }

  private persist(): void {
    if (!this.memoryState) return;
    const key = this.memoryState.settings.is_demo_mode ? DEMO_STORAGE_KEY : LIVE_STORAGE_KEY;
    try {
      localStorage.setItem(key, JSON.stringify(this.memoryState));
    } catch (e) {
      console.error('Failed to persist to localStorage', e);
    }
  }

  // ==========================================
  // WHITE DOORS ACTIONS
  // ==========================================

  public createWhiteBatch(data: {
    batch_number: string;
    purchase_date: string;
    quantity_purchased: number;
    purchase_price_per_door: number;
    transport_cost: number;
    notes?: string;
  }): WhiteDoorBatch {
    const state = this.getState();
    const totalCost = multMoney(data.purchase_price_per_door, data.quantity_purchased);

    const newBatch: WhiteDoorBatch = {
      id: `wb-${Date.now()}`,
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
      net_profit: subMoney(0, data.transport_cost), // Net profit begins with transport deducted
      status: 'active',
      notes: data.notes,
      created_at: new Date().toISOString(),
    };

    state.whiteBatches.unshift(newBatch);

    // Auto-record purchase and transport in door transaction ledger
    state.doorTransactions.unshift({
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
    });

    if (data.transport_cost > 0) {
      state.doorTransactions.unshift({
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
      });
    }

    this.persist();
    return newBatch;
  }

  public recordWhiteSale(saleData: Omit<WhiteDoorSale, 'id' | 'created_at' | 'total_amount' | 'outstanding_balance'>): WhiteDoorSale {
    const state = this.getState();
    const batch = state.whiteBatches.find((b) => b.id === saleData.batch_id);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const totalAmount = multMoney(saleData.unit_price, saleData.quantity);
    const outstanding = Math.max(0, subMoney(totalAmount, saleData.amount_received));

    const newSale: WhiteDoorSale = {
      id: `ws-${Date.now()}`,
      ...saleData,
      total_amount: totalAmount,
      outstanding_balance: outstanding,
      created_at: new Date().toISOString(),
    };

    state.whiteSales.unshift(newSale);

    // Update batch totals accurately
    this.recalculateBatch(batch.id);

    // Auto-record collected revenue into transactions
    if (saleData.amount_received > 0) {
      state.doorTransactions.unshift({
        id: `dt-${Date.now()}`,
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
      });
    }

    this.persist();
    return newSale;
  }

  public updateWhiteBatchDamages(batchId: string, damagedDelta: number, returnedDelta: number): void {
    const state = this.getState();
    const batch = state.whiteBatches.find((b) => b.id === batchId);
    if (!batch) return;

    batch.damaged_doors = Math.max(0, (batch.damaged_doors || 0) + damagedDelta);
    batch.returned_doors = Math.max(0, (batch.returned_doors || 0) + returnedDelta);
    this.recalculateBatch(batchId);
    this.persist();
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

    // Gross profit = sum of (sale.unit_price - batch.purchase_price_per_door) * sale.quantity
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

  public recordBrownPurchase(data: {
    purchase_date: string;
    quantity: number;
    purchase_price_per_door: number;
    supplier_notes?: string;
  }): BrownDoorPurchase {
    const state = this.getState();
    const totalCost = multMoney(data.purchase_price_per_door, data.quantity);

    const purchase: BrownDoorPurchase = {
      id: `bp-${Date.now()}`,
      purchase_date: data.purchase_date,
      quantity: data.quantity,
      purchase_price_per_door: data.purchase_price_per_door,
      total_cost: totalCost,
      supplier_notes: data.supplier_notes,
      created_at: new Date().toISOString(),
    };

    state.brownPurchases.unshift(purchase);

    // Record in door ledger
    state.doorTransactions.unshift({
      id: `dt-${Date.now()}`,
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
    });

    this.persist();
    return purchase;
  }

  public recordBrownSale(data: {
    sale_date: string;
    customer_name?: string;
    customer_phone?: string;
    quantity: number;
    unit_price: number;
    payment_status: 'paid' | 'partial' | 'credit';
    amount_received: number;
    payment_method: 'cash' | 'ecocash' | 'bank_transfer' | 'other';
    notes?: string;
  }): BrownDoorSale {
    const state = this.getState();
    const totalAmount = multMoney(data.unit_price, data.quantity);
    const outstanding = Math.max(0, subMoney(totalAmount, data.amount_received));

    const sale: BrownDoorSale = {
      id: `bs-${Date.now()}`,
      ...data,
      total_amount: totalAmount,
      outstanding_balance: outstanding,
      created_at: new Date().toISOString(),
    };

    state.brownSales.unshift(sale);

    if (data.amount_received > 0) {
      state.doorTransactions.unshift({
        id: `dt-${Date.now()}`,
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
      });
    }

    this.persist();
    return sale;
  }

  public recordBrownWithdrawal(data: {
    withdrawal_date: string;
    amount: number;
    withdrawn_by: string;
    reason: string;
  }): BrownDoorWithdrawal {
    const state = this.getState();
    const withdrawal: BrownDoorWithdrawal = {
      id: `bw-${Date.now()}`,
      ...data,
      created_at: new Date().toISOString(),
    };

    state.brownWithdrawals.unshift(withdrawal);

    // Personal withdrawal must be flagged as is_personal_withdrawal: true
    state.doorTransactions.unshift({
      id: `dt-${Date.now()}`,
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
    });

    this.persist();
    return withdrawal;
  }

  // ==========================================
  // FINANCIAL TRANSACTIONS
  // ==========================================

  public recordTransaction(
    segment: 'doors' | 'hardware',
    tx: Omit<FinancialTransaction, 'id' | 'created_at' | 'business_segment'>
  ): FinancialTransaction {
    const state = this.getState();
    const newTx: FinancialTransaction = {
      id: `${segment === 'doors' ? 'dt' : 'ht'}-${Date.now()}`,
      business_segment: segment,
      ...tx,
      created_at: new Date().toISOString(),
    };

    if (segment === 'doors') {
      state.doorTransactions.unshift(newTx);
    } else {
      state.hardwareTransactions.unshift(newTx);
    }

    this.persist();
    return newTx;
  }

  // ==========================================
  // DAILY CLOSING
  // ==========================================

  public recordDailyClosing(closing: Omit<DailyClosing, 'id' | 'created_at' | 'discrepancy'>): DailyClosing {
    const state = this.getState();
    const discrepancy = subMoney(closing.actual_cash_counted, closing.expected_cash);

    const newClosing: DailyClosing = {
      id: `dc-${Date.now()}`,
      ...closing,
      discrepancy,
      status: discrepancy === 0 ? 'balanced' : 'discrepancy',
    };

    // Replace if closing for same date exists, else unshift
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

    this.persist();
    return newClosing;
  }

  // ==========================================
  // PRICE LIBRARY & LEARNING SYSTEM
  // ==========================================

  public saveOrUpdatePriceItem(itemData: {
    product_name: string;
    standardized_name: string;
    category: 'plumbing' | 'electrical' | 'building' | 'hardware' | 'other';
    unit: string;
    current_unit_price: number;
    reason?: string;
  }): PriceItem {
    const state = this.getState();
    const existingIndex = state.priceLibrary.findIndex(
      (p) => p.standardized_name === itemData.standardized_name ||
             p.product_name.toLowerCase().trim() === itemData.product_name.toLowerCase().trim()
    );

    const now = new Date().toISOString();

    if (existingIndex >= 0) {
      const existing = state.priceLibrary[existingIndex];
      // If price changed, push to price history
      if (existing.current_unit_price !== itemData.current_unit_price) {
        existing.previous_prices.unshift({
          price: existing.current_unit_price,
          changed_at: existing.last_updated || now,
          reason: itemData.reason || 'Price update from quotation or manual edit',
        });
      }
      existing.current_unit_price = itemData.current_unit_price;
      existing.unit = itemData.unit || existing.unit;
      existing.category = itemData.category || existing.category;
      existing.last_updated = now.split('T')[0];
      existing.quotation_count = (existing.quotation_count || 1) + 1;
      this.persist();
      return existing;
    } else {
      const newItem: PriceItem = {
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
      state.priceLibrary.unshift(newItem);
      this.persist();
      return newItem;
    }
  }

  public deletePriceItem(id: string): void {
    const state = this.getState();
    state.priceLibrary = state.priceLibrary.filter((p) => p.id !== id);
    this.persist();
  }

  // ==========================================
  // QUOTATIONS
  // ==========================================

  public saveQuotation(quote: Omit<Quotation, 'id' | 'created_at' | 'updated_at'>): Quotation {
    const state = this.getState();
    const now = new Date().toISOString();

    const newQuote: Quotation = {
      id: `q-${Date.now()}`,
      ...quote,
      created_at: now,
      updated_at: now,
    };

    state.quotations.unshift(newQuote);
    this.persist();
    return newQuote;
  }

  public updateQuotation(id: string, updates: Partial<Quotation>): Quotation {
    const state = this.getState();
    const index = state.quotations.findIndex((q) => q.id === id);
    if (index === -1) throw new Error('Quotation not found');

    const updated = {
      ...state.quotations[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    state.quotations[index] = updated;
    this.persist();
    return updated;
  }

  public deleteQuotation(id: string): void {
    const state = this.getState();
    state.quotations = state.quotations.filter((q) => q.id !== id);
    this.persist();
  }

  // ==========================================
  // BACKUP & RESTORE
  // ==========================================

  public exportBackupJson(): string {
    const state = this.getState();
    return JSON.stringify(state, null, 2);
  }

  public importBackupJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.settings) throw new Error('Invalid backup file');
      this.memoryState = parsed;
      this.persist();
      return true;
    } catch (err) {
      console.error('Import failed:', err);
      return false;
    }
  }

  public clearLiveDatabase(): void {
    const settings = this.loadSettings();
    this.memoryState = getInitialEmptyLiveState(settings);
    this.persist();
  }
}

export const storage = new StorageManager();
