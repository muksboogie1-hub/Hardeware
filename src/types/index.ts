/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SHUCADEA MANAGER — Type Definitions
 * Shucadea Hardware, Zimbabwe
 */

export type Currency = 'USD' | 'ZiG';

export type Channel = 'facebook' | 'walk-in' | 'other';
export type PaymentStatus = 'paid' | 'partial' | 'credit';
export type PaymentMethod = 'cash' | 'ecocash' | 'bank_transfer' | 'other';

export interface WhiteDoorBatch {
  id: string;
  batch_number: string;
  purchase_date: string;
  quantity_purchased: number;
  purchase_price_per_door: number; // default $23
  total_purchase_cost: number;     // quantity_purchased * purchase_price_per_door
  transport_cost: number;          // default $25 deducted once per batch
  quantity_sold: number;
  quantity_remaining: number;      // quantity_purchased - quantity_sold - damaged_doors + returned_doors
  damaged_doors: number;
  returned_doors: number;
  total_collected_revenue: number; // actual cash/money received
  unpaid_sales_amount: number;     // outstanding balances from partial/credit
  gross_profit: number;            // revenue of sold doors minus their purchase cost
  net_profit: number;              // gross_profit minus transport_cost
  status: 'active' | 'depleted' | 'archived';
  notes?: string;
  created_at: string;
}

export interface WhiteDoorSale {
  id: string;
  batch_id: string;
  batch_number: string;
  sale_date: string;
  customer_name?: string;
  customer_phone?: string;
  quantity: number;
  unit_price: number;              // actual selling price ($26 FB, $27 walk-in, or custom)
  total_amount: number;            // quantity * unit_price
  channel: Channel;
  payment_status: PaymentStatus;
  amount_received: number;
  outstanding_balance: number;     // total_amount - amount_received
  payment_method: PaymentMethod;
  notes?: string;
  created_at: string;
}

export interface BrownDoorPurchase {
  id: string;
  purchase_date: string;
  quantity: number;
  purchase_price_per_door: number; // default $14
  total_cost: number;              // quantity * 14
  supplier_notes?: string;
  created_at: string;
}

export interface BrownDoorSale {
  id: string;
  sale_date: string;
  customer_name?: string;
  customer_phone?: string;
  quantity: number;
  unit_price: number;              // default $18
  total_amount: number;
  payment_status: PaymentStatus;
  amount_received: number;
  outstanding_balance: number;
  payment_method: PaymentMethod;
  notes?: string;
  created_at: string;
}

export interface BrownDoorWithdrawal {
  id: string;
  withdrawal_date: string;
  amount: number;
  withdrawn_by: string;
  reason: string;
  created_at: string;
}

export type TransactionSegment = 'doors' | 'hardware';
export type DoorType = 'white' | 'brown' | 'general';
export type TransactionType = 'income' | 'expense' | 'withdrawal' | 'transfer';

export interface FinancialTransaction {
  id: string;
  date: string;
  business_segment: TransactionSegment;
  door_type?: DoorType;
  type: TransactionType;
  category: string; // 'Door Sale', 'Stock Restock', 'Transport', 'Labour', 'Personal Withdrawal', 'Damaged Stock', 'Customer Refund', 'Operating Expense', 'Customer Payment'
  amount: number;
  payment_method: PaymentMethod;
  reference_id?: string;
  description: string;
  notes?: string;
  is_personal_withdrawal: boolean;
  created_at: string;
}

export interface DailyClosingAuditEntry {
  timestamp: string;
  action: string;
  user: string;
  changes: string;
}

export interface DailyClosing {
  id: string;
  closing_date: string;
  closed_at: string;
  white_doors_sold: number;
  brown_doors_sold: number;
  sales_revenue: number;
  collected_cash: number;
  outstanding_payments: number;
  transport_expenses: number;
  other_expenses: number;
  personal_withdrawals: number;
  expected_cash: number;           // collected_cash - expenses - personal_withdrawals (from day's physical cash)
  actual_cash_counted: number;
  discrepancy: number;             // actual_cash_counted - expected_cash
  discrepancy_explanation?: string;
  closed_by: string;
  status: 'balanced' | 'discrepancy' | 'investigating';
  audit_history: DailyClosingAuditEntry[];
}

export type ProductCategory = 'plumbing' | 'electrical' | 'building' | 'hardware' | 'other';

export interface PriceHistoryRecord {
  price: number;
  changed_at: string;
  reason?: string;
}

export interface PriceItem {
  id: string;
  product_name: string;
  standardized_name: string;
  category: ProductCategory;
  unit: string;
  current_unit_price: number;
  previous_prices: PriceHistoryRecord[];
  quotation_count: number;
  last_updated: string;
  created_at: string;
}

export interface QuotationLineItem {
  id: string;
  raw_input?: string;
  item_description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  matched_from_library: boolean;
}

export type QuotationStatus = 'draft' | 'confirmed' | 'accepted' | 'declined' | 'invoiced';

export interface Quotation {
  id: string;
  quotation_number: string;
  date: string;
  valid_until?: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  items: QuotationLineItem[];
  subtotal: number;
  discount: number;
  grand_total: number;
  status: QuotationStatus;
  notes?: string;
  raw_pasted_text?: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessSettings {
  business_name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  currency: Currency;
  default_white_purchase_price: number; // 23
  default_white_transport: number;      // 25
  default_white_fb_price: number;       // 26
  default_white_walkin_price: number;   // 27
  default_brown_purchase_price: number; // 14
  default_brown_selling_price: number;  // 18
  supabase_url: string;
  supabase_anon_key: string;
  is_demo_mode: boolean;
}

export interface AppDatabaseState {
  settings: BusinessSettings;
  whiteBatches: WhiteDoorBatch[];
  whiteSales: WhiteDoorSale[];
  brownPurchases: BrownDoorPurchase[];
  brownSales: BrownDoorSale[];
  brownWithdrawals: BrownDoorWithdrawal[];
  doorTransactions: FinancialTransaction[];
  hardwareTransactions: FinancialTransaction[];
  dailyClosings: DailyClosing[];
  priceLibrary: PriceItem[];
  quotations: Quotation[];
}
