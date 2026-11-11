import React, { useState } from 'react';
import {
  DoorOpen,
  Plus,
  RefreshCw,
  ShoppingBag,
  Truck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  DollarSign,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  AppDatabaseState,
  WhiteDoorBatch,
  WhiteDoorSale,
  BrownDoorPurchase,
  BrownDoorSale,
  BrownDoorWithdrawal,
  Channel,
  PaymentMethod,
  PaymentStatus,
} from '../../types';
import {
  formatCurrency,
  calculateBatchMetrics,
  calculateBrownDoorMetrics,
  multMoney,
  subMoney,
  addMoney,
  round2,
} from '../../utils/math';
import { storage } from '../../services/storage';

interface DoorManagementProps {
  data: AppDatabaseState;
  onRefresh: () => void;
}

export const DoorManagement: React.FC<DoorManagementProps> = ({ data, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'white' | 'brown'>('white');

  // Modals state for White Doors
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showWhiteSaleModal, setShowWhiteSaleModal] = useState(false);
  const [selectedBatchForSale, setSelectedBatchForSale] = useState<string>('');
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<string | null>(null);

  // Modals state for Brown Doors
  const [showBrownPurchaseModal, setShowBrownPurchaseModal] = useState(false);
  const [showBrownSaleModal, setShowBrownSaleModal] = useState(false);
  const [showBrownWithdrawalModal, setShowBrownWithdrawalModal] = useState(false);

  // Form states: New White Batch
  const [batchForm, setBatchForm] = useState({
    batch_number: `WD-${new Date().getFullYear()}-${String(data.whiteBatches.length + 1).padStart(3, '0')}`,
    purchase_date: new Date().toISOString().split('T')[0],
    quantity_purchased: 20,
    purchase_price_per_door: data.settings.default_white_purchase_price || 23,
    transport_cost: data.settings.default_white_transport || 25,
    notes: '',
  });

  // Form states: White Door Sale
  const [whiteSaleForm, setWhiteSaleForm] = useState<{
    batch_id: string;
    sale_date: string;
    customer_name: string;
    customer_phone: string;
    quantity: number;
    unit_price: number;
    channel: Channel;
    payment_status: PaymentStatus;
    amount_received: number;
    payment_method: PaymentMethod;
    notes: string;
  }>({
    batch_id: data.whiteBatches.find((b) => b.status === 'active')?.id || '',
    sale_date: new Date().toISOString().split('T')[0],
    customer_name: '',
    customer_phone: '',
    quantity: 1,
    unit_price: 26,
    channel: 'facebook',
    payment_status: 'paid',
    amount_received: 26,
    payment_method: 'cash',
    notes: '',
  });

  // Form states: Brown Purchase
  const [brownPurchaseForm, setBrownPurchaseForm] = useState({
    purchase_date: new Date().toISOString().split('T')[0],
    quantity: 10,
    purchase_price_per_door: 14,
    supplier_notes: '',
  });

  // Form states: Brown Sale
  const [brownSaleForm, setBrownSaleForm] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    customer_name: '',
    customer_phone: '',
    quantity: 1,
    unit_price: 18,
    payment_status: 'paid' as PaymentStatus,
    amount_received: 18,
    payment_method: 'cash' as PaymentMethod,
    notes: '',
  });

  // Form states: Brown Withdrawal
  const [brownWithdrawalForm, setBrownWithdrawalForm] = useState({
    withdrawal_date: new Date().toISOString().split('T')[0],
    amount: 20,
    withdrawn_by: 'Owner',
    reason: '',
  });

  // Calculations
  const activeWhiteBatches = data.whiteBatches.filter((b) => b.status === 'active');
  const totalWhiteStock = data.whiteBatches.reduce((acc, b) => {
    const metrics = calculateBatchMetrics(b, data.whiteSales);
    return acc + metrics.quantityRemaining;
  }, 0);

  const brownMetrics = calculateBrownDoorMetrics(
    data.brownPurchases,
    data.brownSales,
    data.brownWithdrawals
  );

  // Handlers: White Door
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (batchForm.quantity_purchased <= 0) {
      alert('Quantity must be greater than zero');
      return;
    }
    const totalCost = multMoney(batchForm.purchase_price_per_door, batchForm.quantity_purchased);
    const confirmed = window.confirm(
      `Confirm purchase of Batch ${batchForm.batch_number}?\n\nQuantity: ${batchForm.quantity_purchased} doors @ $${batchForm.purchase_price_per_door}\nTotal Cost: $${totalCost}\nTransport: $${batchForm.transport_cost}`
    );
    if (!confirmed) return;

    storage.createWhiteBatch({
      batch_number: batchForm.batch_number,
      purchase_date: batchForm.purchase_date,
      quantity_purchased: Number(batchForm.quantity_purchased),
      purchase_price_per_door: Number(batchForm.purchase_price_per_door),
      transport_cost: Number(batchForm.transport_cost),
      notes: batchForm.notes,
    });

    setShowNewBatchModal(false);
    onRefresh();
  };

  const handleRecordWhiteSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whiteSaleForm.batch_id) {
      alert('Please select an active batch');
      return;
    }
    const batch = data.whiteBatches.find((b) => b.id === whiteSaleForm.batch_id);
    if (!batch) return;

    const metrics = calculateBatchMetrics(batch, data.whiteSales);
    if (whiteSaleForm.quantity > metrics.quantityRemaining) {
      alert(`Cannot sell ${whiteSaleForm.quantity} doors. Only ${metrics.quantityRemaining} remaining in Batch ${batch.batch_number}.`);
      return;
    }

    const totalAmount = multMoney(whiteSaleForm.unit_price, whiteSaleForm.quantity);
    if (whiteSaleForm.amount_received > totalAmount) {
      alert('Amount received cannot exceed total amount');
      return;
    }

    storage.recordWhiteSale({
      batch_id: batch.id,
      batch_number: batch.batch_number,
      sale_date: whiteSaleForm.sale_date,
      customer_name: whiteSaleForm.customer_name || 'Customer',
      customer_phone: whiteSaleForm.customer_phone,
      quantity: Number(whiteSaleForm.quantity),
      unit_price: Number(whiteSaleForm.unit_price),
      channel: whiteSaleForm.channel,
      payment_status: whiteSaleForm.payment_status,
      amount_received: Number(whiteSaleForm.amount_received),
      payment_method: whiteSaleForm.payment_method,
      notes: whiteSaleForm.notes,
    });

    setShowWhiteSaleModal(false);
    onRefresh();
  };

  // Handlers: Brown Doors
  const handleBrownPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const totalCost = multMoney(brownPurchaseForm.purchase_price_per_door, brownPurchaseForm.quantity);
    const confirmed = window.confirm(
      `Confirm purchase of ${brownPurchaseForm.quantity} Brown Doors?\nTotal Cost: $${totalCost}\nAvailable Funds: $${brownMetrics.availableReinvestmentFunds}`
    );
    if (!confirmed) return;

    storage.recordBrownPurchase({
      purchase_date: brownPurchaseForm.purchase_date,
      quantity: Number(brownPurchaseForm.quantity),
      purchase_price_per_door: Number(brownPurchaseForm.purchase_price_per_door),
      supplier_notes: brownPurchaseForm.supplier_notes,
    });

    setShowBrownPurchaseModal(false);
    onRefresh();
  };

  const handleBrownSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (brownSaleForm.quantity > brownMetrics.currentStock) {
      alert(`Cannot sell ${brownSaleForm.quantity} doors. Only ${brownMetrics.currentStock} in stock.`);
      return;
    }

    const totalAmount = multMoney(brownSaleForm.unit_price, brownSaleForm.quantity);
    storage.recordBrownSale({
      sale_date: brownSaleForm.sale_date,
      customer_name: brownSaleForm.customer_name || 'Customer',
      customer_phone: brownSaleForm.customer_phone,
      quantity: Number(brownSaleForm.quantity),
      unit_price: Number(brownSaleForm.unit_price),
      payment_status: brownSaleForm.payment_status,
      amount_received: Number(brownSaleForm.amount_received),
      payment_method: brownSaleForm.payment_method,
      notes: brownSaleForm.notes,
    });

    setShowBrownSaleModal(false);
    onRefresh();
  };

  const handleBrownWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    if (brownWithdrawalForm.amount <= 0) {
      alert('Withdrawal amount must be greater than zero');
      return;
    }
    if (brownWithdrawalForm.amount > brownMetrics.availableReinvestmentFunds) {
      const confirmExceed = window.confirm(
        `Warning: Withdrawal of $${brownWithdrawalForm.amount} exceeds available funds ($${brownMetrics.availableReinvestmentFunds}). Proceed?`
      );
      if (!confirmExceed) return;
    }

    storage.recordBrownWithdrawal({
      withdrawal_date: brownWithdrawalForm.withdrawal_date,
      amount: Number(brownWithdrawalForm.amount),
      withdrawn_by: brownWithdrawalForm.withdrawn_by,
      reason: brownWithdrawalForm.reason || 'Personal withdrawal',
    });

    setShowBrownWithdrawalModal(false);
    onRefresh();
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Top Header & Subsystem Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            Door Operations Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Two strictly isolated systems: White Batch Accounting & Brown Reinvestment Engine
          </p>
        </div>

        {/* System Tab Toggle */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('white')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'white'
                ? 'bg-[#071D3A] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#071D3A]'
            }`}
          >
            <span>White Doors</span>
            <span className="font-mono bg-white/20 text-white px-1.5 py-0.2 rounded text-[10px]">
              {totalWhiteStock}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('brown')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'brown'
                ? 'bg-[#F58220] text-white shadow-xs'
                : 'text-slate-600 hover:text-[#071D3A]'
            }`}
          >
            <span>Brown Doors</span>
            <span className="font-mono bg-white/20 text-white px-1.5 py-0.2 rounded text-[10px]">
              {brownMetrics.currentStock}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================
          A. WHITE DOORS — BATCH ACCOUNTING SYSTEM
         ======================================================== */}
      {activeTab === 'white' && (
        <div className="space-y-6">
          {/* Action & Summary Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#071D3A] text-white p-4 sm:p-5 rounded-2xl shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">White Doors — Batch Accounting</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-[#F58220] px-2 py-0.5 rounded text-white">
                  Target: 20 Doors @ $23
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Transport is $25 deducted once per batch. Net profit is strictly set aside. Variable pricing supported ($26 FB / $27 Walk-in).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setWhiteSaleForm({
                    ...whiteSaleForm,
                    batch_id: activeWhiteBatches[0]?.id || '',
                  });
                  setShowWhiteSaleModal(true);
                }}
                disabled={activeWhiteBatches.length === 0}
                className="px-3.5 py-2 bg-[#F58220] hover:bg-[#e07212] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition flex items-center gap-1.5"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Record White Sale</span>
              </button>

              <button
                onClick={() => setShowNewBatchModal(true)}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold rounded-xl active:scale-95 transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>New Batch</span>
              </button>
            </div>
          </div>

          {/* Batches List */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Purchased Batches ({data.whiteBatches.length})
            </h3>

            {data.whiteBatches.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <DoorOpen className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-[#071D3A] mt-2">No White Door Batches Yet</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Click "New Batch" to record your first batch of white doors with quantity, unit cost, and transport deduction.
                </p>
                <button
                  onClick={() => setShowNewBatchModal(true)}
                  className="mt-4 px-4 py-2 bg-[#071D3A] text-white text-xs font-bold rounded-xl"
                >
                  Create Batch WD-2026-001
                </button>
              </div>
            ) : (
              data.whiteBatches.map((batch) => {
                const metrics = calculateBatchMetrics(batch, data.whiteSales);
                const batchSales = data.whiteSales.filter((s) => s.batch_id === batch.id);
                const isExpanded = selectedBatchDetails === batch.id;

                return (
                  <div
                    key={batch.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs transition hover:border-slate-300"
                  >
                    {/* Batch Main Card */}
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-base sm:text-lg text-[#071D3A] font-mono-numbers">
                            {batch.batch_number}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              batch.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {batch.status}
                          </span>
                          <span className="text-xs text-slate-400 font-mono-numbers">
                            Purchased {batch.purchase_date}
                          </span>
                        </div>

                        {/* Quick Stock Remaining Badge */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Remaining:</span>
                          <span className="text-sm font-extrabold font-mono-numbers text-[#071D3A] bg-slate-100 px-2.5 py-0.5 rounded-lg">
                            {metrics.quantityRemaining} of {batch.quantity_purchased} doors
                          </span>
                        </div>
                      </div>

                      {/* Financial Math Grid for this Batch */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                        <div>
                          <span className="text-[11px] text-slate-400 block">Purchase Cost</span>
                          <span className="text-sm font-bold text-[#172033] font-mono-numbers">
                            {formatCurrency(metrics.totalPurchaseCost)}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono-numbers">
                            {batch.quantity_purchased} @ ${batch.purchase_price_per_door}
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">Revenue Collected</span>
                          <span className="text-sm font-bold text-emerald-700 font-mono-numbers">
                            {formatCurrency(metrics.collectedRevenue)}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono-numbers">
                            {metrics.quantitySold} sold ({metrics.unpaidSales > 0 ? `$${metrics.unpaidSales} unpaid` : 'all paid'})
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">Gross Profit</span>
                          <span className="text-sm font-bold text-[#071D3A] font-mono-numbers">
                            {formatCurrency(metrics.grossProfit)}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono-numbers">
                            Before ${batch.transport_cost} transport
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-400 block">Net Profit Kept Aside</span>
                          <span className={`text-base font-extrabold font-mono-numbers ${
                            metrics.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}>
                            {formatCurrency(metrics.netProfit)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            After $25 transport
                          </span>
                        </div>
                      </div>

                      {/* Action buttons inside batch */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {batch.status === 'active' && (
                            <button
                              onClick={() => {
                                setWhiteSaleForm({
                                  ...whiteSaleForm,
                                  batch_id: batch.id,
                                });
                                setShowWhiteSaleModal(true);
                              }}
                              className="px-3 py-1.5 bg-[#F58220] hover:bg-[#e07212] text-white text-xs font-bold rounded-lg shadow-xs active:scale-95 transition"
                            >
                              Sell From This Batch
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const dmg = prompt('Enter number of damaged doors to record for this batch:', '0');
                              if (dmg && !isNaN(parseInt(dmg))) {
                                storage.updateWhiteBatchDamages(batch.id, parseInt(dmg), 0);
                                onRefresh();
                              }
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                          >
                            Record Damage ({batch.damaged_doors || 0})
                          </button>
                        </div>

                        <button
                          onClick={() => setSelectedBatchDetails(isExpanded ? null : batch.id)}
                          className="text-xs font-bold text-[#071D3A] hover:underline flex items-center gap-1"
                        >
                          <span>{batchSales.length} Sales Recorded</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Sales Sub-table for this Batch */}
                    {isExpanded && (
                      <div className="bg-slate-50 p-4 border-t border-slate-200">
                        <h4 className="text-xs font-bold text-[#071D3A] uppercase tracking-wider mb-2">
                          Sales History for {batch.batch_number}
                        </h4>
                        {batchSales.length === 0 ? (
                          <p className="text-xs text-slate-500">No sales recorded yet for this batch.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                  <th className="py-1.5 font-semibold">Date</th>
                                  <th className="py-1.5 font-semibold">Customer</th>
                                  <th className="py-1.5 font-semibold">Channel</th>
                                  <th className="py-1.5 font-semibold text-right">Qty</th>
                                  <th className="py-1.5 font-semibold text-right">Price</th>
                                  <th className="py-1.5 font-semibold text-right">Total</th>
                                  <th className="py-1.5 font-semibold text-right">Collected</th>
                                  <th className="py-1.5 font-semibold text-right">Outstanding</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 font-mono-numbers">
                                {batchSales.map((sale) => (
                                  <tr key={sale.id} className="hover:bg-white/60">
                                    <td className="py-2 text-slate-600">{sale.sale_date}</td>
                                    <td className="py-2 font-medium text-[#172033] font-sans">
                                      {sale.customer_name || 'Walk-in'}
                                    </td>
                                    <td className="py-2">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold font-sans uppercase ${
                                          sale.channel === 'facebook'
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'bg-emerald-50 text-emerald-700'
                                        }`}
                                      >
                                        {sale.channel}
                                      </span>
                                    </td>
                                    <td className="py-2 text-right font-bold">{sale.quantity}</td>
                                    <td className="py-2 text-right">${sale.unit_price}</td>
                                    <td className="py-2 text-right font-bold text-[#172033]">
                                      {formatCurrency(sale.total_amount)}
                                    </td>
                                    <td className="py-2 text-right font-bold text-emerald-700">
                                      {formatCurrency(sale.amount_received)}
                                    </td>
                                    <td className="py-2 text-right text-rose-600 font-bold">
                                      {sale.outstanding_balance > 0 ? formatCurrency(sale.outstanding_balance) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          B. BROWN DOORS — REINVESTMENT SYSTEM
         ======================================================== */}
      {activeTab === 'brown' && (
        <div className="space-y-6">
          {/* Action & Reinvestment Pool Strip */}
          <div className="bg-[#071D3A] text-white p-4 sm:p-5 rounded-2xl shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold">Brown Doors — Growth & Reinvestment Engine</h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-[#F58220] px-2 py-0.5 rounded text-white">
                    Buy $14 / Sell $18
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-xl">
                  Reinvestment model: all revenue from sold stock is calculated to determine maximum purchasing power. No transport deduction. Personal withdrawals are tracked strictly outside operating costs.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowBrownSaleModal(true)}
                  disabled={brownMetrics.currentStock <= 0}
                  className="px-3.5 py-2 bg-[#F58220] hover:bg-[#e07212] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition flex items-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Sell Brown Door ($18)</span>
                </button>

                <button
                  onClick={() => setShowBrownPurchaseModal(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Restock Doors ($14)</span>
                </button>

                <button
                  onClick={() => setShowBrownWithdrawalModal(true)}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold rounded-xl transition"
                >
                  <span>Withdraw Funds</span>
                </button>
              </div>
            </div>

            {/* Reinvestment Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 font-mono-numbers">
              <div>
                <span className="text-[11px] text-slate-400 block font-sans">Available Reinvestment Pool</span>
                <span className="text-2xl font-black text-emerald-400">
                  {formatCurrency(brownMetrics.availableReinvestmentFunds)}
                </span>
                <span className="text-[10px] text-slate-300 block font-sans">Ready for next purchase</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-sans">Purchasing Power</span>
                <span className="text-2xl font-black text-[#F58220]">
                  {brownMetrics.doorsCanPurchase} doors
                </span>
                <span className="text-[10px] text-slate-300 block font-sans">at $14/door cost</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-sans">Current Physical Stock</span>
                <span className="text-2xl font-black text-white">
                  {brownMetrics.currentStock} doors
                </span>
                <span className="text-[10px] text-slate-300 block font-sans">{brownMetrics.totalSold} sold to date</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block font-sans">Personal Withdrawals</span>
                <span className="text-2xl font-black text-purple-300">
                  {formatCurrency(brownMetrics.totalWithdrawn)}
                </span>
                <span className="text-[10px] text-slate-300 block font-sans">Tracked separately</span>
              </div>
            </div>
          </div>

          {/* Grids: Purchase History vs Sales History vs Withdrawals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales History */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-[#071D3A]">Brown Door Sales ({data.brownSales.length})</h3>
                <span className="text-xs font-mono font-bold text-emerald-700">
                  {formatCurrency(brownMetrics.totalRevenue)} Revenue
                </span>
              </div>

              <div className="mt-3 divide-y divide-slate-100">
                {data.brownSales.map((sale) => (
                  <div key={sale.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-[#172033] block">
                        {sale.quantity} door(s) to {sale.customer_name || 'Customer'}
                      </span>
                      <span className="text-slate-400 font-mono-numbers">
                        {sale.sale_date} · @ ${sale.unit_price}/door
                      </span>
                    </div>
                    <div className="text-right font-mono-numbers">
                      <span className="font-bold text-[#071D3A] block">
                        {formatCurrency(sale.total_amount)}
                      </span>
                      <span className="text-emerald-600 text-[10px]">
                        Profit: +{formatCurrency(multMoney(subMoney(sale.unit_price, 14), sale.quantity))}
                      </span>
                    </div>
                  </div>
                ))}

                {data.brownSales.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No brown door sales recorded yet.
                  </div>
                )}
              </div>
            </div>

            {/* Restock & Reinvestment History */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-[#071D3A]">Reinvestment Purchases ({data.brownPurchases.length})</h3>
                <span className="text-xs font-mono font-bold text-slate-700">
                  {formatCurrency(brownMetrics.totalCost)} Invested
                </span>
              </div>

              <div className="mt-3 divide-y divide-slate-100">
                {data.brownPurchases.map((purchase) => (
                  <div key={purchase.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-[#172033] block">
                        Restocked {purchase.quantity} doors
                      </span>
                      <span className="text-slate-400 font-mono-numbers">
                        {purchase.purchase_date} · @ ${purchase.purchase_price_per_door}/door
                      </span>
                    </div>
                    <div className="text-right font-mono-numbers">
                      <span className="font-bold text-slate-800 block">
                        -{formatCurrency(purchase.total_cost)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {purchase.supplier_notes || 'Reinvested funds'}
                      </span>
                    </div>
                  </div>
                ))}

                {data.brownPurchases.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No brown door purchases recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: NEW WHITE DOOR BATCH
         ======================================================== */}
      {showNewBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">Add New White Door Batch</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Target batch: 20 doors @ $23 with $25 one-time transport.
            </p>

            <form onSubmit={handleCreateBatch} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Batch Number</label>
                <input
                  type="text"
                  required
                  value={batchForm.batch_number}
                  onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Purchase Date</label>
                  <input
                    type="date"
                    required
                    value={batchForm.purchase_date}
                    onChange={(e) => setBatchForm({ ...batchForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={batchForm.quantity_purchased}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity_purchased: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Price per Door ($)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    value={batchForm.purchase_price_per_door}
                    onChange={(e) => setBatchForm({ ...batchForm, purchase_price_per_door: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Transport Cost ($)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={batchForm.transport_cost}
                    onChange={(e) => setBatchForm({ ...batchForm, transport_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Total Calculation Preview */}
              <div className="p-3 bg-[#F4F6F9] rounded-xl text-xs space-y-1 font-mono-numbers">
                <div className="flex justify-between text-slate-600">
                  <span>Batch Purchase Total:</span>
                  <span className="font-bold text-[#071D3A]">
                    {formatCurrency(multMoney(batchForm.purchase_price_per_door, batchForm.quantity_purchased))}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Transport Deduction:</span>
                  <span className="font-bold text-[#071D3A]">{formatCurrency(batchForm.transport_cost)}</span>
                </div>
                <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-1">
                  <span>Total Initial Outlay:</span>
                  <span className="text-[#F58220]">
                    {formatCurrency(
                      addMoney(
                        multMoney(batchForm.purchase_price_per_door, batchForm.quantity_purchased),
                        batchForm.transport_cost
                      )
                    )}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. November shipment from supplier"
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewBatchModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-lg shadow-xs"
                >
                  Confirm & Create Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: RECORD WHITE DOOR SALE
         ======================================================== */}
      {showWhiteSaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">Record White Door Sale</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Facebook standard ($26) vs Walk-in standard ($27). Actual collected cash is recorded.
            </p>

            <form onSubmit={handleRecordWhiteSale} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Select Active Batch</label>
                <select
                  required
                  value={whiteSaleForm.batch_id}
                  onChange={(e) => setWhiteSaleForm({ ...whiteSaleForm, batch_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-medium"
                >
                  <option value="">-- Choose Batch --</option>
                  {activeWhiteBatches.map((b) => {
                    const m = calculateBatchMetrics(b, data.whiteSales);
                    return (
                      <option key={b.id} value={b.id}>
                        {b.batch_number} ({m.quantityRemaining} remaining)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Sales Channel</label>
                  <select
                    value={whiteSaleForm.channel}
                    onChange={(e) => {
                      const ch = e.target.value as Channel;
                      const price = ch === 'facebook' ? 26 : 27;
                      setWhiteSaleForm({
                        ...whiteSaleForm,
                        channel: ch,
                        unit_price: price,
                        amount_received: multMoney(price, whiteSaleForm.quantity),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  >
                    <option value="facebook">Facebook ($26)</option>
                    <option value="walk-in">Walk-in ($27)</option>
                    <option value="other">Other / Custom</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Selling Price ($/door)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    required
                    value={whiteSaleForm.unit_price}
                    onChange={(e) => {
                      const p = parseFloat(e.target.value) || 0;
                      setWhiteSaleForm({
                        ...whiteSaleForm,
                        unit_price: p,
                        amount_received: multMoney(p, whiteSaleForm.quantity),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Quantity Sold</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={whiteSaleForm.quantity}
                    onChange={(e) => {
                      const q = parseInt(e.target.value) || 0;
                      setWhiteSaleForm({
                        ...whiteSaleForm,
                        quantity: q,
                        amount_received: multMoney(whiteSaleForm.unit_price, q),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Sale Date</label>
                  <input
                    type="date"
                    required
                    value={whiteSaleForm.sale_date}
                    onChange={(e) => setWhiteSaleForm({ ...whiteSaleForm, sale_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Total & Payment Split */}
              <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                <div className="flex justify-between text-xs font-bold text-[#071D3A] font-mono-numbers">
                  <span>Total Sale Value:</span>
                  <span>{formatCurrency(multMoney(whiteSaleForm.unit_price, whiteSaleForm.quantity))}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block">
                      Cash Collected ($)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={whiteSaleForm.amount_received}
                      onChange={(e) =>
                        setWhiteSaleForm({
                          ...whiteSaleForm,
                          amount_received: parseFloat(e.target.value) || 0,
                          payment_status:
                            parseFloat(e.target.value) >= multMoney(whiteSaleForm.unit_price, whiteSaleForm.quantity)
                              ? 'paid'
                              : parseFloat(e.target.value) === 0
                              ? 'credit'
                              : 'partial',
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono font-bold text-emerald-700 bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block">
                      Outstanding Balance
                    </label>
                    <div className="px-2.5 py-1.5 text-xs font-mono font-bold text-rose-600 bg-white rounded-lg border border-slate-200">
                      {formatCurrency(
                        Math.max(
                          0,
                          subMoney(
                            multMoney(whiteSaleForm.unit_price, whiteSaleForm.quantity),
                            whiteSaleForm.amount_received
                          )
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Customer Name / Phone</label>
                <input
                  type="text"
                  placeholder="e.g. Tendai Moyo (+263 77...)"
                  value={whiteSaleForm.customer_name}
                  onChange={(e) => setWhiteSaleForm({ ...whiteSaleForm, customer_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWhiteSaleModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#F58220] hover:bg-[#e07212] rounded-lg shadow-xs"
                >
                  Confirm Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: RESTOCK BROWN DOORS ($14)
         ======================================================== */}
      {showBrownPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">Restock Brown Doors</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Purchase doors @ $14 using available reinvestment funds ({formatCurrency(brownMetrics.availableReinvestmentFunds)}).
            </p>

            <form onSubmit={handleBrownPurchase} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Quantity to Buy</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={brownPurchaseForm.quantity}
                    onChange={(e) => setBrownPurchaseForm({ ...brownPurchaseForm, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Unit Cost ($)</label>
                  <input
                    type="number"
                    disabled
                    value={brownPurchaseForm.purchase_price_per_door}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono bg-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Purchase Date</label>
                <input
                  type="date"
                  required
                  value={brownPurchaseForm.purchase_date}
                  onChange={(e) => setBrownPurchaseForm({ ...brownPurchaseForm, purchase_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs font-mono-numbers">
                <div className="flex justify-between text-slate-600">
                  <span>Total Purchase Cost:</span>
                  <span className="font-bold text-[#071D3A]">
                    {formatCurrency(multMoney(brownPurchaseForm.purchase_price_per_door, brownPurchaseForm.quantity))}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Remaining Reinvestment Funds:</span>
                  <span className="font-bold text-emerald-700">
                    {formatCurrency(
                      subMoney(
                        brownMetrics.availableReinvestmentFunds,
                        multMoney(brownPurchaseForm.purchase_price_per_door, brownPurchaseForm.quantity)
                      )
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBrownPurchaseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs"
                >
                  Confirm Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: RECORD BROWN DOOR SALE ($18)
         ======================================================== */}
      {showBrownSaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">Record Brown Door Sale</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Selling price is $18 per door ($4 gross profit added to reinvestment pool).
            </p>

            <form onSubmit={handleBrownSale} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    max={brownMetrics.currentStock}
                    required
                    value={brownSaleForm.quantity}
                    onChange={(e) => {
                      const q = parseInt(e.target.value) || 0;
                      setBrownSaleForm({
                        ...brownSaleForm,
                        quantity: q,
                        amount_received: multMoney(brownSaleForm.unit_price, q),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">Max {brownMetrics.currentStock} in stock</span>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Unit Price ($)</label>
                  <input
                    type="number"
                    disabled
                    value={brownSaleForm.unit_price}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono bg-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Cash Received ($)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={brownSaleForm.amount_received}
                  onChange={(e) => setBrownSaleForm({ ...brownSaleForm, amount_received: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold text-emerald-700 focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Customer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mr. Ncube"
                  value={brownSaleForm.customer_name}
                  onChange={(e) => setBrownSaleForm({ ...brownSaleForm, customer_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBrownSaleModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#F58220] hover:bg-[#e07212] rounded-lg shadow-xs"
                >
                  Record Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: PERSONAL WITHDRAWAL
         ======================================================== */}
      {showBrownWithdrawalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">Record Personal Withdrawal</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personal withdrawals reduce the reinvestment pool but are NOT recorded as operating expenses.
            </p>

            <form onSubmit={handleBrownWithdrawal} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Withdrawal Amount ($)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={brownWithdrawalForm.amount}
                  onChange={(e) => setBrownWithdrawalForm({ ...brownWithdrawalForm, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold text-purple-700 focus:ring-2 focus:ring-purple-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Withdrawn By</label>
                <input
                  type="text"
                  required
                  value={brownWithdrawalForm.withdrawn_by}
                  onChange={(e) => setBrownWithdrawalForm({ ...brownWithdrawalForm, withdrawn_by: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Reason / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Personal living allowance / school fees"
                  value={brownWithdrawalForm.reason}
                  onChange={(e) => setBrownWithdrawalForm({ ...brownWithdrawalForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBrownWithdrawalModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs"
                >
                  Confirm Withdrawal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
