import React, { useState } from 'react';
import { X, ShoppingBag, CheckCircle2 } from 'lucide-react';
import { AppDatabaseState, Channel, PaymentMethod, PaymentStatus } from '../../types';
import { formatCurrency, multMoney, subMoney, calculateBatchMetrics } from '../../utils/math';
import { storage } from '../../services/storage';

interface QuickSaleModalProps {
  data: AppDatabaseState;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const QuickSaleModal: React.FC<QuickSaleModalProps> = ({
  data,
  isOpen,
  onClose,
  onRefresh,
}) => {
  const [doorType, setDoorType] = useState<'white' | 'brown'>('white');
  const activeWhiteBatches = data.whiteBatches.filter((b) => b.status === 'active');

  const [batchId, setBatchId] = useState(activeWhiteBatches[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [channel, setChannel] = useState<Channel>('facebook');
  const [unitPrice, setUnitPrice] = useState(26);
  const [amountReceived, setAmountReceived] = useState(26);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  if (!isOpen) return null;

  const handleDoorTypeChange = (type: 'white' | 'brown') => {
    setDoorType(type);
    if (type === 'white') {
      const p = channel === 'facebook' ? 26 : 27;
      setUnitPrice(p);
      setAmountReceived(multMoney(p, quantity));
    } else {
      setUnitPrice(18);
      setAmountReceived(multMoney(18, quantity));
    }
  };

  const handleChannelChange = (ch: Channel) => {
    setChannel(ch);
    const p = ch === 'facebook' ? 26 : 27;
    setUnitPrice(p);
    setAmountReceived(multMoney(p, quantity));
  };

  const handleQtyChange = (qty: number) => {
    setQuantity(qty);
    setAmountReceived(multMoney(unitPrice, qty));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const todayStr = new Date().toISOString().split('T')[0];
    const totalAmount = multMoney(unitPrice, quantity);
    const paymentStatus: PaymentStatus =
      amountReceived >= totalAmount ? 'paid' : amountReceived === 0 ? 'credit' : 'partial';

    if (doorType === 'white') {
      const batch = data.whiteBatches.find((b) => b.id === batchId);
      if (!batch) {
        alert('Please select an active white door batch');
        return;
      }
      const metrics = calculateBatchMetrics(batch, data.whiteSales);
      if (quantity > metrics.quantityRemaining) {
        alert(`Cannot sell ${quantity} doors. Only ${metrics.quantityRemaining} remaining in Batch ${batch.batch_number}.`);
        return;
      }

      storage.recordWhiteSale({
        batch_id: batch.id,
        batch_number: batch.batch_number,
        sale_date: todayStr,
        customer_name: customerName.trim() || 'Walk-in Customer',
        quantity,
        unit_price: unitPrice,
        channel,
        payment_status: paymentStatus,
        amount_received: amountReceived,
        payment_method: paymentMethod,
      });
    } else {
      // Brown Door sale
      storage.recordBrownSale({
        sale_date: todayStr,
        customer_name: customerName.trim() || 'Walk-in Customer',
        quantity,
        unit_price: 18,
        payment_status: paymentStatus,
        amount_received: amountReceived,
        payment_method: paymentMethod,
      });
    }

    onRefresh();
    onClose();
  };

  const totalSaleAmount = multMoney(unitPrice, quantity);
  const outstanding = Math.max(0, subMoney(totalSaleAmount, amountReceived));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#F58220] text-white rounded-xl">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#071D3A]">Quick Door Sale</h2>
              <p className="text-[11px] text-slate-500">Record cash & credit instantly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {/* Select Door System */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Select Door Model</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDoorTypeChange('white')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                  doorType === 'white'
                    ? 'bg-[#071D3A] text-white border-[#071D3A] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                White Doors ($26 / $27)
              </button>
              <button
                type="button"
                onClick={() => handleDoorTypeChange('brown')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition ${
                  doorType === 'brown'
                    ? 'bg-[#F58220] text-white border-[#F58220] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Brown Doors ($18 Flat)
              </button>
            </div>
          </div>

          {/* If White, select batch & channel */}
          {doorType === 'white' && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Select Active Batch</label>
                <select
                  required
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                >
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

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Channel</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleChannelChange('facebook')}
                    className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition ${
                      channel === 'facebook'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Facebook ($26)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChannelChange('walk-in')}
                    className={`py-1.5 px-3 text-xs font-semibold rounded-lg border transition ${
                      channel === 'walk-in'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Walk-in ($27)
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Quantity & Cash */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block">Quantity</label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block">Total Sale ($)</label>
              <div className="w-full px-3 py-2 text-sm font-mono font-bold text-[#071D3A] bg-slate-100 rounded-lg border border-slate-200">
                {formatCurrency(totalSaleAmount)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-emerald-800 block">Cash Received ($)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                required
                value={amountReceived}
                onChange={(e) => setAmountReceived(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-emerald-400 rounded-lg font-mono font-bold text-emerald-700 bg-emerald-50/40 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-rose-800 block">Customer Credit ($)</label>
              <div className="w-full px-3 py-2 text-sm font-mono font-bold text-rose-600 bg-rose-50/50 rounded-lg border border-rose-200">
                {formatCurrency(outstanding)}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block">Customer Name</label>
            <input
              type="text"
              placeholder="e.g. Tendai Moyo"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />
          </div>

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
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#F58220] hover:bg-[#e07212] rounded-xl shadow-xs"
            >
              Confirm Sale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
