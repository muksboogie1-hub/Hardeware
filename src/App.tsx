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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [dbState, setDbState] = useState<AppDatabaseState>(() => storage.getState());
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  // Modals
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [dailyCloseOpen, setDailyCloseOpen] = useState(false);

  const refreshState = useCallback(() => {
    setDbState({ ...storage.getState() });
  }, []);

  // Check Supabase connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      const client = storage.getSupabase();
      if (!client) {
        setIsSupabaseConnected(false);
        return;
      }
      try {
        const { error } = await client.from('business_settings').select('*').limit(1);
        setIsSupabaseConnected(!error || error.code === 'PGRST116');
      } catch {
        setIsSupabaseConnected(false);
      }
    };
    checkConnection();
  }, [dbState.settings.supabase_url, dbState.settings.supabase_anon_key]);

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
