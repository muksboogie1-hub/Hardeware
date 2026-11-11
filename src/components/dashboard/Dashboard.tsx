import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Package,
  DollarSign,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Plus,
  RefreshCw,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import {
  AppDatabaseState,
  WhiteDoorBatch,
  WhiteDoorSale,
  BrownDoorPurchase,
  BrownDoorSale,
  BrownDoorWithdrawal,
  FinancialTransaction,
} from '../../types';
import {
  formatCurrency,
  calculateBatchMetrics,
  calculateBrownDoorMetrics,
  addMoney,
  subMoney,
  round2,
} from '../../utils/math';

interface DashboardProps {
  data: AppDatabaseState;
  onNavigate: (tab: any) => void;
  onOpenQuickSale: () => void;
  onOpenDailyClose: () => void;
}

type DateFilter = 'today' | 'week' | 'month' | 'all';

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  onNavigate,
  onOpenQuickSale,
  onOpenDailyClose,
}) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');

  const todayStr = new Date().toISOString().split('T')[0];

  // Helper date filtering
  const filterByDate = (dateStr: string) => {
    if (dateFilter === 'all') return true;
    const now = new Date();
    const itemDate = new Date(dateStr);

    if (dateFilter === 'today') {
      return dateStr === todayStr;
    }
    if (dateFilter === 'week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      return itemDate >= oneWeekAgo;
    }
    if (dateFilter === 'month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(now.getDate() - 30);
      return itemDate >= oneMonthAgo;
    }
    return true;
  };

  // 1. White Doors Metrics
  const whiteDoorMetrics = useMemo(() => {
    let totalStockRemaining = 0;
    let totalAccumulatedNetProfit = 0;
    let totalGrossProfit = 0;
    let totalCollectedRevenue = 0;
    let totalUnpaidBalance = 0;

    data.whiteBatches.forEach((batch) => {
      const metrics = calculateBatchMetrics(batch, data.whiteSales);
      totalStockRemaining += metrics.quantityRemaining;
      totalAccumulatedNetProfit = addMoney(totalAccumulatedNetProfit, metrics.netProfit);
      totalGrossProfit = addMoney(totalGrossProfit, metrics.grossProfit);
      totalCollectedRevenue = addMoney(totalCollectedRevenue, metrics.collectedRevenue);
      totalUnpaidBalance = addMoney(totalUnpaidBalance, metrics.unpaidSales);
    });

    return {
      totalStockRemaining,
      totalAccumulatedNetProfit,
      totalGrossProfit,
      totalCollectedRevenue,
      totalUnpaidBalance,
    };
  }, [data.whiteBatches, data.whiteSales]);

  // 2. Brown Doors Metrics
  const brownDoorMetrics = useMemo(() => {
    return calculateBrownDoorMetrics(
      data.brownPurchases,
      data.brownSales,
      data.brownWithdrawals
    );
  }, [data.brownPurchases, data.brownSales, data.brownWithdrawals]);

  // 3. Filtered Today & Period Sales/Expenses
  const periodDoorSales = useMemo(() => {
    let revenue = 0;
    let collected = 0;

    // Filter white door sales
    data.whiteSales.filter((s) => filterByDate(s.sale_date)).forEach((s) => {
      revenue = addMoney(revenue, s.total_amount);
      collected = addMoney(collected, s.amount_received);
    });

    // Filter brown door sales
    data.brownSales.filter((s) => filterByDate(s.sale_date)).forEach((s) => {
      revenue = addMoney(revenue, s.total_amount);
      collected = addMoney(collected, s.amount_received);
    });

    return { revenue, collected };
  }, [data.whiteSales, data.brownSales, dateFilter]);

  const periodDoorExpenses = useMemo(() => {
    let expenses = 0;
    data.doorTransactions
      .filter((tx) => filterByDate(tx.date) && tx.type === 'expense')
      .forEach((tx) => {
        expenses = addMoney(expenses, tx.amount);
      });
    return expenses;
  }, [data.doorTransactions, dateFilter]);

  // Total Outstanding Customer Payments across all doors
  const totalOutstandingPayments = useMemo(() => {
    const whiteUnpaid = data.whiteSales.reduce((acc, s) => addMoney(acc, s.outstanding_balance), 0);
    const brownUnpaid = data.brownSales.reduce((acc, s) => addMoney(acc, s.outstanding_balance), 0);
    return addMoney(whiteUnpaid, brownUnpaid);
  }, [data.whiteSales, data.brownSales]);

  // Available door business cash (strictly collected cash from door sales minus door expenses & personal withdrawals)
  const totalDoorCash = useMemo(() => {
    let cash = 0;
    data.doorTransactions.forEach((tx) => {
      if (tx.type === 'income') {
        cash = addMoney(cash, tx.amount);
      } else if (tx.type === 'expense' || tx.type === 'withdrawal') {
        cash = subMoney(cash, tx.amount);
      }
    });
    return Math.max(0, cash);
  }, [data.doorTransactions]);

  // Restocking recommendation: 20 white doors * $23 + $25 transport = $485
  const whiteRestockCost = 20 * (data.settings.default_white_purchase_price || 23) + (data.settings.default_white_transport || 25);
  const canRestockWhiteDoors = totalDoorCash >= whiteRestockCost;

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Page Title & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            Business Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time stock, batch profitability, cash positions & ledger health
          </p>
        </div>

        {/* Date Filter & Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Filter Control */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(['today', 'week', 'month', 'all'] as DateFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition ${
                  dateFilter === filter
                    ? 'bg-[#071D3A] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#071D3A]'
                }`}
              >
                {filter === 'today' ? 'Today' : filter === 'week' ? '7 Days' : filter === 'month' ? '30 Days' : 'All'}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenQuickSale}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#F58220] hover:bg-[#e07212] text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Record Sale</span>
          </button>

          <button
            onClick={onOpenDailyClose}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#071D3A] hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition"
          >
            <ShieldCheck className="w-4 h-4 text-[#F58220]" />
            <span>Daily Closing</span>
          </button>
        </div>
      </div>

      {/* Stock & Reinvestment Alert Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* White Doors Restock Status */}
        <div className={`p-4 rounded-2xl border flex items-start gap-3 transition ${
          whiteDoorMetrics.totalStockRemaining <= 5
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-white border-slate-200 text-[#172033]'
        }`}>
          <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-xs flex-shrink-0">
            <Package className="w-5 h-5 text-[#071D3A]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                White Doors Stock
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-[#071D3A]">
                {whiteDoorMetrics.totalStockRemaining} In Stock
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {whiteDoorMetrics.totalStockRemaining <= 5 ? (
                <span className="font-semibold text-amber-700">Stock is low. </span>
              ) : null}
              Restocking standard (20 doors @ ${data.settings.default_white_purchase_price} + ${data.settings.default_white_transport} transport) requires{' '}
              <strong className="text-[#071D3A] font-mono-numbers">{formatCurrency(whiteRestockCost)}</strong>.
            </p>
            {canRestockWhiteDoors ? (
              <span className="inline-block mt-2 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                Available cash is sufficient for restocking
              </span>
            ) : (
              <span className="inline-block mt-2 text-[11px] font-medium text-slate-500">
                Cash required: {formatCurrency(Math.max(0, whiteRestockCost - totalDoorCash))} more needed
              </span>
            )}
          </div>
        </div>

        {/* Brown Doors Reinvestment Recommendation */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 text-[#172033] flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#071D3A]/5 border border-slate-200/80 shadow-xs flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-[#F58220]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Brown Door Reinvestment
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-orange-50 text-[#F58220]">
                {brownDoorMetrics.currentStock} In Stock
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Available reinvestment pool:{' '}
              <strong className="text-emerald-700 font-mono-numbers">{formatCurrency(brownDoorMetrics.availableReinvestmentFunds)}</strong>.
              Can purchase <strong className="text-[#071D3A]">{brownDoorMetrics.doorsCanPurchase} doors</strong> at $14 each right now.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => onNavigate('doors')}
                className="text-[11px] font-bold text-[#F58220] hover:underline flex items-center gap-1"
              >
                <span>Manage Brown Reinvestment</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid (60-30-10 palette, tabular numerals, unambiguous labels) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: White Doors in Stock */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>White Doors Stock</span>
            <span className="text-[10px] text-slate-400">Batch Model</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#071D3A] font-mono-numbers">
            {whiteDoorMetrics.totalStockRemaining}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Across {data.whiteBatches.filter((b) => b.status === 'active').length} active batch(es)
          </div>
        </div>

        {/* KPI 2: Brown Doors in Stock */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Brown Doors Stock</span>
            <span className="text-[10px] text-[#F58220] font-semibold">Growth Model</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#071D3A] font-mono-numbers">
            {brownDoorMetrics.currentStock}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {brownDoorMetrics.totalSold} sold to date ($4 margin/door)
          </div>
        </div>

        {/* KPI 3: Door Sales for Selected Period */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Period Door Sales</span>
            <span className="text-[10px] capitalize text-slate-400">{dateFilter}</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#071D3A] font-mono-numbers">
            {formatCurrency(periodDoorSales.revenue)}
          </div>
          <div className="mt-1 text-xs text-emerald-600 font-medium font-mono-numbers">
            {formatCurrency(periodDoorSales.collected)} cash collected
          </div>
        </div>

        {/* KPI 4: Available Door Cash */}
        <div className="bg-white p-4 rounded-2xl border border-[#071D3A]/20 shadow-xs ring-1 ring-[#071D3A]/10">
          <div className="flex items-center justify-between text-xs text-[#071D3A] font-bold">
            <span>Available Door Cash</span>
            <span className="text-[10px] bg-[#071D3A] text-white px-1.5 py-0.5 rounded">Liquid</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#071D3A] font-mono-numbers">
            {formatCurrency(totalDoorCash)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Door sales minus door costs & withdrawals
          </div>
        </div>
      </div>

      {/* Secondary Financial Breakdown: Distinction Between Revenue, Profit, and Reinvestment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: White Door Accumulated Profit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              White Door Net Profit
            </span>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Kept Aside
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700 font-mono-numbers">
              {formatCurrency(whiteDoorMetrics.totalAccumulatedNetProfit)}
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Calculated after batch purchase costs and $25/batch transport deduction.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono-numbers">
            <span>Gross Profit: {formatCurrency(whiteDoorMetrics.totalGrossProfit)}</span>
            <span>Unpaid: {formatCurrency(whiteDoorMetrics.totalUnpaidBalance)}</span>
          </div>
        </div>

        {/* Card 2: Brown Door Reinvestment Pool */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Brown Reinvestment Funds
            </span>
            <span className="text-[10px] font-semibold text-[#F58220] bg-orange-50 px-2 py-0.5 rounded">
              To Buy More Doors
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-[#F58220] font-mono-numbers">
              {formatCurrency(brownDoorMetrics.availableReinvestmentFunds)}
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Dedicated capital + sales profit, strictly minus personal withdrawals.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono-numbers">
            <span>Purchased: {brownDoorMetrics.totalPurchased} doors</span>
            <span>Withdrawn: {formatCurrency(brownDoorMetrics.totalWithdrawn)}</span>
          </div>
        </div>

        {/* Card 3: Outstanding Customer Credit */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Outstanding Customer Debt
            </span>
            <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
              Receivables
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-rose-700 font-mono-numbers">
              {formatCurrency(totalOutstandingPayments)}
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Unpaid balances from credit/partial door sales. Not counted as collected cash.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-semibold text-rose-600">Action Required</span>
            <button
              onClick={() => onNavigate('doors')}
              className="text-[#071D3A] hover:underline font-bold"
            >
              View Sales
            </button>
          </div>
        </div>
      </div>

      {/* Lower Grids: Recent Door Transactions & Recent Quotations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Door Transactions Ledger */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-[#071D3A]">Recent Door Ledger Entries</h3>
              <p className="text-xs text-slate-400">Strictly separated from general hardware</p>
            </div>
            <button
              onClick={() => onNavigate('finances')}
              className="text-xs font-bold text-[#F58220] hover:underline flex items-center gap-1"
            >
              <span>Full Ledger</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {data.doorTransactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        tx.type === 'income'
                          ? 'bg-emerald-50 text-emerald-700'
                          : tx.is_personal_withdrawal
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {tx.category}
                    </span>
                    <span className="text-xs font-medium text-slate-400 font-mono-numbers">
                      {tx.date}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#172033] truncate mt-0.5">
                    {tx.description}
                  </p>
                </div>
                <div
                  className={`text-sm font-bold font-mono-numbers flex-shrink-0 ${
                    tx.type === 'income' ? 'text-emerald-700' : 'text-slate-800'
                  }`}
                >
                  {tx.type === 'income' ? '+' : '-'}
                  {formatCurrency(tx.amount)}
                </div>
              </div>
            ))}

            {data.doorTransactions.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                No door transactions recorded yet. Click "Record Sale" to start.
              </div>
            )}
          </div>
        </div>

        {/* Recent Quotations */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-[#071D3A]">Recent Quotations</h3>
              <p className="text-xs text-slate-400">Pasted & calculated spreadsheet quotes</p>
            </div>
            <button
              onClick={() => onNavigate('quotations')}
              className="text-xs font-bold text-[#F58220] hover:underline flex items-center gap-1"
            >
              <span>Create Quote</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {data.quotations.slice(0, 5).map((q) => (
              <div key={q.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#071D3A] font-mono-numbers">
                      {q.quotation_number}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono-numbers">{q.date}</span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">
                      {q.status}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-700 truncate mt-0.5">
                    {q.customer_name} · {q.items.length} items
                  </p>
                </div>
                <div className="text-sm font-extrabold text-[#071D3A] font-mono-numbers flex-shrink-0">
                  {formatCurrency(q.grand_total)}
                </div>
              </div>
            ))}

            {data.quotations.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                No quotations created yet. Click "Create Quote" to paste raw text.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
