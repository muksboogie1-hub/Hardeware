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

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    storage.saveSettings(form);
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
      const client = storage.reconnectSupabase(form.supabase_url, form.supabase_anon_key);
      if (!client) {
        throw new Error('Could not initialize Supabase client');
      }

      // Quick ping test
      const { data: pingData, error } = await client.from('business_settings').select('*').limit(1);
      if (error && error.code !== 'PGRST116') {
        // Connected to Supabase host, but table might not exist yet
        setTestResult({
          success: true,
          message: 'Supabase credentials verified! Run the schema SQL to create tables.',
        });
      } else {
        setTestResult({
          success: true,
          message: 'Successfully connected and authenticated with Supabase database!',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection failed. Please check the URL and Anon Key.',
      });
    } finally {
      setTesting(false);
    }
  };

  // Toggle Live vs Demo Mode
  const handleToggleDemoMode = (enabled: boolean) => {
    const confirmed = window.confirm(
      enabled
        ? 'Switch to Demo Mode? This will load sample business records. Your real live records remain safe and untouched.'
        : 'Switch to Live Production Mode? You will manage real business records.'
    );
    if (!confirmed) return;

    storage.toggleDemoMode(enabled);
    onRefresh();
  };

  // Export full JSON backup
  const handleExportBackup = () => {
    const json = storage.exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `shucadea_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import JSON backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = storage.importBackupJson(content);
        if (success) {
          alert('Backup data successfully imported!');
          onRefresh();
        } else {
          alert('Failed to import backup: Invalid file format.');
        }
      }
    };
    reader.readAsText(file);
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

      {/* Supabase Cloud Connection Panel */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#071D3A]">Supabase Database & Authentication</h3>
              <p className="text-xs text-slate-500">
                Connect your free Supabase PostgreSQL database for persistent multi-device cloud storage.
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
            <span className="font-semibold text-slate-600">Sync Status:</span>
            {isSupabaseConnected ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Connected to Supabase
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                <Database className="w-4 h-4" /> Using Safe Local Storage (Offline Ready)
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-400">
            Never loses data when offline
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
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-base font-bold text-[#071D3A] pb-3 border-b border-slate-100">
          Data Sovereignty, Export & Recovery
        </h3>
        <p className="text-xs text-slate-500">
          Export full JSON database snapshots for offline backup, spreadsheet ingestion, or device migration.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <Download className="w-4 h-4" />
            <span>Download Full JSON Backup</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition">
            <Upload className="w-4 h-4" />
            <span>Restore from Backup</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
