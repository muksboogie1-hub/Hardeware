import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  X,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  History,
  FileSpreadsheet,
} from 'lucide-react';
import { AppDatabaseState, DailyClosing } from '../../types';
import { formatCurrency, subMoney, addMoney } from '../../utils/math';
import { storage } from '../../services/storage';

interface DailyClosingModalProps {
  data: AppDatabaseState;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const DailyClosingModal: React.FC<DailyClosingModalProps> = ({
  data,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [closingDate, setClosingDate] = useState(todayStr);
  const [closedBy, setClosedBy] = useState('Shop Manager');

  // Pre-calculate today's records as starting baseline
  const dayStats = useMemo(() => {
    let whiteSold = 0;
    let brownSold = 0;
    let revenue = 0;
    let collectedCash = 0;
    let outstanding = 0;

    data.whiteSales
      .filter((s) => s.sale_date === closingDate)
      .forEach((s) => {
        whiteSold += s.quantity;
        revenue = addMoney(revenue, s.total_amount);
        collectedCash = addMoney(collectedCash, s.amount_received);
        outstanding = addMoney(outstanding, s.outstanding_balance);
      });

    data.brownSales
      .filter((s) => s.sale_date === closingDate)
      .forEach((s) => {
        brownSold += s.quantity;
        revenue = addMoney(revenue, s.total_amount);
        collectedCash = addMoney(collectedCash, s.amount_received);
        outstanding = addMoney(outstanding, s.outstanding_balance);
      });

    let transportExpenses = 0;
    let otherExpenses = 0;
    let personalWithdrawals = 0;

    data.doorTransactions
      .filter((tx) => tx.date === closingDate)
      .forEach((tx) => {
        if (tx.is_personal_withdrawal) {
          personalWithdrawals = addMoney(personalWithdrawals, tx.amount);
        } else if (tx.category === 'Transport') {
          transportExpenses = addMoney(transportExpenses, tx.amount);
        } else if (tx.type === 'expense' && tx.category !== 'Stock Restock') {
          otherExpenses = addMoney(otherExpenses, tx.amount);
        }
      });

    return {
      whiteSold,
      brownSold,
      revenue,
      collectedCash,
      outstanding,
      transportExpenses,
      otherExpenses,
      personalWithdrawals,
    };
  }, [data, closingDate]);

  const [form, setForm] = useState({
    white_doors_sold: 0,
    brown_doors_sold: 0,
    sales_revenue: 0,
    collected_cash: 0,
    outstanding_payments: 0,
    transport_expenses: 0,
    other_expenses: 0,
    personal_withdrawals: 0,
    actual_cash_counted: 0,
    discrepancy_explanation: '',
  });

  // Load existing closing or seed with day stats
  useEffect(() => {
    const existing = data.dailyClosings.find((c) => c.closing_date === closingDate);
    if (existing) {
      setForm({
        white_doors_sold: existing.white_doors_sold,
        brown_doors_sold: existing.brown_doors_sold,
        sales_revenue: existing.sales_revenue,
        collected_cash: existing.collected_cash,
        outstanding_payments: existing.outstanding_payments,
        transport_expenses: existing.transport_expenses,
        other_expenses: existing.other_expenses,
        personal_withdrawals: existing.personal_withdrawals,
        actual_cash_counted: existing.actual_cash_counted,
        discrepancy_explanation: existing.discrepancy_explanation || '',
      });
      setClosedBy(existing.closed_by);
    } else {
      setForm({
        white_doors_sold: dayStats.whiteSold,
        brown_doors_sold: dayStats.brownSold,
        sales_revenue: dayStats.revenue,
        collected_cash: dayStats.collectedCash,
        outstanding_payments: dayStats.outstanding,
        transport_expenses: dayStats.transportExpenses,
        other_expenses: dayStats.otherExpenses,
        personal_withdrawals: dayStats.personalWithdrawals,
        actual_cash_counted: Math.max(
          0,
          subMoney(
            dayStats.collectedCash,
            addMoney(dayStats.transportExpenses, dayStats.otherExpenses, dayStats.personalWithdrawals)
          )
        ),
        discrepancy_explanation: '',
      });
    }
  }, [closingDate, dayStats, data.dailyClosings]);

  // Expected Cash calculation:
  // Expected = Collected Cash - Transport Expenses - Other Expenses - Personal Withdrawals
  const expectedCash = useMemo(() => {
    const totalOutflow = addMoney(
      form.transport_expenses,
      form.other_expenses,
      form.personal_withdrawals
    );
    return Math.max(0, subMoney(form.collected_cash, totalOutflow));
  }, [form.collected_cash, form.transport_expenses, form.other_expenses, form.personal_withdrawals]);

  const discrepancy = subMoney(form.actual_cash_counted, expectedCash);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (discrepancy !== 0 && !form.discrepancy_explanation.trim()) {
      alert('Please provide an explanation for the cash discrepancy before submitting.');
      return;
    }

    storage.recordDailyClosing({
      closing_date: closingDate,
      closed_at: new Date().toISOString(),
      white_doors_sold: Number(form.white_doors_sold),
      brown_doors_sold: Number(form.brown_doors_sold),
      sales_revenue: Number(form.sales_revenue),
      collected_cash: Number(form.collected_cash),
      outstanding_payments: Number(form.outstanding_payments),
      transport_expenses: Number(form.transport_expenses),
      other_expenses: Number(form.other_expenses),
      personal_withdrawals: Number(form.personal_withdrawals),
      expected_cash: expectedCash,
      actual_cash_counted: Number(form.actual_cash_counted),
      discrepancy_explanation: form.discrepancy_explanation,
      closed_by: closedBy,
      status: discrepancy === 0 ? 'balanced' : 'discrepancy',
      audit_history: [
        {
          timestamp: new Date().toISOString(),
          action: 'Closed Daily Drawer',
          user: closedBy,
          changes: `Counted: $${form.actual_cash_counted}, Expected: $${expectedCash}, Discrepancy: $${discrepancy}`,
        },
      ],
    });

    onRefresh();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#071D3A] text-white rounded-xl">
              <ShieldCheck className="w-5 h-5 text-[#F58220]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#071D3A]">Daily Cash Reconciliation</h2>
              <p className="text-xs text-slate-500">
                End-of-day register closing & cash audit. Never silently adjusts balances.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Date & Manager */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block">Closing Date</label>
              <input
                type="date"
                required
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block">Closed By (Manager / Cashier)</label>
              <input
                type="text"
                required
                value={closedBy}
                onChange={(e) => setClosedBy(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Section 1: Physical Sales & Money Inflows */}
          <div className="p-4 bg-[#F4F6F9] rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-[#071D3A] uppercase tracking-wider">
              1. Sales & Inflows
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block">White Doors Sold</label>
                <input
                  type="number"
                  min="0"
                  value={form.white_doors_sold}
                  onChange={(e) => setForm({ ...form, white_doors_sold: parseInt(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block">Brown Doors Sold</label>
                <input
                  type="number"
                  min="0"
                  value={form.brown_doors_sold}
                  onChange={(e) => setForm({ ...form, brown_doors_sold: parseInt(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block">Total Sales Revenue ($)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.sales_revenue}
                  onChange={(e) => setForm({ ...form, sales_revenue: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono font-bold bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-emerald-800 block">
                  Money Actually Collected ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.collected_cash}
                  onChange={(e) => setForm({ ...form, collected_cash: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-emerald-400 rounded-lg font-mono font-bold text-emerald-700 bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-rose-800 block">
                  Outstanding Credit ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={form.outstanding_payments}
                  onChange={(e) => setForm({ ...form, outstanding_payments: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-rose-300 rounded-lg font-mono text-rose-700 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Cash Outflows & Personal Withdrawals */}
          <div className="p-4 bg-[#F4F6F9] rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-[#071D3A] uppercase tracking-wider">
              2. Cash Outflows (Paid from Drawer)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block">Transport Expenses ($)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.transport_expenses}
                  onChange={(e) => setForm({ ...form, transport_expenses: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block">Other Shop Expenses ($)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.other_expenses}
                  onChange={(e) => setForm({ ...form, other_expenses: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-purple-800 block">Personal Withdrawals ($)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.personal_withdrawals}
                  onChange={(e) => setForm({ ...form, personal_withdrawals: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 text-xs border border-purple-300 rounded-lg font-mono text-purple-700 font-bold bg-white"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Reconciliation Engine */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <h3 className="text-xs font-bold text-[#071D3A] uppercase tracking-wider">
              3. Cash Count vs Expected
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono-numbers">
              <div className="p-3 bg-slate-50 rounded-xl">
                <span className="text-[11px] text-slate-500 block font-sans">Expected Drawer Cash</span>
                <span className="text-xl font-black text-[#071D3A]">{formatCurrency(expectedCash)}</span>
                <span className="text-[10px] text-slate-400 block font-sans">
                  Collected - Expenses - Withdrawals
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#071D3A] block font-sans">
                  Actual Cash Counted ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  required
                  value={form.actual_cash_counted}
                  onChange={(e) => setForm({ ...form, actual_cash_counted: parseFloat(e.target.value) || 0 })}
                  className="w-full mt-1 px-3 py-2 text-lg font-black font-mono border-2 border-[#071D3A] rounded-xl text-[#071D3A] focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 block font-sans mt-0.5">Physical notes counted</span>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  discrepancy === 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <span className="text-[11px] font-sans font-bold block">
                  {discrepancy === 0 ? 'Cash Matches' : 'Discrepancy (Difference)'}
                </span>
                <span className="text-xl font-black">
                  {discrepancy > 0 ? `+${formatCurrency(discrepancy)}` : formatCurrency(discrepancy)}
                </span>
                <span className="text-[10px] block font-sans">
                  {discrepancy === 0 ? 'Zero variance' : discrepancy > 0 ? 'Cash surplus' : 'Cash shortage'}
                </span>
              </div>
            </div>

            {discrepancy !== 0 && (
              <div className="pt-2">
                <label className="text-xs font-bold text-rose-800 block">
                  Discrepancy Explanation (Required for Audit Trail)
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Explain why counted cash differs from expected cash..."
                  value={form.discrepancy_explanation}
                  onChange={(e) => setForm({ ...form, discrepancy_explanation: e.target.value })}
                  className="w-full mt-1 p-2.5 text-xs border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>
            )}
          </div>

          {/* Submission Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs"
            >
              Confirm & Save Daily Closing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
