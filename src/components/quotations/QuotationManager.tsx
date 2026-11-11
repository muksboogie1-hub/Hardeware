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
  BookOpen,
  ArrowRight,
  X,
  FileCheck,
} from 'lucide-react';
import { AppDatabaseState, Quotation, QuotationLineItem, PriceItem, ProductCategory } from '../../types';
import { formatCurrency, multMoney, subMoney, addMoney } from '../../utils/math';
import {
  parseRawQuotationText,
  matchProductWithLibrary,
  generateUniqueId,
  standardizeProductName,
} from '../../utils/quotationParser';
import { storage } from '../../services/storage';
import { QuotationDocument } from './QuotationDocument';

interface QuotationManagerProps {
  data: AppDatabaseState;
  onRefresh: () => void;
}

interface PriceLibraryDiffItem {
  item_description: string;
  category: ProductCategory;
  unit: string;
  quotation_price: number;
  library_price?: number;
  isNew: boolean;
  selected: boolean;
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
  const [quoteStatus, setQuoteStatus] = useState<'draft' | 'confirmed'>('confirmed');
  const [discount, setDiscount] = useState<number>(0);
  const [notes, setNotes] = useState('Quotation valid for 7 calendar days. Prices include local pickup.');
  const [items, setItems] = useState<QuotationLineItem[]>([]);

  // Explicit Price Library Update Modal
  const [showPriceLearningModal, setShowPriceLearningModal] = useState(false);
  const [diffItems, setDiffItems] = useState<PriceLibraryDiffItem[]>([]);
  const [learningSuccessMsg, setLearningSuccessMsg] = useState<string | null>(null);

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
        id: generateUniqueId('qi'),
        item_description: '',
        quantity: 1,
        unit: 'pcs',
        unit_price: 0,
        line_total: 0,
        matched_from_library: false,
      },
    ]);
  };

  // Update specific row cell with validation
  const handleUpdateItem = (
    id: string,
    field: keyof QuotationLineItem,
    value: string | number
  ) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;

        let cleanValue = value;
        if (field === 'quantity') {
          // Reject negative quantity
          cleanValue = Math.max(0.01, parseFloat(String(value)) || 0.01);
        } else if (field === 'unit_price') {
          // Reject negative price
          cleanValue = Math.max(0, parseFloat(String(value)) || 0);
        }

        const updated = { ...item, [field]: cleanValue };

        // If description changed, attempt safe price matching
        if (field === 'item_description' && typeof cleanValue === 'string') {
          const matchResult = matchProductWithLibrary(cleanValue, data.priceLibrary);
          if (matchResult.matchedItem && matchResult.isExact) {
            updated.unit_price = matchResult.matchedItem.current_unit_price;
            updated.unit = matchResult.matchedItem.unit || updated.unit;
            updated.matched_from_library = true;
            updated.is_ambiguous = false;
            updated.review_reason = undefined;
          } else if (matchResult.isAmbiguous) {
            updated.matched_from_library = false;
            updated.is_ambiguous = true;
            updated.review_reason = 'Similar item in catalog. Check size & material specifications.';
          } else {
            updated.matched_from_library = false;
          }
        }

        // Recalculate line total safely
        const qty = field === 'quantity' ? Number(cleanValue) : item.quantity;
        const price = field === 'unit_price' ? Number(cleanValue) : item.unit_price;
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
  const grandTotal = Math.max(0, subMoney(subtotal, Math.max(0, discount)));

  // Save Quotation (NEVER automatically updates permanent price library)
  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('Please enter a Customer Name');
      return;
    }
    if (items.length === 0) {
      alert('Please add at least one line item');
      return;
    }

    // Check for negative discount
    const safeDiscount = Math.max(0, Number(discount) || 0);

    const saved = await storage.saveQuotation({
      quotation_number: quoteNumber,
      date: quoteDate,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim() || undefined,
      customer_address: customerAddress.trim() || undefined,
      subtotal,
      discount: safeDiscount,
      grand_total: grandTotal,
      status: quoteStatus,
      notes,
      raw_pasted_text: rawText,
      items,
    });

    onRefresh();
    setSelectedQuotation(saved);
    setActiveSubView('view');
  };

  // Open Price Library Update Review Modal (Explicit Confirmation)
  const handleOpenPriceLearningModal = () => {
    const activeItems = selectedQuotation ? selectedQuotation.items : items;
    if (activeItems.length === 0) {
      alert('No items to review for price library update.');
      return;
    }

    const diffs: PriceLibraryDiffItem[] = [];

    activeItems.forEach((item) => {
      const desc = item.item_description.trim();
      if (!desc || item.unit_price <= 0) return;

      const matchResult = matchProductWithLibrary(desc, data.priceLibrary);
      const matched = matchResult.matchedItem;

      if (!matched) {
        // New item
        diffs.push({
          item_description: desc,
          category: 'hardware',
          unit: item.unit || 'pcs',
          quotation_price: item.unit_price,
          isNew: true,
          selected: true,
        });
      } else if (matched.current_unit_price !== item.unit_price) {
        // Price changed
        diffs.push({
          item_description: desc,
          category: matched.category || 'hardware',
          unit: item.unit || matched.unit || 'pcs',
          quotation_price: item.unit_price,
          library_price: matched.current_unit_price,
          isNew: false,
          selected: true,
        });
      }
    });

    if (diffs.length === 0) {
      alert('All items in this quotation already match the permanent Price Library prices. No updates needed.');
      return;
    }

    setDiffItems(diffs);
    setLearningSuccessMsg(null);
    setShowPriceLearningModal(true);
  };

  // Commit selected price diffs to permanent library
  const handleCommitPriceUpdates = async () => {
    const selectedDiffs = diffItems.filter((d) => d.selected);
    if (selectedDiffs.length === 0) {
      alert('No items selected for library update.');
      return;
    }

    const currentQuoteRef = selectedQuotation ? selectedQuotation.quotation_number : quoteNumber;

    const payload = selectedDiffs.map((d) => ({
      product_name: d.item_description,
      standardized_name: standardizeProductName(d.item_description),
      category: d.category,
      unit: d.unit,
      current_unit_price: d.quotation_price,
      reason: `Confirmed quotation ${currentQuoteRef}`,
    }));

    await storage.batchUpdatePriceLibrary(payload);
    onRefresh();

    setLearningSuccessMsg(`Successfully committed ${selectedDiffs.length} price(s) to permanent library.`);
    setTimeout(() => {
      setShowPriceLearningModal(false);
      setLearningSuccessMsg(null);
    }, 1500);
  };

  // Start new quotation editor
  const handleStartNewQuote = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteNumber(`SH-${new Date().getFullYear()}-${String(data.quotations.length + 1).padStart(4, '0')}`);
    setQuoteStatus('confirmed');
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
    setQuoteStatus('confirmed');
    setDiscount(quote.discount || 0);
    setNotes(quote.notes || '');
    setItems(
      quote.items.map((i) => ({
        ...i,
        id: generateUniqueId('qi'),
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
      <div className="space-y-4">
        {/* Explicit Action Bar for Quotation Document */}
        <div className="no-print bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">
              Quotation Status: <strong className="uppercase text-[#071D3A]">{selectedQuotation.status}</strong>
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              Permanent Library: Locked (historical quotes remain unchanged)
            </span>
          </div>

          <button
            onClick={handleOpenPriceLearningModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#071D3A] bg-orange-50 border border-orange-200 hover:bg-orange-100 rounded-lg transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#F58220]" />
            <span>Update Price Library with these Prices</span>
          </button>
        </div>

        <QuotationDocument
          quotation={selectedQuotation}
          settings={data.settings}
          onBack={() => setActiveSubView('list')}
          onDuplicate={handleDuplicateQuote}
        />

        {/* Price Library Learning Confirmation Modal */}
        {showPriceLearningModal && renderPriceLearningModal()}
      </div>
    );
  }

  function renderPriceLearningModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#071D3A] text-white rounded-xl">
                <BookOpen className="w-5 h-5 text-[#F58220]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#071D3A]">
                  Update Price Library from Quotation
                </h3>
                <p className="text-xs text-slate-500">
                  Explicit confirmation required. Historical quotations will NOT be altered.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPriceLearningModal(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {learningSuccessMsg ? (
            <div className="py-8 text-center text-emerald-700 font-bold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>{learningSuccessMsg}</span>
            </div>
          ) : (
            <>
              <div className="mt-4 max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {diffItems.map((diff, idx) => (
                  <div key={idx} className="p-3 flex items-start gap-3 hover:bg-slate-50 text-xs">
                    <input
                      type="checkbox"
                      checked={diff.selected}
                      onChange={(e) => {
                        const updated = [...diffItems];
                        updated[idx].selected = e.target.checked;
                        setDiffItems(updated);
                      }}
                      className="mt-1 rounded text-[#071D3A] focus:ring-[#071D3A]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#172033]">{diff.item_description}</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            diff.isNew
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {diff.isNew ? 'New Product' : 'Price Change'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        {diff.isNew ? (
                          <span>New Catalog Price: ${diff.quotation_price.toFixed(2)} / {diff.unit}</span>
                        ) : (
                          <span>
                            Library: ${diff.library_price?.toFixed(2)} <ArrowRight className="inline w-3 h-3 text-slate-400" /> New: ${diff.quotation_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
                <button
                  type="button"
                  onClick={() => setShowPriceLearningModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCommitPriceUpdates}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs"
                >
                  Confirm & Update Selected Prices
                </button>
              </div>
            </>
          )}
        </div>
      </div>
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
            Excel-style spreadsheet with measurement-safe parsing and explicit price learning
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
              Handles hardware specifications safely (e.g. <code>2 x PVC pipes 19mm</code>, <code>8 lengths of 15 mm copper pipe</code>, <code>3*2 timber</code>, <code>2x4 timber</code>, <code>19mm PVC pipe</code>).
            </p>

            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste raw quote lines here..."
              className="w-full p-3 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />
          </div>

          {/* Quotation Details (Customer, Ref, Date, Status) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-[#071D3A] pb-3 border-b border-slate-100">
              Step 2: Customer & Document Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mufakose Contractor"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Phone / WhatsApp (Optional)</label>
                <input
                  type="text"
                  placeholder="+263..."
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

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Status</label>
                <select
                  value={quoteStatus}
                  onChange={(e) => setQuoteStatus(e.target.value as 'draft' | 'confirmed')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-semibold"
                >
                  <option value="confirmed">Confirmed (Approved)</option>
                  <option value="draft">Draft (Pending Review)</option>
                </select>
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
                  Known items are safely auto-priced without mixing dimensions. Negative numbers rejected.
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

            {/* Mobile Stacked Cards Layout (iPhone & Small Viewports) */}
            <div className="md:hidden mt-4 space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3 transition focus-within:bg-white focus-within:border-[#071D3A] focus-within:ring-1 focus-within:ring-[#071D3A]"
                >
                  {/* Card Header: Item Number, Line Total & Delete */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#071D3A] text-white text-[11px] font-bold rounded-md font-mono">
                        #{index + 1}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Item Row
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-xs font-bold text-[#071D3A] font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {formatCurrency(item.line_total)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition active:scale-95"
                        aria-label={`Delete item ${index + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Full Description Textarea (Expands Vertically & Wraps Fully) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                      Product Description *
                    </label>
                    <textarea
                      rows={Math.max(2, Math.min(6, Math.ceil((item.item_description?.length || 0) / 28)))}
                      required
                      value={item.item_description}
                      onChange={(e) => handleUpdateItem(item.id, 'item_description', e.target.value)}
                      placeholder="e.g. 8 lengths of 15 mm copper pipe"
                      className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg font-medium text-[#172033] bg-white focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden leading-relaxed resize-y min-h-[58px]"
                    />
                    {item.matched_from_library && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium mt-1">
                        ✓ Exact catalog match
                      </span>
                    )}
                    {item.is_ambiguous && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium mt-1">
                        ⚠ {item.review_reason || 'Requires manual review'}
                      </span>
                    )}
                  </div>

                  {/* 3-Column Touch-Friendly Numeric Grid */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.01"
                        required
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(item.id, 'quantity', e.target.value)}
                        className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg font-mono font-bold text-[#071D3A] bg-white text-center focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                        placeholder="pcs"
                        className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg text-slate-800 bg-white text-center focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        inputMode="decimal"
                        value={item.unit_price === 0 ? '' : item.unit_price}
                        placeholder="0.00"
                        onChange={(e) => handleUpdateItem(item.id, 'unit_price', e.target.value)}
                        className={`w-full px-2.5 py-2 text-xs sm:text-sm border rounded-lg font-mono font-bold text-right focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden ${
                          item.unit_price === 0
                            ? 'border-amber-400 bg-amber-50/80 text-amber-900 placeholder:text-amber-500'
                            : 'border-slate-300 text-slate-800 bg-white'
                        }`}
                      />
                    </div>
                  </div>

                  {item.unit_price === 0 && (
                    <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-medium">
                      ⚠️ Needs price quote ($0.00)
                    </div>
                  )}

                  {/* Line Total Formula Breakdown */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200/60 font-mono">
                    <span>
                      {item.quantity} {item.unit || 'pcs'} × ${item.unit_price.toFixed(2)}
                    </span>
                    <span className="font-bold text-[#071D3A]">
                      Total: {formatCurrency(item.line_total)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Quick Add Row Button on Mobile */}
              <button
                type="button"
                onClick={handleAddRow}
                className="w-full py-2.5 px-3 border-2 border-dashed border-slate-300 hover:border-[#071D3A] hover:bg-slate-50 text-[#071D3A] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-98"
              >
                <Plus className="w-4 h-4 text-[#F58220]" />
                <span>Add Another Line Item</span>
              </button>
            </div>

            {/* Desktop Spreadsheet Table (md and larger viewports) */}
            <div className="hidden md:block mt-4 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#071D3A] text-white">
                    <th className="py-2.5 px-3 rounded-l-lg font-semibold w-10 text-center">#</th>
                    <th className="py-2.5 px-3 font-semibold min-w-[280px]">Item Description</th>
                    <th className="py-2.5 px-3 font-semibold w-24">Qty</th>
                    <th className="py-2.5 px-3 font-semibold w-24">Unit</th>
                    <th className="py-2.5 px-3 font-semibold w-32">Unit Price ($)</th>
                    <th className="py-2.5 px-3 font-semibold w-32 text-right">Line Total</th>
                    <th className="py-2.5 px-2 rounded-r-lg w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono align-top pt-3">
                        {index + 1}
                      </td>

                      {/* Description - Auto-wrapping multiline textarea */}
                      <td className="py-2.5 px-3">
                        <textarea
                          rows={Math.max(1, Math.min(4, Math.ceil((item.item_description?.length || 0) / 45)))}
                          required
                          value={item.item_description}
                          onChange={(e) => handleUpdateItem(item.id, 'item_description', e.target.value)}
                          placeholder="e.g. PVC pipes 19mm"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-medium text-[#172033] focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden leading-relaxed resize-y"
                        />
                        {item.matched_from_library && (
                          <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
                            ✓ Exact catalog match
                          </span>
                        )}
                        {item.is_ambiguous && (
                          <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
                            ⚠ {item.review_reason || 'Requires manual review'}
                          </span>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3 align-top">
                        <input
                          type="number"
                          step="0.1"
                          min="0.01"
                          required
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono font-bold focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden text-center"
                        />
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-3 align-top">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                          placeholder="pcs"
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden text-center"
                        />
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3 align-top">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={item.unit_price === 0 ? '' : item.unit_price}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateItem(item.id, 'unit_price', e.target.value)}
                          className={`w-full px-2 py-1.5 text-xs border rounded-lg font-mono font-bold text-right focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden ${
                            item.unit_price === 0
                              ? 'border-amber-400 bg-amber-50 text-amber-900 placeholder:text-amber-500'
                              : 'border-slate-300 text-slate-800'
                          }`}
                        />
                        {item.unit_price === 0 && (
                          <span className="text-[9px] text-amber-700 block mt-0.5 text-right">
                            Price needed ($0.00)
                          </span>
                        )}
                      </td>

                      {/* Line Total */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#071D3A] align-top pt-3">
                        {formatCurrency(item.line_total)}
                      </td>

                      {/* Delete */}
                      <td className="py-2.5 px-2 text-center align-top pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {items.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                Spreadsheet is empty. Paste raw text above or click "Add Row".
              </div>
            )}

            {/* Calculations Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="text-xs text-slate-500 max-w-sm">
                <span className="font-bold text-[#071D3A] block mb-1">Price Library Safety:</span>
                <p>
                  Saving this quotation records it safely without modifying the permanent Price Library. To update the Price Library with these prices, you can explicitly review and confirm changes after saving.
                </p>
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
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
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
                <span>Save Quotation</span>
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
                Click any quotation to view, print, or share
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
                      <span
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          q.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {q.status}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[#172033] mt-1">
                      {q.customer_name}
                      {q.customer_phone ? ` (${q.customer_phone})` : ''}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2 break-words mt-0.5">
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
