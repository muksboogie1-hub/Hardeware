import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Sparkles,
  Save,
  Eye,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Share2,
} from 'lucide-react';
import { AppDatabaseState, Quotation, QuotationLineItem } from '../../types';
import { formatCurrency, multMoney, subMoney, addMoney } from '../../utils/math';
import { parseRawQuotationText, findMatchingPriceItem } from '../../utils/quotationParser';
import { storage } from '../../services/storage';
import { QuotationDocument } from './QuotationDocument';

interface QuotationManagerProps {
  data: AppDatabaseState;
  onRefresh: () => void;
}

export const QuotationManager: React.FC<QuotationManagerProps> = ({ data, onRefresh }) => {
  const [activeSubView, setActiveSubView] = useState<'list' | 'editor' | 'view'>('list');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Editor Form States
  const [rawText, setRawText] = useState(`2 x PVC pipes 19mm
100 x Coupling
100 x Nipples
12 x Round boxes`);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [quoteNumber, setQuoteNumber] = useState(
    `SH-${new Date().getFullYear()}-${String(data.quotations.length + 1).padStart(4, '0')}`
  );
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState('Quotation valid for 7 calendar days. Prices include local pickup.');
  const [items, setItems] = useState<QuotationLineItem[]>([]);
  const [autoLearnPrices, setAutoLearnPrices] = useState(true);

  // Parse raw text into spreadsheet rows
  const handleParseText = () => {
    if (!rawText.trim()) return;
    const parsedItems = parseRawQuotationText(rawText, data.priceLibrary);
    setItems(parsedItems);
  };

  // Add blank row
  const handleAddRow = () => {
    setItems([
      ...items,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        item_description: '',
        quantity: 1,
        unit: 'pcs',
        unit_price: 0,
        line_total: 0,
        matched_from_library: false,
      },
    ]);
  };

  // Update specific row cell
  const handleUpdateItem = (
    id: string,
    field: keyof QuotationLineItem,
    value: string | number
  ) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: value };

        // If description changed, attempt to auto-match price
        if (field === 'item_description' && typeof value === 'string') {
          const match = findMatchingPriceItem(value, data.priceLibrary);
          if (match) {
            updated.unit_price = match.current_unit_price;
            updated.unit = match.unit || updated.unit;
            updated.matched_from_library = true;
          }
        }

        // Recalculate line total safely
        const qty = field === 'quantity' ? Number(value) : item.quantity;
        const price = field === 'unit_price' ? Number(value) : item.unit_price;
        updated.line_total = multMoney(price, qty);

        return updated;
      })
    );
  };

  // Delete row
  const handleDeleteItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  // Calculations
  const subtotal = items.reduce((acc, item) => addMoney(acc, item.line_total), 0);
  const grandTotal = Math.max(0, subMoney(subtotal, discount));

  // Save Quotation & Learn Prices
  const handleSaveQuotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Please enter a Customer Name');
      return;
    }
    if (items.length === 0) {
      alert('Please add at least one line item');
      return;
    }

    const saved = storage.saveQuotation({
      quotation_number: quoteNumber,
      date: quoteDate,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      subtotal,
      discount: Number(discount),
      grand_total: grandTotal,
      status: 'confirmed',
      notes,
      raw_pasted_text: rawText,
      items,
    });

    // Auto-learn new prices or update price library if user enabled learning
    if (autoLearnPrices) {
      items.forEach((item) => {
        if (item.item_description.trim() && item.unit_price > 0) {
          storage.saveOrUpdatePriceItem({
            product_name: item.item_description.trim(),
            standardized_name: item.item_description.trim().toLowerCase(),
            category: 'hardware',
            unit: item.unit || 'pcs',
            current_unit_price: item.unit_price,
            reason: `Confirmed quotation ${quoteNumber}`,
          });
        }
      });
    }

    onRefresh();
    setSelectedQuotation(saved);
    setActiveSubView('view');
  };

  // Start new quotation editor
  const handleStartNewQuote = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteNumber(`SH-${new Date().getFullYear()}-${String(data.quotations.length + 1).padStart(4, '0')}`);
    setDiscount(0);
    setRawText(`2 x PVC pipes 19mm\n100 x Coupling\n100 x Nipples\n12 x Round boxes`);
    const initialItems = parseRawQuotationText(
      `2 x PVC pipes 19mm\n100 x Coupling\n100 x Nipples\n12 x Round boxes`,
      data.priceLibrary
    );
    setItems(initialItems);
    setActiveSubView('editor');
  };

  // Duplicate existing quote
  const handleDuplicateQuote = (quote: Quotation) => {
    setCustomerName(`${quote.customer_name} (Copy)`);
    setCustomerPhone(quote.customer_phone || '');
    setCustomerAddress(quote.customer_address || '');
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteNumber(`SH-${new Date().getFullYear()}-${String(data.quotations.length + 1).padStart(4, '0')}`);
    setDiscount(quote.discount || 0);
    setNotes(quote.notes || '');
    setItems(
      quote.items.map((i) => ({
        ...i,
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      }))
    );
    setActiveSubView('editor');
  };

  // Filtered quotes list
  const filteredQuotations = data.quotations.filter(
    (q) =>
      q.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quotation_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render Document View
  if (activeSubView === 'view' && selectedQuotation) {
    return (
      <QuotationDocument
        quotation={selectedQuotation}
        settings={data.settings}
        onBack={() => setActiveSubView('list')}
        onDuplicate={handleDuplicateQuote}
      />
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            Quotation Generator
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Excel-style spreadsheet with raw text pasting and self-learning price library
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeSubView === 'list' ? (
            <button
              onClick={handleStartNewQuote}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#F58220] hover:bg-[#e07212] text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Quotation</span>
            </button>
          ) : (
            <button
              onClick={() => setActiveSubView('list')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel / View All
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          SUB-VIEW 1: QUOTATION SPREADSHEET EDITOR
         ======================================================== */}
      {activeSubView === 'editor' && (
        <form onSubmit={handleSaveQuotation} className="space-y-6">
          {/* Paste Raw Text Section */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F58220]" />
                <h3 className="text-sm font-bold text-[#071D3A]">
                  Step 1: Paste Raw Quotation Text
                </h3>
              </div>
              <button
                type="button"
                onClick={handleParseText}
                className="px-3 py-1.5 bg-[#071D3A] hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs transition"
              >
                Parse & Populate Spreadsheet
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2 mb-2">
              Paste customer WhatsApp text or bullet points (e.g. <code>2 x PVC pipes 19mm</code>, <code>100 x Coupling</code>, <code>8 lengths timber 2x4</code>).
            </p>

            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste raw quote lines here..."
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />
          </div>

          {/* Quotation Details (Customer, Ref, Date) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-[#071D3A] pb-3 border-b border-slate-100">
              Step 2: Customer & Document Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mufakose Contractor"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Phone / WhatsApp</label>
                <input
                  type="text"
                  placeholder="+263 77..."
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Quotation Ref</label>
                <input
                  type="text"
                  required
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Interactive Spreadsheet Grid */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-[#071D3A]">
                  Step 3: Interactive Spreadsheet Grid
                </h3>
                <p className="text-xs text-slate-500">
                  Known items are auto-priced from the Price Library. Enter any missing prices.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#071D3A] text-white">
                    <th className="py-2.5 px-3 rounded-l-lg font-semibold w-8 text-center">#</th>
                    <th className="py-2.5 px-3 font-semibold">Item Description</th>
                    <th className="py-2.5 px-3 font-semibold w-24">Qty</th>
                    <th className="py-2.5 px-3 font-semibold w-24">Unit</th>
                    <th className="py-2.5 px-3 font-semibold w-28">Unit Price ($)</th>
                    <th className="py-2.5 px-3 font-semibold w-28 text-right">Line Total</th>
                    <th className="py-2.5 px-2 rounded-r-lg w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center text-slate-400 font-mono">
                        {index + 1}
                      </td>

                      {/* Description */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          required
                          value={item.item_description}
                          onChange={(e) => handleUpdateItem(item.id, 'item_description', e.target.value)}
                          placeholder="e.g. PVC pipes 19mm"
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-medium focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden"
                        />
                        {item.matched_from_library && (
                          <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
                            ✓ Matched from library
                          </span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono font-bold focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden"
                        />
                      </td>

                      {/* Unit */}
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                          placeholder="pcs"
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden"
                        />
                      </td>

                      {/* Unit Price */}
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          required
                          value={item.unit_price === 0 ? '' : item.unit_price}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className={`w-full px-2 py-1.5 text-xs border rounded font-mono font-bold focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden ${
                            item.unit_price === 0
                              ? 'border-amber-400 bg-amber-50 text-amber-900 placeholder:text-amber-500'
                              : 'border-slate-300 text-slate-800'
                          }`}
                        />
                      </td>

                      {/* Line Total */}
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#071D3A]">
                        {formatCurrency(item.line_total)}
                      </td>

                      {/* Delete */}
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {items.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  Spreadsheet is empty. Paste raw text above and click "Parse & Populate Spreadsheet" or click "Add Row".
                </div>
              )}
            </div>

            {/* Calculations Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-4">
              {/* Learning Price Library Checkbox */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="autoLearn"
                  checked={autoLearnPrices}
                  onChange={(e) => setAutoLearnPrices(e.target.checked)}
                  className="mt-0.5 rounded text-[#071D3A] focus:ring-[#071D3A]"
                />
                <label htmlFor="autoLearn" className="text-xs text-slate-600 cursor-pointer">
                  <strong className="text-[#071D3A]">Learning Price Library:</strong> Automatically save confirmed product prices to the library for future quotations.
                </label>
              </div>

              {/* Grand Total Display */}
              <div className="w-full sm:w-64 space-y-2 font-mono-numbers text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-bold text-[#071D3A]">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Discount ($):</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-right"
                  />
                </div>
                <div className="flex justify-between items-center text-base font-black text-[#071D3A] pt-2 border-t border-slate-200">
                  <span>GRAND TOTAL:</span>
                  <span className="text-[#F58220]">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveSubView('list')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs active:scale-95 transition"
              >
                <Save className="w-4 h-4 text-[#F58220]" />
                <span>Save & Generate Official Document</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================
          SUB-VIEW 2: QUOTATIONS LIST
         ======================================================== */}
      {activeSubView === 'list' && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search quotations by customer name or quotation number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                All Saved Quotations ({filteredQuotations.length})
              </span>
              <span className="text-xs text-slate-400">
                Click any quotation to view, print, or share via WhatsApp
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredQuotations.map((q) => (
                <div
                  key={q.id}
                  onClick={() => {
                    setSelectedQuotation(q);
                    setActiveSubView('view');
                  }}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-[#071D3A] font-mono-numbers">
                        {q.quotation_number}
                      </span>
                      <span className="text-xs text-slate-400 font-mono-numbers">{q.date}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        {q.status}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[#172033] mt-1">
                      {q.customer_name}
                      {q.customer_phone ? ` (${q.customer_phone})` : ''}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {q.items.length} item(s): {q.items.map((i) => i.item_description).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right font-mono-numbers">
                      <span className="text-base font-black text-[#071D3A] block">
                        {formatCurrency(q.grand_total)}
                      </span>
                      <span className="text-[10px] text-slate-400 block font-sans">Grand Total</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQuotation(q);
                        setActiveSubView('view');
                      }}
                      className="p-2 text-slate-400 hover:text-[#071D3A] hover:bg-slate-100 rounded-lg transition"
                      title="View Quotation"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {filteredQuotations.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  No quotations found. Click "Create Quotation" to generate your first quotation.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
