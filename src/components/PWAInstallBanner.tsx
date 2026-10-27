import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle2,
  X,
  Smartphone,
  ExternalLink,
  Laptop,
  Apple,
  HelpCircle,
  Share2,
  MoreVertical,
  PlusSquare,
  Sparkles,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'android' | 'desktop' | 'ios'>('android');
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  useEffect(() => {
    // Check if in iframe
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    // Check if running as installed standalone app
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Detect device type to select default guide tab
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setActiveTab('ios');
    } else if (/android/.test(ua)) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }

    // Capture standard PWA install event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowModal(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (isInstalled || dismissed) return null;

  const handleInstallButtonClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
        return;
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    }
    // If prompt is not ready or blocked by browser/iframe, open helpful visual guide
    setShowModal(true);
  };

  const handleOpenDirectWindow = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* Top Notification Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white px-3 sm:px-5 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm border-b border-emerald-500/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 shadow-inner">
            <Smartphone className="w-4 h-4 text-emerald-300" />
          </div>
          <div className="truncate">
            <span className="font-bold text-white tracking-wide">
              অ্যাপ হিসেবে ইনস্টল করুন (PWA):
            </span>
            <span className="text-emerald-100 hidden sm:inline ml-1.5 text-xs opacity-90">
              মোবাইল বা কম্পিউটারে সরাসরি ইনস্টল করে অ্যাপ মোডে দ্রুত ব্যবহার করুন।
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isInIframe ? (
            <button
              type="button"
              onClick={handleOpenDirectWindow}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all text-xs cursor-pointer"
              title="অ্যাপটি নতুন ট্যাবে খুলুন"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>নতুন ট্যাবে খুলুন</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleInstallButtonClick}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all text-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ইনস্টল করুন</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white rounded-lg transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
            title="ইনস্টল সহায়িকা ও নির্দেশিকা"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">সহায়িকা</span>
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="ব্যানার বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Comprehensive PWA Installation Guide Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white text-slate-800 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">অ্যাপ ইনস্টল সহায়িকা (PWA)</h3>
                  <p className="text-xs text-emerald-300">মোবাইল ও পিসিতে ইনস্টল করার সহজ নিয়ম</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[80vh] overflow-y-auto space-y-4">
              {/* If in iframe alert box */}
              {isInIframe && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs">
                  <div className="font-bold flex items-center gap-1.5 text-amber-950 mb-1">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>প্রিভিউ মোড সতর্কবার্তা:</span>
                  </div>
                  <p className="leading-relaxed mb-2.5">
                    আপনি বর্তমানে ব্রাউজারের প্রিভিউ ফ্রেমের ভেতরে আছেন। মোবাইল বা কম্পিউটারে আসল অ্যাপ
                    হিসেবে ইনস্টল করতে নিচের বাটনে চাপ দিয়ে আলাদা উইন্ডো/ট্যাবে সরাসরি অ্যাপটি খুলুন:
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenDirectWindow}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>সরাসরি নতুন ট্যাবে অ্যাপটি খুলুন ↗</span>
                  </button>
                </div>
              )}

              {/* Direct Prompt Button if available */}
              {deferredPrompt && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <p className="text-xs text-emerald-900 font-semibold mb-2">
                    আপনার ব্রাউজার অ্যাপটি ইনস্টল করার জন্য প্রস্তুত!
                  </p>
                  <button
                    type="button"
                    onClick={handleInstallButtonClick}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer text-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>সরাসরি অ্যাপ ইনস্টল করুন</span>
                  </button>
                </div>
              )}

              {/* Device Selector Tabs */}
              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">আপনার ডিভাইস নির্বাচন করুন:</div>
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('android')}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeTab === 'android'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>অ্যান্ড্রয়েড</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('desktop')}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeTab === 'desktop'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>কম্পিউটার</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('ios')}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      activeTab === 'ios'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Apple className="w-3.5 h-3.5" />
                    <span>আইফোন</span>
                  </button>
                </div>
              </div>

              {/* Tab Contents */}
              {activeTab === 'android' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>Android Chrome ব্রাউজারে ইনস্টল করার নিয়ম:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-700 leading-relaxed font-medium">
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">১.</span>
                      <span>ব্রাউজারের উপরে ডান কোণায় থাকা <strong>৩-ডট (⋮)</strong> মেনু আইকনটিতে ট্যাপ করুন।</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">২.</span>
                      <span>মেনু অপশন থেকে <strong>"Add to Home screen" (হোম স্ক্রিনে যোগ করুন)</strong> নির্বাচন করুন।</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">৩.</span>
                      <span>
                        পপআপে <strong>"Create shortcut"</strong> অপশনের ডান পাশের তীর চিহ্নে <strong>(&gt;)</strong> ট্যাপ করে "Add" চাপুন।
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">৪.</span>
                      <span>
                        সাথে সাথে আপনার ফোনের হোম স্ক্রিনে অ্যাপের সুন্দর আইকন তৈরি হবে এবং এক ক্লিকেই ফুলস্ক্রিন অ্যাপ মোডে ওপেন হবে।
                      </span>
                    </li>
                  </ol>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-950 font-medium leading-relaxed">
                    <span className="font-bold text-emerald-800">💡 বিশেষ দ্রষ্টব্য:</span> যদি ক্রোম পপআপে "Install: This app cannot be installed" দেখায়, তবে ঠিক নিচেই থাকা <strong className="text-emerald-700">"Create shortcut" (Shortcuts open in Chrome)</strong> অপশনে চাপ দিন। এটি ফোন স্ক্রিনে অ্যাপ হিসেবেই যুক্ত হয়।
                  </div>
                </div>
              )}

              {activeTab === 'desktop' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-teal-600" />
                    <span>Chrome / Microsoft Edge (PC / Mac) এ ইনস্টল:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-700 leading-relaxed font-medium">
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">১.</span>
                      <span>ব্রাউজারের এড্রেস বারে (যেখানে লিঙ্ক থাকে) ডান পাশে থাকা <strong>⤓ (ইনস্টল) বা ⊕</strong> আইকনে ক্লিক করুন।</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">২.</span>
                      <span>অথবা ব্রাউজারের ৩-ডট মেনু ➔ <strong>"Save and share"</strong> ➔ <strong>"Install Cloud Counter Management System"</strong> এ ক্লিক করুন।</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">৩.</span>
                      <span><strong>"Install"</strong> কনফার্ম করুন। এটি আলাদা উইন্ডোতে ফুলস্ক্রিন সফটওয়্যার হিসেবে চালু হবে।</span>
                    </li>
                  </ol>
                </div>
              )}

              {activeTab === 'ios' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-3">
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Apple className="w-4 h-4 text-slate-800" />
                    <span>iPhone / iPad (Safari) ব্রাউজারে ইনস্টল:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-slate-700 leading-relaxed font-medium">
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">১.</span>
                      <span>অ্যাপটি অবশ্যই অ্যাপল <strong>Safari (সাফারি)</strong> ব্রাউজারে ওপেন করুন।</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">২.</span>
                      <span>সাফারি ব্রাউজারের নিচে থাকা <strong>শেয়ার (Share)</strong> আইকনে (একটি চারকোনা বক্স থেকে উপরের দিকে তীর) ট্যাপ করুন।</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">৩.</span>
                      <span>নিচে স্ক্রোল করে <strong>"Add to Home Screen" (হোম স্ক্রিনে যোগ করুন)</strong> অপশনটি ট্যাপ করুন এবং উপরে ডানে <strong>"Add"</strong> দিন।</span>
                    </li>
                  </ol>
                </div>
              )}

              {/* Advantages */}
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 text-[11px] text-emerald-950">
                <div className="font-bold mb-1 flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>PWA ইনস্টল করার সুবিধাসমূহ:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-700">
                  <div>✓ কোনো ব্রাউজার ইউআরএল বার ছাড়া ফুল স্ক্রিন মোড</div>
                  <div>✓ দ্রুত টিকিট বুকিং ও প্রিন্ট কার্যক্ষমতা</div>
                  <div>✓ ক্যাশ করা পেজ দিয়ে তাৎক্ষণিক লোডিং</div>
                  <div>✓ মোবাইল হোম স্ক্রিন থেকে এক ক্লিকে সরাসরি চালু</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                বন্ধ করুন
              </button>

              <button
                type="button"
                onClick={handleOpenDirectWindow}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>নতুন উইন্ডোতে খুলুন</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
