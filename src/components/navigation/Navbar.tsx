import React, { useState } from 'react';
import {
  LayoutDashboard,
  DoorOpen,
  FileSpreadsheet,
  BookOpen,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  Menu,
  X,
  AlertTriangle,
  Database,
  CloudOff,
  Cloud,
} from 'lucide-react';
import { BRAND_LOGO_URL } from '../../constants';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { BusinessSettings } from '../../types';

export type TabId =
  | 'dashboard'
  | 'doors'
  | 'quotations'
  | 'prices'
  | 'finances'
  | 'reports'
  | 'settings';

interface NavbarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  settings: BusinessSettings;
  isSupabaseConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  settings,
  isSupabaseConnected,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard' as TabId, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'doors' as TabId, label: 'Door Mgmt', icon: DoorOpen },
    { id: 'quotations' as TabId, label: 'Quotations', icon: FileSpreadsheet },
    { id: 'prices' as TabId, label: 'Price Library', icon: BookOpen },
    { id: 'finances' as TabId, label: 'Finances', icon: Wallet },
    { id: 'reports' as TabId, label: 'Reports', icon: BarChart3 },
    { id: 'settings' as TabId, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <>
      {/* Top App Header */}
      <header className="sticky top-0 z-40 bg-[#071D3A] text-white shadow-md border-b border-white/10 select-none">
        {/* Demo Mode Notice Banner if Active */}
        {settings.is_demo_mode && (
          <div className="bg-[#F58220] text-white px-3 py-1 text-center text-xs font-semibold flex items-center justify-center gap-1.5 shadow-inner">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>DEMO MODE ACTIVE — Sample data loaded. Real business records are preserved in Live Mode.</span>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Brand Lockup */}
          <div
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img
              src={BRAND_LOGO_URL}
              alt="Shucadea Hardware Logo"
              className="w-10 h-10 rounded-full border-2 border-[#F58220] object-cover shadow-sm transition group-hover:scale-105"
            />
            <div className="leading-tight">
              <span className="font-extrabold tracking-tight text-base sm:text-lg block text-white">
                SHUCADEA
              </span>
              <span className="text-[10px] tracking-wider uppercase text-[#F58220] font-bold block">
                Hardware Manager
              </span>
            </div>
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    isActive
                      ? 'bg-[#F58220] text-white shadow-sm'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Top Actions & Status */}
          <div className="flex items-center gap-2">
            {/* Storage indicator */}
            <div
              onClick={() => onSelectTab('settings')}
              className="cursor-pointer hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/10 text-slate-200 border border-white/10 hover:bg-white/15"
              title={
                isSupabaseConnected
                  ? 'Connected to Supabase PostgreSQL'
                  : 'Operating in Local Storage (Configure Supabase in Settings)'
              }
            >
              {isSupabaseConnected ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Supabase Connected</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">Local Storage</span>
                </>
              )}
            </div>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Mobile Menu Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu for quick access */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#071D3A] border-t border-white/10 px-4 py-3 space-y-1 shadow-2xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[#F58220] text-white shadow'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                {isSupabaseConnected ? (
                  <Cloud className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Database className="w-4 h-4 text-amber-400" />
                )}
                {isSupabaseConnected ? 'Supabase Sync Active' : 'Local Offline Storage'}
              </span>
              <button
                onClick={() => {
                  onSelectTab('settings');
                  setMobileMenuOpen(false);
                }}
                className="text-[#F58220] font-semibold underline"
              >
                Configure
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Fixed Bottom Navigation for Mobile (One-handed iPhone UX) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#071D3A]/95 backdrop-blur-md border-t border-white/10 text-white pb-safe shadow-2xl">
        <div className="grid grid-cols-5 items-center h-16 px-1">
          {[
            { id: 'dashboard' as TabId, label: 'Home', icon: LayoutDashboard },
            { id: 'doors' as TabId, label: 'Doors', icon: DoorOpen },
            { id: 'quotations' as TabId, label: 'Quotes', icon: FileSpreadsheet },
            { id: 'finances' as TabId, label: 'Finances', icon: Wallet },
            { id: 'reports' as TabId, label: 'Reports', icon: BarChart3 },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] transition active:scale-95 ${
                  isActive ? 'text-[#F58220]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                <span className={`text-[10px] tracking-tight mt-1 font-medium ${isActive ? 'font-bold' : ''}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
