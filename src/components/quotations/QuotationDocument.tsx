import React from 'react';
import { Quotation, BusinessSettings } from '../../types';
import { formatCurrency } from '../../utils/math';
import { BRAND_LOGO_URL } from '../../constants';
import { Printer, Download, Share2, ArrowLeft, Copy, Check } from 'lucide-react';

interface QuotationDocumentProps {
  quotation: Quotation;
  settings: BusinessSettings;
  onBack: () => void;
  onDuplicate: (quote: Quotation) => void;
}

export const QuotationDocument: React.FC<QuotationDocumentProps> = ({
  quotation,
  settings,
  onBack,
  onDuplicate,
}) => {
  const [copied, setCopied] = React.useState(false);

  // Print quotation using browser print dialog (crisp vector rendering)
  const handlePrint = () => {
    window.print();
  };

  // Export as CSV for Excel
  const handleExportCSV = () => {
    const headers = ['Item Description', 'Quantity', 'Unit', 'Unit Price ($)', 'Line Total ($)'];
    const rows = quotation.items.map((i) => [
      `"${i.item_description.replace(/"/g, '""')}"`,
      i.quantity,
      `"${i.unit || 'pcs'}"`,
      i.unit_price.toFixed(2),
      i.line_total.toFixed(2),
    ]);

    const csvContent = [
      `"QUOTATION ${quotation.quotation_number}"`,
      `"Date: ${quotation.date}"`,
      `"Customer: ${quotation.customer_name}"`,
      '',
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      '',
      `"","","","GRAND TOTAL ($):","${quotation.grand_total.toFixed(2)}"`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${quotation.quotation_number}_${quotation.customer_name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    const textLines = [
      `*${settings.business_name}*`,
      `Quotation Ref: ${quotation.quotation_number}`,
      `Date: ${quotation.date}`,
      `Customer: ${quotation.customer_name}`,
      `-----------------------------`,
      ...quotation.items.map(
        (i, idx) =>
          `${idx + 1}. ${i.quantity} ${i.unit || 'pcs'} ${i.item_description} @ $${i.unit_price} = $${i.line_total.toFixed(2)}`
      ),
      `-----------------------------`,
      `*GRAND TOTAL: $${quotation.grand_total.toFixed(2)}*`,
      ``,
      `Valid for 7 days. Thank you for your business!`,
      `Contact: ${settings.phone} | ${settings.address}`,
    ];

    const message = encodeURIComponent(textLines.join('\n'));
    const phone = quotation.customer_phone ? quotation.customer_phone.replace(/[^\d]/g, '') : '';
    const whatsappUrl = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(whatsappUrl, '_blank');
  };

  const handleCopyText = () => {
    const text = [
      `${settings.business_name} - QUOTATION ${quotation.quotation_number}`,
      `Customer: ${quotation.customer_name}`,
      `Date: ${quotation.date}`,
      ``,
      ...quotation.items.map(
        (i) => `${i.quantity} ${i.unit || 'pcs'} x ${i.item_description} @ $${i.unit_price} = $${i.line_total}`
      ),
      ``,
      `GRAND TOTAL: $${quotation.grand_total}`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Top Action Toolbar (Hidden during browser printing) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Quotations</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={handleShareWhatsApp}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl shadow-xs transition"
          >
            <Share2 className="w-4 h-4" />
            <span>WhatsApp</span>
          </button>

          <button
            onClick={() => onDuplicate(quotation)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
          >
            <span>Duplicate</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#071D3A] hover:bg-slate-800 text-white rounded-xl shadow-xs transition"
          >
            <Printer className="w-4 h-4 text-[#F58220]" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Printable Professional Quotation Sheet */}
      <div className="bg-white p-8 sm:p-12 rounded-2xl border border-slate-200 shadow-sm max-w-4xl mx-auto text-[#172033] print:p-0 print:border-none print:shadow-none">
        {/* Header: Logo, Company Info & Quote Metadata */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b-2 border-[#071D3A]">
          {/* Company Lockup */}
          <div className="flex items-start gap-4">
            <img
              src={BRAND_LOGO_URL}
              alt={settings.business_name}
              className="w-16 h-16 rounded-full border-2 border-[#F58220] object-cover shadow-xs flex-shrink-0"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
                {settings.business_name}
              </h1>
              <p className="text-xs font-semibold text-[#F58220] uppercase tracking-wider">
                {settings.tagline}
              </p>
              <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                {settings.address && <p>{settings.address}</p>}
                {(settings.phone || settings.whatsapp) && (
                  <p>
                    {settings.phone && <span>Phone: {settings.phone}</span>}
                    {settings.phone && settings.whatsapp && <span> · </span>}
                    {settings.whatsapp && <span>WhatsApp: {settings.whatsapp}</span>}
                  </p>
                )}
                {settings.email && <p>Email: {settings.email}</p>}
              </div>
            </div>
          </div>

          {/* Quotation Header Details */}
          <div className="sm:text-right">
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#F58220] block">
              Official Quotation
            </span>
            <span className="text-xl sm:text-2xl font-black text-[#071D3A] font-mono-numbers block mt-0.5">
              {quotation.quotation_number}
            </span>
            <div className="text-xs text-slate-500 mt-2 font-mono-numbers space-y-0.5">
              <p><strong className="text-slate-700">Date:</strong> {quotation.date}</p>
              {quotation.valid_until && (
                <p><strong className="text-slate-700">Valid Until:</strong> {quotation.valid_until}</p>
              )}
              <p>
                <strong className="text-slate-700">Status:</strong>{' '}
                <span className="uppercase text-emerald-700 font-bold">{quotation.status}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Customer Information Block */}
        <div className="my-6 p-4 rounded-xl bg-[#F4F6F9] border border-slate-200">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Customer Details
          </span>
          <div className="mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#071D3A]">{quotation.customer_name}</h3>
              {quotation.customer_address && (
                <p className="text-xs text-slate-600">{quotation.customer_address}</p>
              )}
            </div>
            <div className="text-xs text-slate-600 sm:text-right">
              {quotation.customer_phone && <p>Phone: {quotation.customer_phone}</p>}
              {quotation.customer_email && <p>Email: {quotation.customer_email}</p>}
            </div>
          </div>
        </div>

        {/* Itemised Table (Desktop View & Print Document) */}
        <div className="hidden md:block print:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#071D3A] text-white">
                <th className="py-2.5 px-3 font-semibold rounded-l-lg w-10 text-center">#</th>
                <th className="py-2.5 px-3 font-semibold min-w-[240px]">Description</th>
                <th className="py-2.5 px-3 font-semibold text-right w-24">Quantity</th>
                <th className="py-2.5 px-3 font-semibold text-right w-28">Unit Price</th>
                <th className="py-2.5 px-3 font-semibold text-right rounded-r-lg w-28">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono-numbers">
              {quotation.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 text-center text-slate-400 font-mono align-top">{idx + 1}</td>
                  <td className="py-3 px-3 font-sans font-medium text-[#172033] break-words leading-relaxed">
                    {item.item_description}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 align-top">
                    {item.quantity} {item.unit || 'pcs'}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 align-top">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-[#071D3A] align-top">
                    {formatCurrency(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Itemised Cards (Mobile Screen View - iPhone Friendly) */}
        <div className="md:hidden print:hidden space-y-2.5">
          {quotation.items.map((item, idx) => (
            <div
              key={item.id}
              className="p-3.5 bg-[#F4F6F9] rounded-xl border border-slate-200/90 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="px-1.5 py-0.5 bg-[#071D3A] text-white text-[10px] font-bold rounded font-mono shrink-0 mt-0.5">
                    #{idx + 1}
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-[#172033] leading-snug break-words">
                    {item.item_description}
                  </p>
                </div>
                <span className="text-xs sm:text-sm font-bold text-[#071D3A] font-mono shrink-0 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {formatCurrency(item.line_total)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1.5 border-t border-slate-200">
                <span>Rate: {formatCurrency(item.unit_price)} / {item.unit || 'pcs'}</span>
                <span>Qty: {item.quantity} {item.unit || 'pcs'}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary & Grand Total */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="text-xs text-slate-500 max-w-sm">
            <h4 className="font-bold text-[#071D3A] mb-1">Terms & Notes:</h4>
            <p className="leading-relaxed">
              {quotation.notes || '1. Quotation valid for 7 calendar days.\n2. Prices subject to supplier adjustments.\n3. Goods remain the property of Shucadea Hardware until paid in full.'}
            </p>
          </div>

          <div className="w-full sm:w-64 space-y-1.5 font-mono-numbers text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-bold text-[#071D3A]">{formatCurrency(quotation.subtotal)}</span>
            </div>
            {quotation.discount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Discount:</span>
                <span>-{formatCurrency(quotation.discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-base sm:text-lg font-black text-[#071D3A] pt-2 border-t-2 border-[#071D3A]">
              <span>GRAND TOTAL:</span>
              <span className="text-[#F58220]">{formatCurrency(quotation.grand_total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center text-[10px] text-slate-400">
          <p>Thank you for choosing Shucadea Hardware. Building Harare with Quality & Integrity.</p>
        </div>
      </div>
    </div>
  );
};
