-- SHUCADEA MANAGER — MASTER DATABASE SCHEMA & MIGRATIONS
-- Designed for Supabase (PostgreSQL with Row Level Security)
-- Shucadea Hardware, Zimbabwe

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. WHITE DOOR BATCHES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS white_door_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity_purchased INTEGER NOT NULL CHECK (quantity_purchased > 0),
    purchase_price_per_door NUMERIC(10, 2) NOT NULL DEFAULT 23.00,
    total_purchase_cost NUMERIC(10, 2) NOT NULL,
    transport_cost NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    damaged_doors INTEGER NOT NULL DEFAULT 0,
    returned_doors INTEGER NOT NULL DEFAULT 0,
    total_collected_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    unpaid_sales_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    gross_profit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_profit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'archived')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. WHITE DOOR SALES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS white_door_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES white_door_batches(id) ON DELETE RESTRICT,
    batch_number VARCHAR(50) NOT NULL,
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('facebook', 'walk-in', 'other')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'partial', 'credit')),
    amount_received NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    outstanding_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'ecocash', 'bank_transfer', 'other')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. BROWN DOOR INVENTORY & REINVESTMENT SYSTEM
-- ==========================================
CREATE TABLE IF NOT EXISTS brown_door_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    purchase_price_per_door NUMERIC(10, 2) NOT NULL DEFAULT 14.00,
    total_cost NUMERIC(10, 2) NOT NULL,
    supplier_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brown_door_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 18.00,
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'partial', 'credit')),
    amount_received NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    outstanding_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brown_door_withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    withdrawal_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    withdrawn_by VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 4. FINANCIAL TRANSACTIONS LEDGER (SEPARATE SPACES)
-- ==========================================
CREATE TABLE IF NOT EXISTS financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    business_segment VARCHAR(20) NOT NULL CHECK (business_segment IN ('doors', 'hardware')),
    door_type VARCHAR(20) CHECK (door_type IN ('white', 'brown', 'general')),
    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'withdrawal', 'transfer')),
    category VARCHAR(50) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
    reference_id UUID,
    description TEXT NOT NULL,
    notes TEXT,
    is_personal_withdrawal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 5. DAILY CASH CLOSING & RECONCILIATION
-- ==========================================
CREATE TABLE IF NOT EXISTS daily_closings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closing_date DATE NOT NULL UNIQUE,
    white_doors_sold INTEGER NOT NULL DEFAULT 0,
    brown_doors_sold INTEGER NOT NULL DEFAULT 0,
    sales_revenue NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    collected_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    outstanding_payments NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    transport_expenses NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    other_expenses NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    personal_withdrawals NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expected_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_cash_counted NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discrepancy NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discrepancy_explanation TEXT,
    closed_by VARCHAR(100) NOT NULL DEFAULT 'Manager',
    audit_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 6. LEARNING PRICE LIBRARY
-- ==========================================
CREATE TABLE IF NOT EXISTS price_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name VARCHAR(255) NOT NULL,
    standardized_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (category IN ('plumbing', 'electrical', 'building', 'hardware', 'other')),
    unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
    current_unit_price NUMERIC(10, 2) NOT NULL CHECK (current_unit_price >= 0),
    previous_prices JSONB DEFAULT '[]'::jsonb,
    quotation_count INTEGER NOT NULL DEFAULT 1,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_library_standardized ON price_library(standardized_name);
CREATE INDEX IF NOT EXISTS idx_price_library_category ON price_library(category);

-- ==========================================
-- 7. QUOTATIONS & ITEMS
-- ==========================================
CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_number VARCHAR(50) NOT NULL UNIQUE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_email VARCHAR(100),
    customer_address TEXT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'accepted', 'declined', 'invoiced')),
    notes TEXT,
    raw_pasted_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) DEFAULT 'pcs',
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
    matched_from_library BOOLEAN DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quote_id ON quotation_items(quotation_id);

-- ==========================================
-- 8. BUSINESS SETTINGS
-- ==========================================
CREATE TABLE IF NOT EXISTS business_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'primary_settings',
    business_name VARCHAR(255) NOT NULL DEFAULT 'SHUCADEA HARDWARE',
    tagline VARCHAR(255) DEFAULT 'Quality Hardware & Materials',
    phone VARCHAR(50) DEFAULT '+263 77 123 4567',
    whatsapp VARCHAR(50) DEFAULT '+263 77 123 4567',
    email VARCHAR(100) DEFAULT 'sales@shucadeahardware.co.zw',
    address TEXT DEFAULT 'Harare, Zimbabwe',
    currency VARCHAR(10) DEFAULT 'USD',
    default_white_purchase_price NUMERIC(10, 2) DEFAULT 23.00,
    default_white_transport NUMERIC(10, 2) DEFAULT 25.00,
    default_white_fb_price NUMERIC(10, 2) DEFAULT 26.00,
    default_white_walkin_price NUMERIC(10, 2) DEFAULT 27.00,
    default_brown_purchase_price NUMERIC(10, 2) DEFAULT 14.00,
    default_brown_selling_price NUMERIC(10, 2) DEFAULT 18.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default settings
INSERT INTO business_settings (id, business_name)
VALUES ('primary_settings', 'SHUCADEA HARDWARE')
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
ALTER TABLE white_door_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE white_door_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE brown_door_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE brown_door_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE brown_door_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full operational access
CREATE POLICY "Allow authenticated users full access to white_door_batches"
    ON white_door_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to white_door_sales"
    ON white_door_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to brown_door_purchases"
    ON brown_door_purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to brown_door_sales"
    ON brown_door_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to brown_door_withdrawals"
    ON brown_door_withdrawals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to financial_transactions"
    ON financial_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to daily_closings"
    ON daily_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to price_library"
    ON price_library FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to quotations"
    ON quotations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to quotation_items"
    ON quotation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to business_settings"
    ON business_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow public read/write if using anon key in single-tenant deployment
CREATE POLICY "Allow anon access for white_door_batches" ON white_door_batches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for white_door_sales" ON white_door_sales FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for brown_door_purchases" ON brown_door_purchases FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for brown_door_sales" ON brown_door_sales FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for brown_door_withdrawals" ON brown_door_withdrawals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for financial_transactions" ON financial_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for daily_closings" ON daily_closings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for price_library" ON price_library FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for quotations" ON quotations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for quotation_items" ON quotation_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon access for business_settings" ON business_settings FOR ALL TO anon USING (true) WITH CHECK (true);
