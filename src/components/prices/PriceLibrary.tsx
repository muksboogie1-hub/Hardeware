import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  History,
  Tag,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Filter,
} from 'lucide-react';
import { AppDatabaseState, PriceItem, ProductCategory } from '../../types';
import { formatCurrency } from '../../utils/math';
import { standardizeProductName } from '../../utils/quotationParser';
import { storage } from '../../services/storage';

interface PriceLibraryProps {
  data: AppDatabaseState;
  onRefresh: () => void;
}

export const PriceLibrary: React.FC<PriceLibraryProps> = ({ data, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceItem | null>(null);
  const [viewHistoryItem, setViewHistoryItem] = useState<PriceItem | null>(null);

  // Form states
  const [form, setForm] = useState<{
    product_name: string;
    category: ProductCategory;
    unit: string;
    current_unit_price: number;
    price_change_reason: string;
  }>({
    product_name: '',
    category: 'general' as any,
    unit: 'pcs',
    current_unit_price: 0,
    price_change_reason: '',
  });

  const categories = [
    { id: 'all', label: 'All Categories' },
    { id: 'plumbing', label: 'Plumbing' },
    { id: 'electrical', label: 'Electrical' },
    { id: 'building', label: 'Building Materials' },
    { id: 'hardware', label: 'General Hardware' },
    { id: 'other', label: 'Other' },
  ];

  // Filter items
  const filteredItems = data.priceLibrary.filter((item) => {
    const matchesSearch =
      item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.standardized_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setForm({
      product_name: '',
      category: 'hardware',
      unit: 'pcs',
      current_unit_price: 0,
      price_change_reason: 'Initial manual entry',
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: PriceItem) => {
    setEditingItem(item);
    setForm({
      product_name: item.product_name,
      category: item.category,
      unit: item.unit,
      current_unit_price: item.current_unit_price,
      price_change_reason: 'Price adjustment',
    });
    setShowAddModal(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_name.trim()) return;

    storage.saveOrUpdatePriceItem({
      product_name: form.product_name.trim(),
      standardized_name: standardizeProductName(form.product_name.trim()),
      category: form.category,
      unit: form.unit || 'pcs',
      current_unit_price: Number(form.current_unit_price),
      reason: form.price_change_reason,
    });

    setShowAddModal(false);
    onRefresh();
  };

  const handleDeleteItem = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove "${name}" from the Price Library?`)) {
      storage.deletePriceItem(id);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            Learning Price Library
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Learns and updates product prices automatically from confirmed quotations. Historical quotations remain untouched.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#071D3A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 transition"
        >
          <Plus className="w-4 h-4 text-[#F58220]" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search price library by product or specification (e.g. PVC 19mm, timber)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-[#071D3A] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:text-[#071D3A]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-slate-500">
            Cataloged Products ({filteredItems.length})
          </span>
          <span className="text-slate-400">
            Click edit to update a price. Prior prices are preserved in price history.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="py-2.5 px-4 font-semibold">Product Description</th>
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold">Unit</th>
                <th className="py-2.5 px-3 font-semibold text-right">Current Price</th>
                <th className="py-2.5 px-3 font-semibold text-right">Quoted Count</th>
                <th className="py-2.5 px-3 font-semibold">Last Updated</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4">
                    <span className="font-bold text-[#172033] block text-sm">
                      {item.product_name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Matched token: {item.standardized_name}
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <span className="capitalize px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                      {item.category}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-slate-600 font-medium">{item.unit || 'pcs'}</td>

                  <td className="py-3 px-3 text-right font-mono font-black text-sm text-[#071D3A]">
                    {formatCurrency(item.current_unit_price)}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-600">
                    {item.quotation_count || 1} quotes
                  </td>

                  <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                    {item.last_updated}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.previous_prices && item.previous_prices.length > 0 && (
                        <button
                          onClick={() => setViewHistoryItem(item)}
                          className="p-1.5 text-slate-400 hover:text-[#071D3A] rounded transition"
                          title="View Price History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-[#F58220] rounded transition"
                        title="Edit Price"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(item.id, item.product_name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400">
              No products found in the library matching your filter. Click "Add Product" or create a quotation to start building your database.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          MODAL: ADD / EDIT PRODUCT
         ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-[#071D3A]">
              {editingItem ? 'Edit Product & Price' : 'Add New Catalog Product'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Updates to this price will apply to future quotations while preserving past records.
            </p>

            <form onSubmit={handleSaveItem} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PVC pipe 19mm"
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  >
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="building">Building Materials</option>
                    <option value="hardware">General Hardware</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block">Standard Unit</label>
                  <input
                    type="text"
                    required
                    placeholder="pcs / lengths / rolls / bags"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block">Current Unit Price ($) *</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  required
                  value={form.current_unit_price}
                  onChange={(e) => setForm({ ...form, current_unit_price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold text-[#071D3A] focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                />
              </div>

              {editingItem && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 block">
                    Reason for Price Change (Preserved in History)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Supplier price increase / currency fluctuation"
                    value={form.price_change_reason}
                    onChange={(e) => setForm({ ...form, price_change_reason: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
                  />
                </div>
              )}

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
                  Save Product Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: VIEW PRICE HISTORY
         ======================================================== */}
      {viewHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-[#071D3A]">
              Price History: {viewHistoryItem.product_name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Current active price: <strong className="text-emerald-700 font-mono">{formatCurrency(viewHistoryItem.current_unit_price)}</strong>
            </p>

            <div className="mt-4 divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {viewHistoryItem.previous_prices && viewHistoryItem.previous_prices.length > 0 ? (
                viewHistoryItem.previous_prices.map((p, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-700 block">
                        {formatCurrency(p.price)}
                      </span>
                      <span className="text-[10px] text-slate-400">{p.reason || 'Price updated'}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">{p.changed_at}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">No prior price revisions.</p>
              )}
            </div>

            <button
              onClick={() => setViewHistoryItem(null)}
              className="mt-5 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
            >
              Close History
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
