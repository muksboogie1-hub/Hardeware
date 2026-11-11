import React, { useState } from 'react';
import { Download, Share, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Hide if already in standalone app mode
  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
        <CheckCircle2 className="w-3.5 h-3.5" />
        PWA Installed
      </span>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-2 rounded-lg bg-[#F58220] hover:bg-[#e07212] text-white font-medium shadow-sm transition active:scale-95 ${
          variant === 'full' ? 'w-full py-2.5 px-4 text-sm justify-center' : 'px-3 py-1.5 text-xs'
        }`}
      >
        <Download className="w-4 h-4" />
        Install App
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium transition active:scale-95 ${
            variant === 'full' ? 'w-full py-2.5 px-4 text-sm justify-center' : 'px-3 py-1.5 text-xs'
          }`}
        >
          <Share className="w-3.5 h-3.5" />
          Install on iPhone
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-[#071D3A]">Install on iPhone / Safari</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#172033]">
                <div className="flex items-start gap-3 p-2.5 bg-[#F4F6F9] rounded-lg">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#071D3A] text-white flex items-center justify-center font-bold text-xs">1</span>
                  <p>Tap the <span className="font-semibold text-[#071D3A]">Share</span> button in the bottom Safari toolbar.</p>
                </div>
                <div className="flex items-start gap-3 p-2.5 bg-[#F4F6F9] rounded-lg">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#071D3A] text-white flex items-center justify-center font-bold text-xs">2</span>
                  <p>Scroll down the share sheet and tap <span className="font-semibold text-[#F58220]">Add to Home Screen</span>.</p>
                </div>
                <div className="flex items-start gap-3 p-2.5 bg-[#F4F6F9] rounded-lg">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#071D3A] text-white flex items-center justify-center font-bold text-xs">3</span>
                  <p>Tap <span className="font-semibold text-[#071D3A]">Add</span> at the top right to complete installation.</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#071D3A] py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for desktop or non-PWA browser
  return (
    <button
      onClick={() => alert('To install on desktop, click the install icon in your browser address bar or use Chrome/Edge.')}
      className={`flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-xs font-medium px-2.5 py-1 transition ${
        variant === 'full' ? 'w-full py-2 justify-center' : ''
      }`}
    >
      <Download className="w-3.5 h-3.5" />
      Install
    </button>
  );
};
