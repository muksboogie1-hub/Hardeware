/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SHUCADEA MANAGER — Master Application Root
 * Shucadea Hardware, Zimbabwe
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, TabId } from './components/navigation/Navbar';
import { Dashboard } from './components/dashboard/Dashboard';
import { DoorManagement } from './components/doors/DoorManagement';
import { QuotationManager } from './components/quotations/QuotationManager';
import { PriceLibrary } from './components/prices/PriceLibrary';
import { FinancialManagement } from './components/finances/FinancialManagement';
import { Reports } from './components/reports/Reports';
import { SettingsView } from './components/settings/SettingsView';
import { QuickSaleModal } from './components/doors/QuickSaleModal';
import { DailyClosingModal } from './components/closing/DailyClosingModal';
import { storage } from './services/storage';
import { AppDatabaseState } from './types';

import { BRAND_LOGO_URL } from './constants';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [dbState, setDbState] = useState<AppDatabaseState>(() => storage.getState());
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  // Modals
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [dailyCloseOpen, setDailyCloseOpen] = useState(false);

  const refreshState = useCallback(() => {
    setDbState({ ...storage.getState() });
  }, []);

  // Initialize IndexedDB storage and migrate existing localStorage data safely
  useEffect(() => {
    let mounted = true;
    storage.init()
      .then((loadedState) => {
        if (mounted) {
          setDbState({ ...loadedState });
          setIsInitializing(false);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize database:', err);
        if (mounted) {
          setInitError(err?.message || 'Database initialization error');
          setIsInitializing(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Optional background verification if cloud URL configured
  useEffect(() => {
    let mounted = true;
    if (!dbState.settings.supabase_url || !dbState.settings.supabase_anon_key) {
      setIsSupabaseConnected(false);
      return;
    }

    const checkConnection = async () => {
      try {
        const url = dbState.settings.supabase_url.replace(/\/$/, '') + '/rest/v1/';
        const res = await fetch(url, {
          headers: { apikey: dbState.settings.supabase_anon_key },
        });
        if (mounted) {
          setIsSupabaseConnected(res.status !== 401 && res.status !== 403);
        }
      } catch {
        if (mounted) {
          setIsSupabaseConnected(false);
        }
      }
    };
    checkConnection();
    return () => {
      mounted = false;
    };
  }, [dbState.settings.supabase_url, dbState.settings.supabase_anon_key]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#071D3A] text-white p-4">
        <img
          src={BRAND_LOGO_URL}
          alt="Shucadea Hardware"
          className="w-20 h-20 rounded-full border-4 border-[#F58220] mb-4 shadow-xl animate-pulse"
        />
        <h1 className="text-xl font-black tracking-tight mb-2">SHUCADEA HARDWARE</h1>
        <p className="text-xs text-slate-300 font-mono flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#F58220] animate-ping" />
          Initializing Local Database (IndexedDB)...
        </p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F9] text-[#172033] p-6 text-center">
        <div className="bg-white p-6 max-w-md w-full rounded-2xl shadow-xl border border-rose-200">
          <h2 className="text-lg font-bold text-rose-700 mb-2">Database Initialization Error</h2>
          <p className="text-xs text-slate-600 mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#071D3A] text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition"
          >
            Retry Launching Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F9] text-[#172033]">
      {/* Navigation Header & Mobile Bottom Bar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        settings={dbState.settings}
        isSupabaseConnected={isSupabaseConnected}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            data={dbState}
            onNavigate={setActiveTab}
            onOpenQuickSale={() => setQuickSaleOpen(true)}
            onOpenDailyClose={() => setDailyCloseOpen(true)}
          />
        )}

        {activeTab === 'doors' && (
          <DoorManagement data={dbState} onRefresh={refreshState} />
        )}

        {activeTab === 'quotations' && (
          <QuotationManager data={dbState} onRefresh={refreshState} />
        )}

        {activeTab === 'prices' && (
          <PriceLibrary data={dbState} onRefresh={refreshState} />
        )}

        {activeTab === 'finances' && (
          <FinancialManagement data={dbState} onRefresh={refreshState} />
        )}

        {activeTab === 'reports' && (
          <Reports data={dbState} />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            data={dbState}
            onRefresh={refreshState}
            isSupabaseConnected={isSupabaseConnected}
          />
        )}
      </main>

      {/* Global Quick Action Modals */}
      <QuickSaleModal
        data={dbState}
        isOpen={quickSaleOpen}
        onClose={() => setQuickSaleOpen(false)}
        onRefresh={refreshState}
      />

      <DailyClosingModal
        data={dbState}
        isOpen={dailyCloseOpen}
        onClose={() => setDailyCloseOpen(false)}
        onRefresh={refreshState}
      />
    </div>
  );
}
