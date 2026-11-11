import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Filter,
  Layers,
  Info,
  Calendar,
  AlertCircle,
  FileText,
} from 'lucide-react';
import {
  AppDatabaseState,
  FinancialTransaction,
  PaymentMethod,
  TransactionType,
  DoorType,
  TransactionSegment,
} from '../../types';
import { formatCurrency, addMoney, subMoney } from '../../utils/math';
import { storage } from '../../services/storage';

interface FinancialManagementProps {
  data: AppDatabaseState;
  onRefresh: () => void;
}

export const FinancialManagement: React.FC<FinancialManagementProps> = ({ data, onRefresh }) => {
  const [activeSegment, setActiveSegment] = useState<TransactionSegment>('doors');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states for New Transaction
  const [form, setForm] = useState<{
    date: string;
    type: TransactionType;
    category: string;
    amount: number;
    payment_method: PaymentMethod;
    door_type?: DoorType;
    description: string;
    notes: string;
    is_personal_withdrawal: boolean;
  }>({
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    category: 'Labour',
    amount: 0,
    payment_method: 'cash',
    door_type: 'general',
    description: '',
    notes: '',
    is_personal_withdrawal: false,
  });

  const activeTransactions = activeSegment === 'doors' ? data.doorTransactions : data.hardwareTransactions;

  // Filter transactions
  const filteredTransactions = activeTransactions.filter((tx) => {
    const matchesSearch =
      tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType =
      filterType === 'all'
        ? true
        : filterType === 'withdrawal'
        ? tx.is_personal_withdrawal
        : tx.type === filterType;
    return matchesSearch && matchesType;
  });

  // Calculate Segment Metrics
  const metrics = useMemo(() => {
    let totalIncome = 0;
    let totalOperatingExpenses = 0;
    let totalPersonalWithdrawals = 0;
    let cashBalance = 0;

    activeTransactions.forEach((tx) => {
      if (tx.type === 'income') {
        totalIncome = addMoney(totalIncome, tx.amount);
        cashBalance = addMoney(cashBalance, tx.amount);
      } else if (tx.is_personal_withdrawal) {
        totalPersonalWithdrawals = addMoney(totalPersonalWithdrawals, tx.amount);
        cashBalance = subMoney(cashBalance, tx.amount);
      } else if (tx.type === 'expense') {
        totalOperatingExpenses = addMoney(totalOperatingExpenses, tx.amount);
        cashBalance = subMoney(cashBalance, tx.amount);
      }
    });

    // Net Operating Profit = Income - Operating Expenses (Withdrawals are not subtracted from operating profit!)
    const netOperatingProfit = subMoney(totalIncome, totalOperatingExpenses);

    return {
      totalIncome,
      totalOperatingExpenses,
      totalPersonalWithdrawals,
      netOperatingProfit,
      cashBalance,
    };
  }, [activeTransactions]);

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0) {
      alert('Amount must be greater than zero');
      return;
    }
    if (!form.description.trim()) {
      alert('Please provide a description');
      return;
    }

    const isWithdrawal = form.type === 'withdrawal' || form.category === 'Personal Withdrawal';

    storage.recordTransaction(activeSegment, {
      date: form.date,
      type: form.type,
      category: form.category,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      door_type: activeSegment === 'doors' ? form.door_type : undefined,
      description: form.description.trim(),
      notes: form.notes,
      is_personal_withdrawal: isWithdrawal,
    });

    setShowAddModal(false);
    onRefresh();
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Header & Segment Isolator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            Financial Management & Ledgers
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Strict isolation between Door Operations and General Hardware finances
          </p>
        </div>

        {/* Segment Toggle */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveSegment('doors')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeSegment === 'doors'
                ? 'bg-[#071D3A] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#071D3A]'
            }`}
          >
            <span>Door Finances</span>
          </button>
          <button
            onClick={() => setActiveSegment('hardware')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeSegment === 'hardware'
                ? 'bg-[#F58220] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#071D3A]'
            }`}
          >
            <span>General Hardware Finances</span>
          </button>
        </div>
      </div>

      {/* Rules Notice */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold">Accounting Rule Enforced: </strong>
          Personal withdrawals are recorded and deducted from cash drawer balances, but are{' '}
          <strong className="underline">never</strong> counted as operating expenses. Door funds are completely isolated from general hardware funds.
        </div>
      </div>

      {/* Financial Health Summary Cards for Active Segment */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono-numbers">
        {/* Total Inflow */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-sans text-slate-500">
            <span>Collected Inflows</span>
            <span className="text-[10px] text-emerald-600 font-bold uppercase">Income</span>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700">
            {formatCurrency(metrics.totalIncome)}
          </div>
          <div className="mt-1 text-[11px] font-sans text-slate-400">
            Actual collected revenue
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-sans text-slate-500">
            <span>Operating Expenses</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase">Costs</span>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800">
            {formatCurrency(metrics.totalOperatingExpenses)}
          </div>
          <div className="mt-1 text-[11px] font-sans text-slate-400">
            Transport, labour, restock, overhead
          </div>
        </div>

        {/* Personal Withdrawals */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-sans text-slate-500">
            <span>Personal Withdrawals</span>
            <span className="text-[10px] text-purple-700 font-bold uppercase">Non-Operating</span>
          </div>
          <div className="mt-2 text-2xl font-black text-purple-700">
            {formatCurrency(metrics.totalPersonalWithdrawals)}
          </div>
          <div className="mt-1 text-[11px] font-sans text-slate-400">
            Owner draws (excluded from profit)
          </div>
        </div>

        {/* Net Available Drawer Cash */}
        <div className="bg-white p-4 rounded-2xl border-2 border-[#071D3A] shadow-xs">
          <div className="flex items-center justify-between text-xs font-sans font-bold text-[#071D3A]">
            <span>Net Liquid Cash</span>
            <span className="text-[10px] bg-[#071D3A] text-white px-1.5 py-0.5 rounded">Liquid</span>
          </div>
          <div className="mt-2 text-2xl font-black text-[#071D3A]">
            {formatCurrency(metrics.cashBalance)}
          </div>
          <div className="mt-1 text-[11px] font-sans text-slate-500">
            Operating Net: {formatCurrency(metrics.netOperatingProfit)}
          </div>
        </div>
      </div>

      {/* Transactions Ledger View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Ledger Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#071D3A]">
              {activeSegment === 'doors' ? 'Door Business Ledger' : 'General Hardware Ledger'} ({filteredTransactions.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Pill Tabs */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs">
              {['all', 'income', 'expense', 'withdrawal'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded font-semibold capitalize transition ${
                    filterType === t
                      ? 'bg-white text-[#071D3A] shadow-xs'
                      : 'text-slate-600 hover:text-[#071D3A]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setForm({
                  date: new Date().toISOString().split('T')[0],
                  type: 'expense',
                  category: 'Labour',
                  amount: 0,
                  payment_method: 'cash',
                  door_type: 'general',
                  description: '',
                  notes: '',
                  is_personal_withdrawal: false,
                });
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#071D3A] hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5 text-[#F58220]" />
              <span>Record Transaction</span>
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-4 font-semibold">Date</th>
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold">Description</th>
                {activeSegment === 'doors' && <th className="py-2.5 px-3 font-semibold">Door Type</th>}
                <th className="py-2.5 px-3 font-semibold">Payment</th>
                <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono-numbers">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 text-slate-500">{tx.date}</td>

                  <td className="py-3 px-3 font-sans">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        tx.type === 'income'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tx.is_personal_withdrawal
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tx.category}
                    </span>
                  </td>

                  <td className="py-3 px-3 font-sans font-medium text-[#172033]">
                    {tx.description}
                    {tx.notes && <span className="block text-[11px] text-slate-400 font-normal">{tx.notes}</span>}
                  </td>

                  {activeSegment === 'doors' && (
                    <td className="py-3 px-3 font-sans capitalize text-slate-600">
                      {tx.door_type || 'general'}
                    </td>
                  )}

                  <td className="py-3 px-3 font-sans capitalize text-slate-500">
                    {tx.payment_method}
                  </td>

                  <td
                    className={`py-3 px-4 text-right font-black text-sm ${
                      tx.type === 'income'
                        ? 'text-emerald-700'
                        : tx.is_personal_withdrawal
                        ? 'text-purple-700'
                        : 'text-slate-800'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTransactions.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400">
              No transactions found in this ledger. Click "Record Transaction" to add an entry.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODAL: RECORD TRANSACTION
         ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">
              Record {activeSegment === 'doors' ? 'Door' : 'General Hardware'} Transaction
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Accurate classification ensures strict separation between operating expenses and personal withdrawals.
            </p>

            <form onSubmit={handleSaveTransaction} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Transaction Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const t = e.target.value as TransactionType;
                      setForm({
                        ...form,
                        type: t,
                        category: t === 'withdrawal' ? 'Personal Withdrawal' : t === 'income' ? 'Door Sale' : 'Labour',
                        is_personal_withdrawal: t === 'withdrawal',
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  >
                    <option value="income">Income / Inflow</option>
                    <option value="expense">Operating Expense</option>
                    <option value="withdrawal">Personal Withdrawal</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  >
                    {form.type === 'income' ? (
                      <>
                        <option value="Door Sale">Door Sale</option>
                        <option value="Hardware Sale">Hardware Sale</option>
                        <option value="Customer Credit Payment">Customer Credit Payment</option>
                        <option value="Other Income">Other Income</option>
                      </>
                    ) : form.type === 'withdrawal' ? (
                      <option value="Personal Withdrawal">Personal Withdrawal</option>
                    ) : (
                      <>
                        <option value="Transport">Transport</option>
                        <option value="Labour">Labour Payment</option>
                        <option value="Stock Restock">Stock Restock</option>
                        <option value="Damaged Stock">Damaged Stock</option>
                        <option value="Customer Refund">Customer Refund</option>
                        <option value="Operating Expense">Operating Expense</option>
                        <option value="Shop Consumables">Shop Consumables</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {activeSegment === 'doors' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Door Subsystem</label>
                  <select
                    value={form.door_type}
                    onChange={(e) => setForm({ ...form, door_type: e.target.value as DoorType })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  >
                    <option value="white">White Doors (Batch Accounting)</option>
                    <option value="brown">Brown Doors (Reinvestment System)</option>
                    <option value="general">General Door Hardware</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Amount ($) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    required
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold text-[#071D3A] focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  >
                    <option value="cash">Cash (Physical Drawer)</option>
                    <option value="ecocash">EcoCash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Date</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Loading labour for 20 doors"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-lg shadow-xs"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
