import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  DollarSign,
  Package,
  FileSpreadsheet,
  TrendingUp,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { AppDatabaseState } from '../../types';
import {
  formatCurrency,
  calculateBatchMetrics,
  calculateBrownDoorMetrics,
  addMoney,
  multMoney,
} from '../../utils/math';

interface ReportsProps {
  data: AppDatabaseState;
}

export const Reports: React.FC<ReportsProps> = ({ data }) => {
  const [reportType, setReportType] = useState<'doors' | 'hardware'>('doors');
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('monthly');

  // Filter helper
  const isWithinTimeRange = (dateStr: string) => {
    if (timeRange === 'all') return true;
    const now = new Date();
    const itemDate = new Date(dateStr);
    const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);

    if (timeRange === 'daily') return diffDays <= 1;
    if (timeRange === 'weekly') return diffDays <= 7;
    if (timeRange === 'monthly') return diffDays <= 30;
    return true;
  };

  // Door Business Report Calculations
  const doorReport = useMemo(() => {
    let whiteRevenue = 0;
    let whiteNetProfit = 0;
    let whiteDoorsSold = 0;
    let whiteFBSales = 0;
    let whiteWalkInSales = 0;

    data.whiteBatches.forEach((batch) => {
      const metrics = calculateBatchMetrics(batch, data.whiteSales);
      whiteNetProfit = addMoney(whiteNetProfit, metrics.netProfit);
    });

    data.whiteSales.filter((s) => isWithinTimeRange(s.sale_date)).forEach((s) => {
      whiteRevenue = addMoney(whiteRevenue, s.total_amount);
      whiteDoorsSold += s.quantity;
      if (s.channel === 'facebook') whiteFBSales += s.quantity;
      if (s.channel === 'walk-in') whiteWalkInSales += s.quantity;
    });

    const brown = calculateBrownDoorMetrics(
      data.brownPurchases,
      data.brownSales,
      data.brownWithdrawals
    );

    let periodBrownRevenue = 0;
    let periodBrownSold = 0;
    data.brownSales.filter((s) => isWithinTimeRange(s.sale_date)).forEach((s) => {
      periodBrownRevenue = addMoney(periodBrownRevenue, s.total_amount);
      periodBrownSold += s.quantity;
    });

    return {
      whiteRevenue,
      whiteNetProfit,
      whiteDoorsSold,
      whiteFBSales,
      whiteWalkInSales,
      brown,
      periodBrownRevenue,
      periodBrownSold,
    };
  }, [data, timeRange]);

  // General Hardware Report Calculations
  const hardwareReport = useMemo(() => {
    const periodQuotes = data.quotations.filter((q) => isWithinTimeRange(q.date));
    const totalQuotedValue = periodQuotes.reduce((acc, q) => addMoney(acc, q.grand_total), 0);

    // Most frequently quoted products
    const productFrequency: { [key: string]: { count: number; totalValue: number; unit: string } } = {};
    periodQuotes.forEach((q) => {
      q.items.forEach((item) => {
        const key = item.item_description.trim().toLowerCase();
        if (!productFrequency[key]) {
          productFrequency[key] = { count: 0, totalValue: 0, unit: item.unit || 'pcs' };
        }
        productFrequency[key].count += item.quantity;
        productFrequency[key].totalValue = addMoney(productFrequency[key].totalValue, item.line_total);
      });
    });

    const topProducts = Object.entries(productFrequency)
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    return {
      quotesCount: periodQuotes.length,
      totalQuotedValue,
      topProducts,
    };
  }, [data.quotations, timeRange]);

  // Export CSV
  const handleExportCSV = () => {
    let csvContent = '';
    if (reportType === 'doors') {
      csvContent = [
        `"SHUCADEA HARDWARE - DOOR BUSINESS PERFORMANCE REPORT"`,
        `"Period: ${timeRange.toUpperCase()}"`,
        `"Generated: ${new Date().toLocaleDateString()}"`,
        '',
        '"White Doors Sold (Units)",' + doorReport.whiteDoorsSold,
        '"White Doors Revenue ($)",' + doorReport.whiteRevenue.toFixed(2),
        '"White Doors Net Profit ($)",' + doorReport.whiteNetProfit.toFixed(2),
        '"Facebook Channel Sales (Units)",' + doorReport.whiteFBSales,
        '"Walk-in Channel Sales (Units)",' + doorReport.whiteWalkInSales,
        '',
        '"Brown Doors Sold (Units)",' + doorReport.periodBrownSold,
        '"Brown Doors Revenue ($)",' + doorReport.periodBrownRevenue.toFixed(2),
        '"Brown Reinvestment Funds Pool ($)",' + doorReport.brown.availableReinvestmentFunds.toFixed(2),
        '"Brown Doors Purchasing Capacity (Doors)",' + doorReport.brown.doorsCanPurchase,
        '"Total Personal Withdrawals ($)",' + doorReport.brown.totalWithdrawn.toFixed(2),
      ].join('\n');
    } else {
      csvContent = [
        `"SHUCADEA HARDWARE - GENERAL HARDWARE & QUOTATIONS REPORT"`,
        `"Period: ${timeRange.toUpperCase()}"`,
        `"Generated: ${new Date().toLocaleDateString()}"`,
        '',
        '"Total Quotations Generated",' + hardwareReport.quotesCount,
        '"Total Quotation Value ($)",' + hardwareReport.totalQuotedValue.toFixed(2),
        '',
        '"Top Quoted Product","Total Quantity Quoted","Total Quoted Value ($)"',
        ...hardwareReport.topProducts.map(
          (p) => `"${p.name}","${p.count} ${p.unit}","${p.totalValue.toFixed(2)}"`
        ),
      ].join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `shucadea_${reportType}_report_${timeRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            Financial & Operational Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Audit-grade performance summaries for doors and general hardware
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            {(['daily', 'weekly', 'monthly', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 font-bold rounded-lg capitalize transition ${
                  timeRange === range
                    ? 'bg-[#071D3A] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#071D3A]'
                }`}
              >
                {range === 'daily' ? 'Today' : range === 'weekly' ? '7 Days' : range === 'monthly' ? '30 Days' : 'All'}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#071D3A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <Printer className="w-4 h-4 text-[#F58220]" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Segment Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setReportType('doors')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            reportType === 'doors'
              ? 'bg-[#071D3A] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Door Business Performance
        </button>
        <button
          onClick={() => setReportType('hardware')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            reportType === 'hardware'
              ? 'bg-[#F58220] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Hardware & Quotations Analytics
        </button>
      </div>

      {/* ========================================================
          DOOR BUSINESS REPORT VIEW
         ======================================================== */}
      {reportType === 'doors' && (
        <div className="space-y-6">
          {/* Primary Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono-numbers">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-sans text-slate-500 block">White Door Revenue</span>
              <span className="text-2xl font-black text-[#071D3A]">
                {formatCurrency(doorReport.whiteRevenue)}
              </span>
              <span className="text-[11px] font-sans text-slate-400 block mt-1">
                {doorReport.whiteDoorsSold} doors sold ({doorReport.whiteFBSales} FB, {doorReport.whiteWalkInSales} walk-in)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-sans text-slate-500 block">White Door Net Profit</span>
              <span className="text-2xl font-black text-emerald-700">
                {formatCurrency(doorReport.whiteNetProfit)}
              </span>
              <span className="text-[11px] font-sans text-slate-400 block mt-1">
                Kept aside after transport deduction
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-sans text-slate-500 block">Brown Reinvestment Pool</span>
              <span className="text-2xl font-black text-[#F58220]">
                {formatCurrency(doorReport.brown.availableReinvestmentFunds)}
              </span>
              <span className="text-[11px] font-sans text-slate-400 block mt-1">
                Power: {doorReport.brown.doorsCanPurchase} doors @ $14
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-sans text-slate-500 block">Personal Withdrawals</span>
              <span className="text-2xl font-black text-purple-700">
                {formatCurrency(doorReport.brown.totalWithdrawn)}
              </span>
              <span className="text-[11px] font-sans text-slate-400 block mt-1">
                Owner draws recorded separately
              </span>
            </div>
          </div>

          {/* White Doors Batch Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500">
                White Door Batch Audit Trail
              </span>
              <span className="text-slate-400">Exact formulas: 20 × $23, Transport $25, FB $26, Walk-in $27</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold">Batch Ref</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Purchased</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Purchase Cost</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Sold</th>
                    <th className="py-2.5 px-3 font-semibold text-right">In Stock</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Revenue</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Gross Profit</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Transport</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-numbers">
                  {data.whiteBatches.map((batch) => {
                    const metrics = calculateBatchMetrics(batch, data.whiteSales);
                    return (
                      <tr key={batch.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-[#071D3A] font-sans">
                          {batch.batch_number}
                        </td>
                        <td className="py-3 px-3 text-right">{batch.quantity_purchased}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(metrics.totalPurchaseCost)}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#172033]">{metrics.quantitySold}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#F58220]">{metrics.quantityRemaining}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(metrics.totalRevenue)}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(metrics.grossProfit)}</td>
                        <td className="py-3 px-3 text-right text-slate-500">${batch.transport_cost}</td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700">
                          {formatCurrency(metrics.netProfit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          HARDWARE & QUOTATIONS ANALYTICS VIEW
         ======================================================== */}
      {reportType === 'hardware' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono-numbers">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-sans text-slate-500 block">Quotations Generated</span>
              <span className="text-3xl font-black text-[#071D3A]">
                {hardwareReport.quotesCount} quotes
              </span>
              <span className="text-xs font-sans text-slate-400 block mt-1">In selected timeframe</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-sans text-slate-500 block">Total Quoted Value</span>
              <span className="text-3xl font-black text-[#F58220]">
                {formatCurrency(hardwareReport.totalQuotedValue)}
              </span>
              <span className="text-xs font-sans text-slate-400 block mt-1">
                Sum of itemised spreadsheet quotations
              </span>
            </div>
          </div>

          {/* Top Quoted Products Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500">
                Most Frequently Quoted Materials
              </span>
              <span className="text-slate-400">Ranked by total quoted demand</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2.5 px-4 font-semibold w-8">#</th>
                    <th className="py-2.5 px-3 font-semibold">Material / Product Description</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Total Quoted Volume</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total Quoted Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono-numbers">
                  {hardwareReport.topProducts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3 font-sans font-bold text-[#172033] capitalize">
                        {p.name}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {p.count} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-[#071D3A]">
                        {formatCurrency(p.totalValue)}
                      </td>
                    </tr>
                  ))}

                  {hardwareReport.topProducts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-xs text-slate-400">
                        No quoted materials recorded in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
