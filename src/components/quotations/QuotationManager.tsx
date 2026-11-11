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
  ArrowLeft,
  X,
  FileCheck,
  Upload,
  AlertTriangle,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  DollarSign,
  Tag,
  Layers,
} from 'lucide-react';
import {
  AppDatabaseState,
  Quotation,
  QuotationLineItem,
  PriceItem,
  ProductCategory,
  StructuredImportRow,
  StructuredImportResult,
  PriceLibraryImportProposal,
} from '../../types';
import { formatCurrency, multMoney, subMoney, addMoney, round2 } from '../../utils/math';
import {
  parseRawQuotationText,
  parseStructuredQuotationText,
  preparePriceLibraryImport,
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

type SubViewType = 'list' | 'editor' | 'view' | 'import-quote' | 'import-prices';

export const QuotationManager: React.FC<QuotationManagerProps> = ({ data, onRefresh }) => {
  const [activeSubView, setActiveSubView] = useState<SubViewType>('list');
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // =========================================================================
  // WORKFLOW A: CREATE NEW QUOTATION (EDITOR) STATES
  // =========================================================================
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

  // Explicit Price Library Update Modal from Saved Quotation
  const [showPriceLearningModal, setShowPriceLearningModal] = useState(false);
  const [diffItems, setDiffItems] = useState<PriceLibraryDiffItem[]>([]);
  const [learningSuccessMsg, setLearningSuccessMsg] = useState<string | null>(null);

  // =========================================================================
  // WORKFLOW B: IMPORT EXISTING QUOTATION STATES
  // =========================================================================
  const defaultStructuredQuoteSample = `Description\tQuantity\tUnit Price\tTotal Price
Bathtub\t2\t100.00\t200.00
Basin Mixer\t3\t25.00\t75.00
PVC Pipe 20mm\t10\t4.50\t45.00
Subtotal\t\t\t320.00
Grand Total\t\t\t320.00`;

  const [importQuoteText, setImportQuoteText] = useState(defaultStructuredQuoteSample);
  const [importQuoteResult, setImportQuoteResult] = useState<StructuredImportResult | null>(null);
  const [editableImportRows, setEditableImportRows] = useState<StructuredImportRow[]>([]);
  const [showFilteredSummaries, setShowFilteredSummaries] = useState(false);
  const [showUnrecognizedRows, setShowUnrecognizedRows] = useState(false);

  // =========================================================================
  // WORKFLOW C: IMPORT TO PRICE LIBRARY ONLY STATES
  // =========================================================================
  const defaultPriceImportSample = `Product\tQuantity\tUnit Price\tLine Total
Bathtub\t2\t100.00\t200.00
Basin Mixer\t3\t25.00\t75.00
Solar Floodlight 100W\t5\t35.00\t175.00
PVC Pipe 20mm\t10\t4.50\t45.00
Bathtub\t1\t115.00\t115.00
Subtotal\t\t\t510.00`;

  const [importPricesText, setImportPricesText] = useState(defaultPriceImportSample);
  const [priceImportResult, setPriceImportResult] = useState<StructuredImportResult | null>(null);
  const [priceImportProposals, setPriceImportProposals] = useState<PriceLibraryImportProposal[]>([]);
  const [priceFilterStatus, setPriceFilterStatus] = useState<
    'all' | 'new' | 'update' | 'conflict' | 'ambiguous' | 'same'
  >('all');
  const [priceSuccessMsg, setPriceSuccessMsg] = useState<string | null>(null);

  // =========================================================================
  // WORKFLOW A LOGIC (Raw Description & Spreadsheet Editor)
  // =========================================================================
  const handleParseText = () => {
    if (!rawText.trim()) return;
    const parsedItems = parseRawQuotationText(rawText, data.priceLibrary);
    setItems(parsedItems);
  };

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
          cleanValue = Math.max(0.01, parseFloat(String(value)) || 0.01);
        } else if (field === 'unit_price') {
          cleanValue = Math.max(0, parseFloat(String(value)) || 0);
        }

        const updated = { ...item, [field]: cleanValue };

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

        const qty = field === 'quantity' ? Number(cleanValue) : item.quantity;
        const price = field === 'unit_price' ? Number(cleanValue) : item.unit_price;
        updated.line_total = multMoney(price, qty);

        return updated;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const subtotal = items.reduce((acc, item) => addMoney(acc, item.line_total), 0);
  const grandTotal = Math.max(0, subMoney(subtotal, Math.max(0, discount)));

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

  // =========================================================================
  // WORKFLOW B LOGIC (Import Existing Quotation with Separate Columns)
  // =========================================================================
  const handleParseImportQuote = () => {
    if (!importQuoteText.trim()) return;
    const result = parseStructuredQuotationText(importQuoteText, data.priceLibrary);
    setImportQuoteResult(result);
    // Initialize editable rows with valid & discrepancy rows
    setEditableImportRows([...result.validRows]);
    setShowFilteredSummaries(false);
    setShowUnrecognizedRows(false);
  };

  const handleUpdateImportRow = (
    id: string,
    field: 'item_description' | 'quantity' | 'unit' | 'unit_price' | 'supplied_total',
    value: string | number
  ) => {
    setEditableImportRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;

        let cleanValue = value;
        if (field === 'quantity') {
          cleanValue = Math.max(0.01, parseFloat(String(value)) || 0.01);
        } else if (field === 'unit_price' || field === 'supplied_total') {
          cleanValue = Math.max(0, parseFloat(String(value)) || 0);
        }

        const updated = { ...row, [field]: cleanValue };
        const qty = field === 'quantity' ? Number(cleanValue) : row.quantity;
        const price = field === 'unit_price' ? Number(cleanValue) : row.unit_price;
        const supplied = field === 'supplied_total' ? Number(cleanValue) : row.supplied_total;

        updated.calculated_total = multMoney(price, qty);
        updated.has_discrepancy = Math.abs(supplied - updated.calculated_total) > 0.02;
        updated.status = updated.has_discrepancy ? 'discrepancy' : 'valid';

        if (field === 'item_description' && typeof cleanValue === 'string') {
          const matchResult = matchProductWithLibrary(cleanValue, data.priceLibrary);
          updated.matched_price_item = matchResult.matchedItem || null;
          updated.is_ambiguous_match = matchResult.isAmbiguous;
        }

        return updated;
      })
    );
  };

  const handleFixDiscrepancyToCalculated = (id: string) => {
    setEditableImportRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        return {
          ...row,
          supplied_total: row.calculated_total,
          has_discrepancy: false,
          status: 'valid',
        };
      })
    );
  };

  const handleFixRateToMatchSupplied = (id: string) => {
    setEditableImportRows((prev) =>
      prev.map((row) => {
        if (row.id !== id || row.quantity <= 0) return row;
        const newRate = round2(row.supplied_total / row.quantity);
        const newCalc = multMoney(newRate, row.quantity);
        return {
          ...row,
          unit_price: newRate,
          calculated_total: newCalc,
          has_discrepancy: Math.abs(row.supplied_total - newCalc) > 0.02,
          status: Math.abs(row.supplied_total - newCalc) > 0.02 ? 'discrepancy' : 'valid',
        };
      })
    );
  };

  const handleDeleteImportRow = (id: string) => {
    setEditableImportRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleProceedToEditorFromImport = () => {
    if (editableImportRows.length === 0) {
      alert('No valid items to import into Quotation Editor.');
      return;
    }

    const convertedItems: QuotationLineItem[] = editableImportRows.map((row) => ({
      id: generateUniqueId('qi'),
      raw_input: row.raw_line,
      item_description: row.item_description,
      quantity: row.quantity,
      unit: row.unit || 'pcs',
      unit_price: row.unit_price,
      line_total: row.has_discrepancy ? row.supplied_total : row.calculated_total,
      supplied_total: row.supplied_total,
      has_discrepancy: row.has_discrepancy,
      matched_from_library: !!row.matched_price_item,
      is_ambiguous: row.is_ambiguous_match,
      review_reason: row.review_reason,
    }));

    setItems(convertedItems);
    setCustomerName('Imported Quotation');
    setCustomerPhone('');
    setCustomerAddress('');
    setQuoteDate(new Date().toISOString().split('T')[0]);
    setQuoteNumber(`SH-${new Date().getFullYear()}-${String(data.quotations.length + 1).padStart(4, '0')}`);
    setQuoteStatus('confirmed');
    setDiscount(0);
    setRawText(importQuoteText);
    setActiveSubView('editor');
  };

  // =========================================================================
  // WORKFLOW C LOGIC (Import to Price Library Only)
  // =========================================================================
  const handleParsePriceImport = () => {
    if (!importPricesText.trim()) return;
    const result = parseStructuredQuotationText(importPricesText, data.priceLibrary);
    setPriceImportResult(result);
    const proposals = preparePriceLibraryImport(result.validRows, data.priceLibrary);
    setPriceImportProposals(proposals);
    setPriceSuccessMsg(null);
  };

  const handleToggleProposal = (id: string) => {
    setPriceImportProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  const handleSelectAllVisibleProposals = (select: boolean) => {
    setPriceImportProposals((prev) =>
      prev.map((p) => {
        if (priceFilterStatus === 'all' || p.status === priceFilterStatus) {
          return { ...p, selected: select };
        }
        return p;
      })
    );
  };

  const handleUpdateProposalPrice = (id: string, price: number) => {
    setPriceImportProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, proposed_unit_price: Math.max(0, price) } : p))
    );
  };

  const handleUpdateProposalCategory = (id: string, category: ProductCategory) => {
    setPriceImportProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, category } : p))
    );
  };

  const handleUpdateProposalUnit = (id: string, unit: string) => {
    setPriceImportProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, unit } : p))
    );
  };

  const handleConfirmPriceImport = async () => {
    const selected = priceImportProposals.filter((p) => p.selected);
    if (selected.length === 0) {
      alert('Please select at least one item to update in the Price Library.');
      return;
    }

    const payload = selected.map((p) => ({
      product_name: p.item_description,
      standardized_name: p.standardized_name,
      category: p.category,
      unit: p.unit,
      current_unit_price: p.proposed_unit_price,
      reason: `Direct Import to Price Library (${new Date().toISOString().split('T')[0]})`,
    }));

    const count = await storage.batchUpdatePriceLibrary(payload);
    onRefresh();
    setPriceSuccessMsg(
      `Successfully updated ${count} price(s) in the permanent Price Library. Historical quotations and financial records remain untouched.`
    );
  };

  // Price learning diff modal from View Document
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
        diffs.push({
          item_description: desc,
          category: 'hardware',
          unit: item.unit || 'pcs',
          quotation_price: item.unit_price,
          isNew: true,
          selected: true,
        });
      } else if (matched.current_unit_price !== item.unit_price) {
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
      alert('All items in this quotation already match permanent Price Library prices. No updates needed.');
      return;
    }

    setDiffItems(diffs);
    setLearningSuccessMsg(null);
    setShowPriceLearningModal(true);
  };

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

  const filteredQuotations = data.quotations.filter(
    (q) =>
      q.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.quotation_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // =========================================================================
  // VIEW QUOTATION DOCUMENT SUBVIEW
  // =========================================================================
  if (activeSubView === 'view' && selectedQuotation) {
    return (
      <div className="space-y-4">
        <div className="no-print bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubView('list')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#071D3A] hover:bg-slate-100 rounded-lg transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to List</span>
            </button>
            <span className="text-xs text-slate-300">|</span>
            <span className="text-xs font-semibold text-slate-600">
              Status: <strong className="uppercase text-[#071D3A]">{selectedQuotation.status}</strong>
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

  // =========================================================================
  // MAIN COMPONENT VIEW
  // =========================================================================
  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
              Quotation Manager
            </h1>
            {activeSubView !== 'list' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-[#071D3A]">
                {activeSubView === 'editor' && 'Workflow: Create Quotation'}
                {activeSubView === 'import-quote' && 'Workflow: Import Existing Quotation'}
                {activeSubView === 'import-prices' && 'Workflow: Import to Price Library Only'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Structured quotation import, measurement-safe parsing & price learning for Shucadea Hardware
          </p>
        </div>

        {/* Action Buttons: 3 Distinct Workflows */}
        <div className="flex flex-wrap items-center gap-2">
          {activeSubView === 'list' ? (
            <>
              {/* Primary: Create Quotation */}
              <button
                onClick={handleStartNewQuote}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#F58220] hover:bg-[#e07212] text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition"
                title="Create a new quote from raw item descriptions"
              >
                <Plus className="w-4 h-4" />
                <span>Create Quotation</span>
              </button>

              {/* Secondary: Import Existing Quotation */}
              <button
                onClick={() => {
                  setActiveSubView('import-quote');
                  if (!importQuoteResult) {
                    const result = parseStructuredQuotationText(importQuoteText, data.priceLibrary);
                    setImportQuoteResult(result);
                    setEditableImportRows([...result.validRows]);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#071D3A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition"
                title="Import an existing multi-column quote (Excel, TSV, Pipe, CSV)"
              >
                <Upload className="w-4 h-4 text-[#F58220]" />
                <span>Import Existing Quotation</span>
              </button>

              {/* Tertiary: Import to Price Library Only */}
              <button
                onClick={() => {
                  setActiveSubView('import-prices');
                  if (priceImportProposals.length === 0) {
                    const result = parseStructuredQuotationText(importPricesText, data.priceLibrary);
                    setPriceImportResult(result);
                    const proposals = preparePriceLibraryImport(result.validRows, data.priceLibrary);
                    setPriceImportProposals(proposals);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-[#071D3A] border border-slate-300 text-xs font-bold rounded-xl shadow-xs active:scale-95 transition"
                title="Extract catalog unit prices directly without creating a quotation"
              >
                <BookOpen className="w-4 h-4 text-[#F58220]" />
                <span>Import to Price Library Only</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => setActiveSubView('list')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Quotations List</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================
          WORKFLOW A: QUOTATION SPREADSHEET EDITOR
         ======================================================== */}
      {activeSubView === 'editor' && (
        <form onSubmit={handleSaveQuotation} className="space-y-6">
          {/* Step 1: Raw Description Text Box */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F58220]" />
                <h3 className="text-sm font-bold text-[#071D3A]">
                  Step 1: Paste Raw Quotation Descriptions (Optional)
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

          {/* Step 2: Customer & Document Info */}
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
                  Step 3: Interactive Line Items
                </h3>
                <p className="text-xs text-slate-500">
                  Full product descriptions wrap cleanly on all screens. Safe decimal math applied.
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

            {/* Mobile Stacked Cards Layout */}
            <div className="md:hidden mt-4 space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-slate-50/90 p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3 transition focus-within:bg-white focus-within:border-[#071D3A] focus-within:ring-1 focus-within:ring-[#071D3A]"
                >
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
                      <span className="text-xs font-bold text-[#071D3A] font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {formatCurrency(item.line_total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        aria-label={`Delete item ${index + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

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

              <button
                type="button"
                onClick={handleAddRow}
                className="w-full py-2.5 px-3 border-2 border-dashed border-slate-300 hover:border-[#071D3A] hover:bg-slate-50 text-[#071D3A] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4 text-[#F58220]" />
                <span>Add Another Line Item</span>
              </button>
            </div>

            {/* Desktop Spreadsheet Table */}
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

                      <td className="py-2.5 px-3 align-top">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                          placeholder="pcs"
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden text-center"
                        />
                      </td>

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

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#071D3A] align-top pt-3">
                        {formatCurrency(item.line_total)}
                      </td>

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
                Spreadsheet is empty. Click "Add Row" or paste descriptions above.
              </div>
            )}

            {/* Calculations Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="text-xs text-slate-500 max-w-sm">
                <span className="font-bold text-[#071D3A] block mb-1">Catalog Integrity Guarantee:</span>
                <p>
                  Saving this quotation stores it as an independent historical record. It does NOT automatically overwrite your permanent Price Library.
                </p>
              </div>

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
          WORKFLOW B: IMPORT EXISTING QUOTATION (STRUCTURED)
         ======================================================== */}
      {activeSubView === 'import-quote' && (
        <div className="space-y-6">
          {/* Step 1: Input Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#071D3A] text-[#F58220] rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#071D3A]">
                    Import Existing Quotation
                  </h2>
                  <p className="text-xs text-slate-500">
                    Extracts Description, Quantity, Unit Price, and Total. Supports Excel tabs, pipes, CSV, and whitespace tables.
                  </p>
                </div>
              </div>

              {/* Sample Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400 mr-1">Load sample:</span>
                <button
                  type="button"
                  onClick={() => setImportQuoteText(defaultStructuredQuoteSample)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#071D3A] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Excel TSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setImportQuoteText(`Item | Quantity | Unit Price | Total Price
Bathtub | 2 | 100.00 | 200.00
Basin Mixer | 3 | 25.00 | 75.00
PVC Pipe 20mm | 10 | 4.50 | 45.00
Subtotal | | | 320.00
Grand Total | | | 320.00`)
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#071D3A] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Pipes
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setImportQuoteText(`"Product","Qty","Unit Price","Total"
"Water Tank 5000L",2,"$1,200.00","$2,400.00"
"Copper Pipe 15mm",4,"$15.00","$100.00"
"Subtotal",,"","$2,500.00"`)
                  }
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#071D3A] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Discrepancy Sample
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={importQuoteText}
              onChange={(e) => setImportQuoteText(e.target.value)}
              placeholder="Paste table here (e.g. from Excel, Word, or PDF table)..."
              className="w-full p-3.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Summary rows (Subtotal, Grand Total, VAT) will be automatically detected and excluded.
              </span>
              <button
                type="button"
                onClick={handleParseImportQuote}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs transition"
              >
                <Sparkles className="w-4 h-4 text-[#F58220]" />
                <span>Parse Completed Quotation</span>
              </button>
            </div>
          </div>

          {/* Step 2: Interactive Review Screen */}
          {importQuoteResult && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              {/* Header & Status Metrics Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-[#071D3A]">
                    Review Parsed Quotation Items
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review extracted line items, inspect discrepancies, edit values, and proceed to the Quotation Editor.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    ✓ {editableImportRows.length} Valid Items
                  </span>

                  {editableImportRows.filter((r) => r.has_discrepancy).length > 0 && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 animate-pulse">
                      ⚠ {editableImportRows.filter((r) => r.has_discrepancy).length} Discrepancies
                    </span>
                  )}

                  {importQuoteResult.summaryRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowFilteredSummaries(!showFilteredSummaries)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                      {showFilteredSummaries ? 'Hide' : 'Show'} Filtered Summaries ({importQuoteResult.summaryRows.length})
                    </button>
                  )}

                  {importQuoteResult.unrecognizedRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowUnrecognizedRows(!showUnrecognizedRows)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                    >
                      {showUnrecognizedRows ? 'Hide' : 'Show'} Unrecognized ({importQuoteResult.unrecognizedRows.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Arithmetic Discrepancy High-Visibility Alert Banner */}
              {editableImportRows.filter((r) => r.has_discrepancy).length > 0 && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-1">
                    <p className="font-bold">
                      Arithmetic Discrepancies Detected in {editableImportRows.filter((r) => r.has_discrepancy).length} Item(s):
                    </p>
                    <p className="leading-relaxed">
                      The supplied line total in the document does not match <code>Quantity × Unit Price</code> (difference &gt; $0.02).
                      The original supplied total has been preserved. Review the highlighted rows below and click "Use Calculated" or "Adjust Rate" to resolve.
                    </p>
                  </div>
                </div>
              )}

              {/* Filtered Summaries Collapsible Panel */}
              {showFilteredSummaries && importQuoteResult.summaryRows.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#071D3A]">
                    <Info className="w-4 h-4 text-[#F58220]" />
                    <span>Automatically Excluded Summary & Metadata Rows ({importQuoteResult.summaryRows.length}):</span>
                  </div>
                  <p className="text-slate-500 text-[11px]">
                    These rows were detected as totals, taxes, discounts, or metadata and were filtered to prevent double-counting.
                  </p>
                  <div className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
                    {importQuoteResult.summaryRows.map((s, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-700">{s.item_description}</span>
                        <span className="text-slate-500">
                          {s.supplied_total > 0 ? formatCurrency(s.supplied_total) : 'Header / Metadata'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unrecognized Rows Collapsible Panel */}
              {showUnrecognizedRows && importQuoteResult.unrecognizedRows.length > 0 && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Unrecognized or Incomplete Lines ({importQuoteResult.unrecognizedRows.length}):</span>
                  </div>
                  <div className="divide-y divide-rose-100 bg-white rounded-lg border border-rose-200">
                    {importQuoteResult.unrecognizedRows.map((u, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-700 truncate max-w-md">{u.raw_line}</span>
                        <span className="text-rose-600 font-medium">Reason: {u.review_reason || u.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile Stacked Cards Layout for Review Screen */}
              <div className="md:hidden space-y-3">
                {editableImportRows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`p-3.5 rounded-xl border transition space-y-3 ${
                      row.has_discrepancy
                        ? 'bg-amber-50/90 border-amber-300'
                        : 'bg-slate-50/90 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[#071D3A] text-white text-[11px] font-bold rounded-md font-mono">
                          #{index + 1}
                        </span>
                        {row.has_discrepancy ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-200 text-amber-900 rounded-md">
                            ⚠ Discrepancy
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                            ✓ Matches
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteImportRow(row.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Product Description
                      </label>
                      <textarea
                        rows={2}
                        value={row.item_description}
                        onChange={(e) => handleUpdateImportRow(row.id, 'item_description', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-medium text-[#172033] bg-white leading-relaxed resize-y"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Qty</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.01"
                          value={row.quantity}
                          onChange={(e) => handleUpdateImportRow(row.id, 'quantity', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg font-mono font-bold text-center bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Unit</label>
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(e) => handleUpdateImportRow(row.id, 'unit', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg text-center bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Unit Price ($)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={row.unit_price}
                          onChange={(e) => handleUpdateImportRow(row.id, 'unit_price', e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg font-mono font-bold text-right bg-white"
                        />
                      </div>
                    </div>

                    {/* Totals Comparison Strip */}
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Supplied Total:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={row.supplied_total}
                          onChange={(e) => handleUpdateImportRow(row.id, 'supplied_total', e.target.value)}
                          className="w-24 px-1.5 py-0.5 text-xs border border-slate-300 rounded text-right font-bold text-[#071D3A]"
                        />
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Calculated (Qty × Price):</span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(row.calculated_total)}
                        </span>
                      </div>

                      {row.has_discrepancy && (
                        <div className="pt-2 border-t border-amber-200 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleFixDiscrepancyToCalculated(row.id)}
                            className="flex-1 py-1 px-2 text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-md transition"
                          >
                            Use Calc (${row.calculated_total.toFixed(2)})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFixRateToMatchSupplied(row.id)}
                            className="flex-1 py-1 px-2 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition"
                          >
                            Adjust Unit Price
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table for Review Screen */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-[#071D3A] text-white">
                      <th className="py-2.5 px-3 rounded-l-lg font-semibold w-10 text-center">#</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[240px]">Product Description</th>
                      <th className="py-2.5 px-3 font-semibold w-20 text-center">Qty</th>
                      <th className="py-2.5 px-3 font-semibold w-20 text-center">Unit</th>
                      <th className="py-2.5 px-3 font-semibold w-28 text-right">Unit Price ($)</th>
                      <th className="py-2.5 px-3 font-semibold w-28 text-right">Supplied Total</th>
                      <th className="py-2.5 px-3 font-semibold w-28 text-right">Calculated</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[140px] text-center">Discrepancy / Action</th>
                      <th className="py-2.5 px-2 rounded-r-lg w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {editableImportRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50 transition ${
                          row.has_discrepancy ? 'bg-amber-50/60' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono align-top pt-3">
                          {index + 1}
                        </td>

                        {/* Description */}
                        <td className="py-2.5 px-3">
                          <textarea
                            rows={Math.max(1, Math.min(3, Math.ceil((row.item_description?.length || 0) / 40)))}
                            value={row.item_description}
                            onChange={(e) => handleUpdateImportRow(row.id, 'item_description', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-medium text-[#172033] focus:ring-1 focus:ring-[#071D3A] focus:outline-hidden leading-relaxed resize-y"
                          />
                          {row.matched_price_item && (
                            <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
                              ✓ Matches catalog: {row.matched_price_item.product_name}
                            </span>
                          )}
                        </td>

                        {/* Qty */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="number"
                            step="0.1"
                            min="0.01"
                            value={row.quantity}
                            onChange={(e) => handleUpdateImportRow(row.id, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono font-bold text-center focus:ring-1 focus:ring-[#071D3A]"
                          />
                        </td>

                        {/* Unit */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="text"
                            value={row.unit}
                            onChange={(e) => handleUpdateImportRow(row.id, 'unit', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg text-center focus:ring-1 focus:ring-[#071D3A]"
                          />
                        </td>

                        {/* Unit Price */}
                        <td className="py-2.5 px-3 align-top">
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={row.unit_price}
                            onChange={(e) => handleUpdateImportRow(row.id, 'unit_price', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono font-bold text-right focus:ring-1 focus:ring-[#071D3A]"
                          />
                        </td>

                        {/* Supplied Total */}
                        <td className="py-2.5 px-3 align-top font-mono">
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={row.supplied_total}
                            onChange={(e) => handleUpdateImportRow(row.id, 'supplied_total', e.target.value)}
                            className={`w-full px-2 py-1.5 text-xs border rounded-lg font-mono font-bold text-right focus:ring-1 focus:ring-[#071D3A] ${
                              row.has_discrepancy
                                ? 'border-amber-400 bg-amber-50 text-amber-900 font-extrabold'
                                : 'border-slate-300 text-[#071D3A]'
                            }`}
                          />
                        </td>

                        {/* Calculated Total */}
                        <td className="py-2.5 px-3 align-top pt-3 font-mono font-bold text-right text-emerald-700">
                          {formatCurrency(row.calculated_total)}
                        </td>

                        {/* Discrepancy Action */}
                        <td className="py-2.5 px-3 align-top pt-2.5 text-center">
                          {row.has_discrepancy ? (
                            <div className="flex flex-col gap-1 items-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                                Diff: {formatCurrency(Math.abs(row.supplied_total - row.calculated_total))}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleFixDiscrepancyToCalculated(row.id)}
                                  className="text-[10px] text-blue-700 hover:underline font-semibold"
                                  title="Change supplied total to match calculated"
                                >
                                  Use Calc
                                </button>
                                <span className="text-slate-300">·</span>
                                <button
                                  type="button"
                                  onClick={() => handleFixRateToMatchSupplied(row.id)}
                                  className="text-[10px] text-blue-700 hover:underline font-semibold"
                                  title="Adjust unit price so Qty × Rate equals supplied total"
                                >
                                  Adjust Rate
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                              <Check className="w-3.5 h-3.5" />
                              <span>Match</span>
                            </span>
                          )}
                        </td>

                        {/* Delete Row */}
                        <td className="py-2.5 px-2 text-center align-top pt-2.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteImportRow(row.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step 3: Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <button
                  type="button"
                  onClick={() => setActiveSubView('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Discard & Back to List
                </button>

                <button
                  type="button"
                  onClick={handleProceedToEditorFromImport}
                  className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs transition active:scale-95"
                >
                  <span>Proceed to Quotation Editor ({editableImportRows.length} Items)</span>
                  <ArrowRight className="w-4 h-4 text-[#F58220]" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          WORKFLOW C: IMPORT TO PRICE LIBRARY ONLY
         ======================================================== */}
      {activeSubView === 'import-prices' && (
        <div className="space-y-6">
          {/* Information & Input Section */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#071D3A] text-[#F58220] rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#071D3A]">
                    Import to Price Library Only
                  </h2>
                  <p className="text-xs text-slate-500">
                    Extracts catalog prices directly from the <strong>Unit Price</strong> column. Quantities, totals, and summary rows are ignored.
                  </p>
                </div>
              </div>

              {/* Sample Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400 mr-1">Load sample:</span>
                <button
                  type="button"
                  onClick={() => setImportPricesText(defaultPriceImportSample)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#071D3A] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Catalog Sample (with Conflict)
                </button>
              </div>
            </div>

            {/* Strict Catalog Learning Invariant Clarification Banner */}
            <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Price Library Safety Rules:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-blue-800">
                <li>This workflow strictly extracts catalog unit prices. It does NOT create quotations or financial records.</li>
                <li>Historical quotations and past financial logs remain untouched.</li>
                <li>Repeated products in the same document with conflicting prices are flagged for your explicit choice.</li>
              </ul>
            </div>

            <textarea
              rows={6}
              value={importPricesText}
              onChange={(e) => setImportPricesText(e.target.value)}
              placeholder="Paste completed quotation table to extract catalog unit prices..."
              className="w-full p-3.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                Unit prices will be compared against existing catalog items to detect price updates, new items, and conflicts.
              </span>
              <button
                type="button"
                onClick={handleParsePriceImport}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs transition"
              >
                <Sparkles className="w-4 h-4 text-[#F58220]" />
                <span>Extract & Review Catalog Prices</span>
              </button>
            </div>
          </div>

          {/* Success Notification Banner */}
          {priceSuccessMsg && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-center justify-between gap-3 text-emerald-900 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-bold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{priceSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setPriceSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Interactive Catalog Learning Proposals Review */}
          {priceImportProposals.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-[#071D3A]">
                    Price Library Update Proposals ({priceImportProposals.length} Items)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select the prices you want to commit to the permanent catalog.
                  </p>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPriceFilterStatus('all')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      priceFilterStatus === 'all'
                        ? 'bg-[#071D3A] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All ({priceImportProposals.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceFilterStatus('update')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      priceFilterStatus === 'update'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    Price Changes ({priceImportProposals.filter((p) => p.status === 'update').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceFilterStatus('new')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      priceFilterStatus === 'new'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    New Products ({priceImportProposals.filter((p) => p.status === 'new').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceFilterStatus('conflict')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      priceFilterStatus === 'conflict'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    Conflicts ({priceImportProposals.filter((p) => p.status === 'conflict').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceFilterStatus('same')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                      priceFilterStatus === 'same'
                        ? 'bg-slate-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Unchanged ({priceImportProposals.filter((p) => p.status === 'same').length})
                  </button>
                </div>
              </div>

              {/* Selection Summary & Bulk Controls */}
              <div className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-semibold text-slate-700">
                  Selected:{' '}
                  <strong className="text-[#071D3A]">
                    {priceImportProposals.filter((p) => p.selected).length}
                  </strong>{' '}
                  of {priceImportProposals.length} proposals
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAllVisibleProposals(true)}
                    className="text-xs font-bold text-[#071D3A] hover:underline"
                  >
                    Select All Applicable
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAllVisibleProposals(false)}
                    className="text-xs font-bold text-slate-500 hover:underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Proposals Table & Mobile Cards */}
              <div className="space-y-3">
                {priceImportProposals
                  .filter((p) => priceFilterStatus === 'all' || p.status === priceFilterStatus)
                  .map((proposal) => (
                    <div
                      key={proposal.id}
                      className={`p-3.5 rounded-xl border transition ${
                        proposal.is_conflict
                          ? 'bg-rose-50/70 border-rose-300'
                          : proposal.status === 'update'
                          ? 'bg-amber-50/60 border-amber-200'
                          : proposal.status === 'new'
                          ? 'bg-blue-50/60 border-blue-200'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={proposal.selected}
                            onChange={() => handleToggleProposal(proposal.id)}
                            className="mt-1 rounded text-[#071D3A] focus:ring-[#071D3A]"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-[#071D3A]">
                                {proposal.item_description}
                              </span>
                              {proposal.status === 'new' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                                  New Product
                                </span>
                              )}
                              {proposal.status === 'update' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 uppercase">
                                  Price Change
                                </span>
                              )}
                              {proposal.status === 'conflict' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900 uppercase">
                                  ⚠ Conflicting Prices
                                </span>
                              )}
                              {proposal.status === 'same' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 uppercase">
                                  Unchanged
                                </span>
                              )}
                              {proposal.status === 'ambiguous' && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">
                                  Ambiguous Match
                                </span>
                              )}
                            </div>

                            {/* Details and Warnings */}
                            <div className="mt-1 text-xs text-slate-600 flex items-center gap-2 flex-wrap font-mono">
                              {proposal.existing_item ? (
                                <span>
                                  Library: ${proposal.existing_item.current_unit_price.toFixed(2)}{' '}
                                  <ArrowRight className="inline w-3 h-3 text-slate-400" />{' '}
                                  Proposed: <strong>${proposal.proposed_unit_price.toFixed(2)}</strong>
                                </span>
                              ) : (
                                <span>
                                  New Catalog Rate: <strong>${proposal.proposed_unit_price.toFixed(2)}</strong>
                                </span>
                              )}
                              <span className="text-slate-300">·</span>
                              <span>Unit: {proposal.unit}</span>
                            </div>

                            {proposal.is_conflict && proposal.conflict_prices && (
                              <p className="mt-1 text-[11px] text-rose-800 font-semibold">
                                ⚠ This item appeared multiple times in the document with differing unit prices ({proposal.conflict_prices.map((p) => `$${p.toFixed(2)}`).join(' vs ')}). Deselected by default. Verify and select the intended price.
                              </p>
                            )}

                            {proposal.review_reason && !proposal.is_conflict && (
                              <p className="mt-1 text-[11px] text-slate-500">
                                Note: {proposal.review_reason}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Editable Controls */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <select
                            value={proposal.category}
                            onChange={(e) =>
                              handleUpdateProposalCategory(proposal.id, e.target.value as ProductCategory)
                            }
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="hardware">Hardware</option>
                            <option value="plumbing">Plumbing</option>
                            <option value="electrical">Electrical</option>
                            <option value="building">Building</option>
                            <option value="other">Other</option>
                          </select>

                          <input
                            type="text"
                            value={proposal.unit}
                            onChange={(e) => handleUpdateProposalUnit(proposal.id, e.target.value)}
                            placeholder="unit"
                            className="w-16 px-2 py-1 text-xs border border-slate-300 rounded-lg text-center bg-white"
                          />

                          <div className="flex items-center gap-1 font-mono">
                            <span className="text-xs text-slate-500">$</span>
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              value={proposal.proposed_unit_price}
                              onChange={(e) =>
                                handleUpdateProposalPrice(proposal.id, parseFloat(e.target.value) || 0)
                              }
                              className="w-24 px-2 py-1 text-xs border border-slate-300 rounded-lg text-right font-bold bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Confirm Commit Action Bar */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveSubView('list')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel / Return
                </button>

                <button
                  type="button"
                  onClick={handleConfirmPriceImport}
                  className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs transition active:scale-95"
                >
                  <Save className="w-4 h-4 text-[#F58220]" />
                  <span>
                    Confirm & Update Price Library (
                    {priceImportProposals.filter((p) => p.selected).length} Items)
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          SUB-VIEW 2: QUOTATIONS LIST
         ======================================================== */}
      {activeSubView === 'list' && (
        <div className="space-y-4">
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
                  No quotations found. Use the buttons above to create or import your first quotation.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
