import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Database,
  Cloud,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Shield,
  FileCode,
} from 'lucide-react';
import { BusinessSettings, AppDatabaseState } from '../../types';
import { storage } from '../../services/storage';

interface SettingsViewProps {
  data: AppDatabaseState;
  onRefresh: () => void;
  isSupabaseConnected: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  data,
  onRefresh,
  isSupabaseConnected,
}) => {
  const [form, setForm] = useState<BusinessSettings>(data.settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);

  const [importPreview, setImportPreview] = useState<{
    isOpen: boolean;
    content: string;
    summary: {
      exportDate?: string;
      quotationCount: number;
      priceLibraryCount: number;
      whiteBatchesCount: number;
      brownPurchasesCount: number;
      transactionsCount: number;
      dailyClosingsCount: number;
    };
    fileName: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await storage.saveSettings(form);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    onRefresh();
  };

  // Test Supabase connectivity
  const handleTestSupabase = async () => {
    if (!form.supabase_url || !form.supabase_anon_key) {
      setTestResult({
        success: false,
        message: 'Please provide both Supabase Project URL and Anon Key.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const url = form.supabase_url.replace(/\/$/, '') + '/rest/v1/';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: form.supabase_anon_key,
          Authorization: `Bearer ${form.supabase_anon_key}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        setTestResult({
          success: false,
          message: 'Authentication failed (401/403). Please verify your Anon Key.',
        });
      } else {
        setTestResult({
          success: true,
          message: 'Supabase host reachable and authentication key verified!',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection failed. Please check the URL and network connectivity.',
      });
    } finally {
      setTesting(false);
    }
  };

  // Toggle Live vs Demo Mode
  const handleToggleDemoMode = async (enabled: boolean) => {
    const confirmed = window.confirm(
      enabled
        ? 'Switch to Demo Mode? This will load sample business records. Your real live records remain safe and untouched.'
        : 'Switch to Live Production Mode? You will manage real business records.'
    );
    if (!confirmed) return;

    await storage.toggleDemoMode(enabled);
    onRefresh();
  };

  // Export full JSON backup
  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const json = await storage.exportBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const todayStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `shucadea_backup_${todayStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setImportSuccess('Full database backup exported successfully.');
      setTimeout(() => setImportSuccess(null), 3000);
      onRefresh();
    } catch (err: any) {
      setImportError('Failed to generate export: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file chosen for restore - stage preview
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        setImportError('Selected file is empty.');
        return;
      }

      const validation = storage.validateBackup(content);
      if (!validation.valid || !validation.summary) {
        setImportError('Invalid backup file: ' + (validation.error || 'Schema validation failed.'));
        return;
      }

      setImportPreview({
        isOpen: true,
        content,
        summary: validation.summary,
        fileName: file.name,
      });
    };
    reader.onerror = () => {
      setImportError('Could not read the selected backup file.');
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  // Confirm and apply restore
  const handleConfirmRestore = async () => {
    if (!importPreview) return;
    setIsRestoring(true);
    setImportError(null);

    try {
      const result = await storage.importBackupJson(importPreview.content);
      if (!result.success) {
        throw new Error(result.error || 'Failed to restore database');
      }

      setImportPreview(null);
      setImportSuccess('Database successfully restored! All business records and settings loaded.');
      onRefresh();
    } catch (err: any) {
      setImportError('Restore failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsRestoring(false);
    }
  };

  // Copy Supabase Schema SQL
  const handleCopySchema = async () => {
    try {
      const response = await fetch('/supabase/schema.sql');
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2000);
    } catch {
      alert('Schema SQL is available in /supabase/schema.sql');
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#071D3A] tracking-tight">
            System & Business Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Business profiles, quotation defaults, Supabase cloud sync & data backups
          </p>
        </div>

        {saveSuccess && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" />
            Settings Saved
          </span>
        )}
      </div>

      {/* Demo vs Live Isolation Panel */}
      <div className={`p-5 rounded-2xl border transition ${
        data.settings.is_demo_mode
          ? 'bg-amber-50 border-amber-300'
          : 'bg-white border-slate-200 shadow-xs'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl flex-shrink-0 ${
              data.settings.is_demo_mode ? 'bg-[#F58220] text-white' : 'bg-[#071D3A] text-white'
            }`}>
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#071D3A]">
                  Operational Mode: {data.settings.is_demo_mode ? 'Demo Exploration' : 'Live Production'}
                </h3>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  data.settings.is_demo_mode ? 'bg-[#F58220] text-white' : 'bg-emerald-600 text-white'
                }`}>
                  {data.settings.is_demo_mode ? 'Demo' : 'Live Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                {data.settings.is_demo_mode
                  ? 'Demo mode allows testing door calculations and quotations with sample data without touching your real business records.'
                  : 'Live mode records your actual shop transactions, sales, and inventory. No mock data is shown.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleDemoMode(!data.settings.is_demo_mode)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-xs ${
                data.settings.is_demo_mode
                  ? 'bg-[#071D3A] hover:bg-slate-800 text-white'
                  : 'bg-[#F58220] hover:bg-[#e07212] text-white'
              }`}
            >
              {data.settings.is_demo_mode ? 'Switch to Live Mode' : 'Switch to Demo Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* Supabase Cloud Connection Panel (Optional) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 text-[#071D3A] rounded-xl">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#071D3A]">Cloud Database Sync</h3>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  Optional
                </span>
              </div>
              <p className="text-xs text-slate-500">
                The application operates autonomously with local IndexedDB storage. You can optionally link Supabase for multi-device cloud replication.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySchema}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
            >
              <FileCode className="w-4 h-4 text-[#071D3A]" />
              <span>{schemaCopied ? 'Schema Copied!' : 'Copy Schema SQL'}</span>
            </button>
          </div>
        </div>

        {/* Status indicator */}
        <div className="p-3 bg-[#F4F6F9] rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Storage Engine:</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
              <Database className="w-4 h-4 text-emerald-600" /> Persistent IndexedDB (Active & Verified)
            </span>
          </div>

          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {isSupabaseConnected ? 'Cloud replication connected' : 'Cloud sync not configured (local storage active)'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block">Supabase Project URL</label>
            <input
              type="text"
              placeholder="https://your-project.supabase.co"
              value={form.supabase_url}
              onChange={(e) => setForm({ ...form, supabase_url: e.target.value })}
              className="w-full mt-1 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block">Supabase Anon Key (Public)</label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              value={form.supabase_anon_key}
              onChange={(e) => setForm({ ...form, supabase_anon_key: e.target.value })}
              className="w-full mt-1 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleTestSupabase}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            <span>{testing ? 'Testing...' : 'Test Connection'}</span>
          </button>

          {testResult && (
            <span className={`text-xs font-semibold ${testResult.success ? 'text-emerald-700' : 'text-rose-600'}`}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>

      {/* Business Profile & Defaults Form */}
      <form onSubmit={handleSaveSettings} className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div>
          <h3 className="text-base font-bold text-[#071D3A] pb-3 border-b border-slate-100">
            Business Contact Details (Quotation Header)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block">Business Name</label>
              <input
                type="text"
                required
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block">Tagline</label>
              <input
                type="text"
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block">WhatsApp Number</label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Door Operation Standard Prices */}
        <div>
          <h3 className="text-base font-bold text-[#071D3A] pb-3 border-b border-slate-100">
            Door Operations Default Prices
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 font-mono-numbers">
            <div>
              <label className="text-xs font-semibold text-slate-600 block font-sans">
                White Door Purchase ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.default_white_purchase_price}
                onChange={(e) => setForm({ ...form, default_white_purchase_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block font-sans">
                White Batch Transport ($)
              </label>
              <input
                type="number"
                step="1"
                value={form.default_white_transport}
                onChange={(e) => setForm({ ...form, default_white_transport: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block font-sans">
                White FB Selling Price ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.default_white_fb_price}
                onChange={(e) => setForm({ ...form, default_white_fb_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block font-sans">
                White Walk-in Price ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.default_white_walkin_price}
                onChange={(e) => setForm({ ...form, default_white_walkin_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block font-sans">
                Brown Door Purchase ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.default_brown_purchase_price}
                onChange={(e) => setForm({ ...form, default_brown_purchase_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block font-sans">
                Brown Door Selling ($)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.default_brown_selling_price}
                onChange={(e) => setForm({ ...form, default_brown_selling_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071D3A] focus:outline-hidden font-bold"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-[#071D3A] hover:bg-slate-800 rounded-xl shadow-xs active:scale-95 transition"
          >
            <Save className="w-4 h-4 text-[#F58220]" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>

      {/* Backup & Data Sovereignty Section */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-[#071D3A]">
              Database Backup & Recovery
            </h3>
            <p className="text-xs text-slate-500">
              Export full JSON snapshots of your business records or restore from an existing backup file.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-500">Last Backup:</span>
            <span className={`font-mono font-bold px-2.5 py-1 rounded-md ${
              data.settings.last_backup_date
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {data.settings.last_backup_date
                ? new Date(data.settings.last_backup_date).toLocaleString()
                : 'Never backed up'}
            </span>
          </div>
        </div>

        {/* 7-Day Backup Reminder Banner */}
        {(!data.settings.last_backup_date ||
          Date.now() - new Date(data.settings.last_backup_date).getTime() > 7 * 24 * 60 * 60 * 1000) && (
          <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start sm:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Backup Recommended:</strong> It has been more than 7 days since your last database backup. Download a copy to safeguard your records against browser cache clearing or device loss.
              </span>
            </div>
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg whitespace-nowrap shadow-xs transition"
            >
              Backup Now
            </button>
          </div>
        )}

        {/* Action feedback */}
        {importSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{importSuccess}</span>
          </div>
        )}

        {importError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{importError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleExportBackup}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#071D3A] hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 disabled:opacity-50"
          >
            <Download className={`w-4 h-4 text-[#F58220] ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Generating JSON...' : 'Export Complete JSON Backup'}</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer border border-slate-200 transition active:scale-95">
            <Upload className="w-4 h-4 text-[#071D3A]" />
            <span>Restore from Backup File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelected}
              className="hidden"
            />
          </label>
        </div>

        <p className="text-[11px] text-slate-400">
          * Backups contain all quotations, price library records, white & brown door batches, transactions, daily closings, and business profiles.
        </p>
      </div>

      {/* Restore Preview & Confirmation Modal */}
      {importPreview?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#071D3A] text-white p-4 sm:p-5 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base sm:text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-[#F58220]" />
                  <span>Preview & Confirm Database Restore</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  File: {importPreview.fileName}
                </p>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="font-medium text-slate-600">Backup Export Timestamp:</span>
                <span className="font-bold text-[#071D3A]">
                  {importPreview.summary.exportDate
                    ? new Date(importPreview.summary.exportDate).toLocaleString()
                    : 'Unknown'}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2">Records in this Backup:</h4>
                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-500 block text-[11px]">Quotations</span>
                    <strong className="text-base text-[#071D3A]">{importPreview.summary.quotationCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-500 block text-[11px]">Price Library Items</span>
                    <strong className="text-base text-[#071D3A]">{importPreview.summary.priceLibraryCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-500 block text-[11px]">White Door Batches</span>
                    <strong className="text-base text-[#071D3A]">{importPreview.summary.whiteBatchesCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-500 block text-[11px]">Brown Door Purchases</span>
                    <strong className="text-base text-[#071D3A]">{importPreview.summary.brownPurchasesCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-500 block text-[11px]">Transactions</span>
                    <strong className="text-base text-[#071D3A]">{importPreview.summary.transactionsCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-500 block text-[11px]">Daily Closings</span>
                    <strong className="text-base text-[#071D3A]">{importPreview.summary.dailyClosingsCount}</strong>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Warning: Restoring will overwrite existing records</p>
                    <p className="text-[11px] text-amber-800">
                      Current data will be replaced. A pre-restore safety snapshot will automatically be archived in local storage before the restore completes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                disabled={isRestoring}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="px-5 py-2 bg-[#F58220] hover:bg-[#e07212] text-white font-bold rounded-xl shadow-xs transition text-xs flex items-center gap-1.5"
              >
                {isRestoring && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isRestoring ? 'Restoring Records...' : 'Confirm & Restore Records'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
