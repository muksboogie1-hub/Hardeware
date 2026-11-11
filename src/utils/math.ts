/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Financial Math & Precision Calculations for Shucadea Hardware
 * Prevents floating point errors and guarantees safe decimal arithmetic.
 */

import { WhiteDoorBatch, WhiteDoorSale, BrownDoorPurchase, BrownDoorSale, BrownDoorWithdrawal } from '../types';

/** Safe rounding to 2 decimal places */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Formats a monetary number to standard currency display */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const rounded = round2(amount);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(rounded));

  const prefix = rounded < 0 ? '-$' : '$';
  return `${prefix}${formatted}`;
}

/** Safely adds monetary values */
export function addMoney(...amounts: number[]): number {
  const sumInCents = amounts.reduce((acc, curr) => acc + Math.round((curr || 0) * 100), 0);
  return sumInCents / 100;
}

/** Safely subtracts monetary values (a - b) */
export function subMoney(a: number, b: number): number {
  const aCents = Math.round((a || 0) * 100);
  const bCents = Math.round((b || 0) * 100);
  return (aCents - bCents) / 100;
}

/** Safely multiplies quantity by price */
export function multMoney(price: number, quantity: number): number {
  const priceCents = Math.round((price || 0) * 100);
  return round2((priceCents * quantity) / 100);
}

/**
 * Computes exact batch figures for White Doors
 * Rules verified from specs:
 * 20 doors at $23 = $460 purchase cost
 * Transport = $25 deducted once per batch
 * 12 sold at $26 + 8 sold at $27 = $528 revenue
 * Gross profit = $68
 * Net profit after transport = $43
 */
export function calculateBatchMetrics(
  batch: WhiteDoorBatch,
  sales: WhiteDoorSale[]
): {
  totalPurchaseCost: number;
  quantitySold: number;
  quantityRemaining: number;
  totalRevenue: number;
  collectedRevenue: number;
  unpaidSales: number;
  grossProfit: number;
  transportDeduction: number;
  netProfit: number;
} {
  const batchSales = sales.filter((s) => s.batch_id === batch.id);

  const totalPurchaseCost = multMoney(batch.purchase_price_per_door, batch.quantity_purchased);
  const quantitySold = batchSales.reduce((acc, s) => acc + s.quantity, 0);
  const quantityRemaining = Math.max(
    0,
    batch.quantity_purchased - quantitySold - (batch.damaged_doors || 0) + (batch.returned_doors || 0)
  );

  const totalRevenue = batchSales.reduce((acc, s) => addMoney(acc, s.total_amount), 0);
  const collectedRevenue = batchSales.reduce((acc, s) => addMoney(acc, s.amount_received), 0);
  const unpaidSales = batchSales.reduce((acc, s) => addMoney(acc, s.outstanding_balance), 0);

  // Gross profit: sum of (sale.unit_price - batch.purchase_price_per_door) * sale.quantity
  const grossProfit = batchSales.reduce((acc, s) => {
    const marginPerDoor = subMoney(s.unit_price, batch.purchase_price_per_door);
    const saleGross = multMoney(marginPerDoor, s.quantity);
    return addMoney(acc, saleGross);
  }, 0);

  const transportDeduction = batch.transport_cost || 0;
  const netProfit = subMoney(grossProfit, transportDeduction);

  return {
    totalPurchaseCost,
    quantitySold,
    quantityRemaining,
    totalRevenue,
    collectedRevenue,
    unpaidSales,
    grossProfit,
    transportDeduction,
    netProfit,
  };
}

/**
 * Computes Brown Door reinvestment figures
 * Rules:
 * Buy at $14, sell at $18. Gross profit = $4 per door.
 * No transport deduction.
 * Reinvestment tracking:
 * Available Funds = starting pool + collected sales revenue - total purchases - personal withdrawals
 */
export function calculateBrownDoorMetrics(
  purchases: BrownDoorPurchase[],
  sales: BrownDoorSale[],
  withdrawals: BrownDoorWithdrawal[],
  initialCapital: number = 140 // initial purchasing capacity approx 10 doors @ $14
): {
  totalPurchased: number;
  totalCost: number;
  totalSold: number;
  currentStock: number;
  totalRevenue: number;
  collectedRevenue: number;
  unpaidRevenue: number;
  grossProfit: number;
  totalWithdrawn: number;
  availableReinvestmentFunds: number;
  doorsCanPurchase: number; // how many doors can be bought right now at $14 each
} {
  const totalPurchased = purchases.reduce((acc, p) => acc + p.quantity, 0);
  const totalCost = purchases.reduce((acc, p) => addMoney(acc, p.total_cost), 0);

  const totalSold = sales.reduce((acc, s) => acc + s.quantity, 0);
  const currentStock = Math.max(0, totalPurchased - totalSold);

  const totalRevenue = sales.reduce((acc, s) => addMoney(acc, s.total_amount), 0);
  const collectedRevenue = sales.reduce((acc, s) => addMoney(acc, s.amount_received), 0);
  const unpaidRevenue = sales.reduce((acc, s) => addMoney(acc, s.outstanding_balance), 0);

  // Profit = sum of (unit_price - 14) * quantity
  const grossProfit = sales.reduce((acc, s) => {
    const margin = subMoney(s.unit_price, 14);
    return addMoney(acc, multMoney(margin, s.quantity));
  }, 0);

  const totalWithdrawn = withdrawals.reduce((acc, w) => addMoney(acc, w.amount), 0);

  // Available Reinvestment Funds = Initial Capital + Collected Sales Revenue - Total Purchases Cost - Total Withdrawn
  // Ensures cash is real (only collected revenue, and personal withdrawals are separated)
  const availableReinvestmentFunds = round2(
    initialCapital + collectedRevenue - totalCost - totalWithdrawn
  );

  const currentPurchasePrice = 14;
  const doorsCanPurchase = Math.max(0, Math.floor(availableReinvestmentFunds / currentPurchasePrice));

  return {
    totalPurchased,
    totalCost,
    totalSold,
    currentStock,
    totalRevenue,
    collectedRevenue,
    unpaidRevenue,
    grossProfit,
    totalWithdrawn,
    availableReinvestmentFunds,
    doorsCanPurchase,
  };
}
