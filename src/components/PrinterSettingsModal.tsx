import React, { useState, useEffect } from 'react';
import { Printer, X, Check, Save, Sliders, FileText, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { openPrintWindow } from '../utils/pdfGenerator.ts';

export interface PrinterSettings {
  paperSize: '58mm' | '80mm' | 'A4';
  defaultCopy: 'BOTH' | 'PASSENGER' | 'OFFICE';
  autoPrintOnBooking: boolean;
  showLogoOnTicket: boolean;
  selectedPrinterName?: string;
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  paperSize: '58mm',
  defaultCopy: 'PASSENGER',
  autoPrintOnBooking: false,
  showLogoOnTicket: true,
  selectedPrinterName: 'সিস্টেম ডিফল্ট থার্মাল প্রিন্টার',
};

export function getStoredPrinterSettings(): PrinterSettings {
  try {
    const saved = localStorage.getItem('bus_printer_settings');
    if (saved) {
      return { ...DEFAULT_PRINTER_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_PRINTER_SETTINGS;
}

export function saveStoredPrinterSettings(settings: PrinterSettings) {
  try {
    localStorage.setItem('bus_printer_settings', JSON.stringify(settings));
  } catch {
    // fallback
  }
}

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: PrinterSettings) => void;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PrinterSettings>(getStoredPrinterSettings());
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(getStoredPrinterSettings());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveStoredPrinterSettings(settings);
    setSavedSuccess(true);
    if (onSave) onSave(settings);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleTestPrint = () => {
    const companyName = user?.company?.name || 'কাউন্টার ম্যানেজমেন্ট সিস্টেম';
    const companyPhone = user?.company?.phone || '০১৭১১-২২৩৩৪৪';

    const testHtml = `
      <div style="text-align: center; border: 1.5px solid #000; padding: 8px; border-radius: 4px; font-family: 'Hind Siliguri', sans-serif;">
        <div style="font-size: 14px; font-weight: 800; margin-bottom: 2px;">${companyName}</div>
        <div style="font-size: 10px; color: #475569; margin-bottom: 6px;">প্রিন্টার টেস্ট স্লিপ (${settings.paperSize.toUpperCase()})</div>
        <div style="display: inline-block; padding: 2px 6px; border: 1px solid #000; font-weight: bold; font-size: 10px; margin: 4px 0;">টেস্ট প্রিন্ট সফল</div>
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        <table style="width: 100%; font-size: 10.5px; border-collapse: collapse;">
          <tr><td style="text-align: left; padding: 2px 0;">তারিখ ও সময়:</td><td style="text-align: right; font-weight: bold;">${new Date().toLocaleString('bn-BD')}</td></tr>
          <tr><td style="text-align: left; padding: 2px 0;">কাগজের সাইজ:</td><td style="text-align: right; font-weight: bold;">${settings.paperSize}</td></tr>
          <tr><td style="text-align: left; padding: 2px 0;">ডিফল্ট কপি:</td><td style="text-align: right; font-weight: bold;">${settings.defaultCopy === 'BOTH' ? 'উভয় কপি' : settings.defaultCopy === 'PASSENGER' ? 'যাত্রী কপি' : 'অফিস কপি'}</td></tr>
          <tr><td style="text-align: left; padding: 2px 0;">হটলাইন:</td><td style="text-align: right; font-weight: bold;">${companyPhone}</td></tr>
        </table>
        <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>
        <div style="font-size: 9px; text-align: center; color: #334155;">বাংলা লেখা ও প্রিন্টার কনফিগারেশন ১০০% সঠিক রয়েছে।</div>
      </div>
    `;

    openPrintWindow(testHtml, `টেস্ট প্রিন্ট — ${companyName}`, settings.paperSize);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">এড প্রিন্টার ও প্রিন্ট কনফিগারেশন</h3>
              <p className="text-[11px] text-slate-300">
                ৫৮ মিমি / ৮০ মিমি পিওএস থার্মাল ও এ৪ প্রিন্টার সেটিংস
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>প্রিন্টার সেটিংস সফলভাবে সংরক্ষিত হয়েছে!</span>
            </div>
          )}

          {/* Paper Size */}
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-2">
              ১. প্রিন্টার ও কাগজের সাইজ নির্বাচন (Printer Paper Size)
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: '58mm', title: '৫৮ মিমি থার্মাল', desc: 'মিনি পিওএস রোল (2-inch)' },
                { id: '80mm', title: '৮০ মিমি থার্মাল', desc: 'স্ট্যান্ডার্ড পিওএস (3-inch)' },
                { id: 'A4', title: 'A4 / A5 লেটারহেড', desc: 'অফিস ডেক্সটপ প্রিন্টার' },
              ].map((p) => {
                const isSelected = settings.paperSize === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, paperSize: p.id as any })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">{p.title}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Copy Option */}
          <div>
            <label className="block text-xs font-bold text-slate-900 mb-2">
              ২. ডিফল্ট প্রিন্ট কপি (Default Copies)
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'BOTH', title: 'উভয় কপি', desc: 'যাত্রী + অফিস কপি' },
                { id: 'PASSENGER', title: 'যাত্রী কপি', desc: 'শুধু প্যাসেঞ্জার কপি' },
                { id: 'OFFICE', title: 'অফিস কপি', desc: 'শুধু কাউন্টার অডিট কপি' },
              ].map((c) => {
                const isSelected = settings.defaultCopy === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSettings({ ...settings, defaultCopy: c.id as any })}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold ring-2 ring-purple-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold">{c.title}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-purple-600" />}
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">{c.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <div>
                <div className="font-bold text-slate-800">স্বয়ংক্রিয় প্রিন্ট ডায়লগ (Auto Print)</div>
                <div className="text-[10px] text-slate-500">
                  সিট বুকিং নিশ্চিত হওয়ার সাথে সাথে প্রিন্ট উইন্ডো চালু হবে
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.autoPrintOnBooking}
                onChange={(e) => setSettings({ ...settings, autoPrintOnBooking: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <div>
                <div className="font-bold text-slate-800">কোম্পানি লোগো ও হেডার প্যাড প্রিন্ট</div>
                <div className="text-[10px] text-slate-500">
                  টিকিট ও রিপোর্টের উপরে কোম্পানির আসল নাম ও লোগো প্রদর্শন
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.showLogoOnTicket}
                onChange={(e) => setSettings({ ...settings, showLogoOnTicket: e.target.checked })}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Notice info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-blue-900 leading-relaxed">
            💡 <strong>প্রিন্টার কানেকশন গাইড:</strong> ইউএসবি বা ব্লুটুথ থার্মাল প্রিন্টারটি আপনার পিসি/মোবাইলে কানেক্ট রাখুন। প্রিন্ট বাটনে চাপ দিলে সিস্টেম আপনার নির্বাচিত পেপার সাইজে বাংলা ফন্ট বিকৃত না করে সরাসরি নিখুঁতভাবে প্রিন্ট করবে।
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestPrint}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-purple-600" />
            <span>টেস্ট প্রিন্ট দিন</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200 font-bold rounded-xl text-xs transition-colors"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>সেটিংস সংরক্ষণ করুন</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
