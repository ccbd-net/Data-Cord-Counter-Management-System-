import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { Company } from '../types/index.ts';
import { toBengaliDigits, formatBengaliDate, getTodayDhakaDate } from '../utils/formatters.ts';
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  Calendar,
  Clock,
  ShieldCheck,
  KeyRound,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Phone,
  MapPin,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Lock,
  HardDrive,
  Database,
} from 'lucide-react';

export const CompanyAdminPage: React.FC = () => {
  const { isMasterAdmin, user, activeCompanyId, setActiveCompanyId } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [name, setName] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [subscriptionExpiry, setSubscriptionExpiry] = useState<string>('');
  const [adminLoginId, setAdminLoginId] = useState<string>('');
  const [pin, setPin] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Quick Reset Admin ID & PIN state
  const [resetModalCompany, setResetModalCompany] = useState<Company | null>(null);
  const [newAdminLoginId, setNewAdminLoginId] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [resetErrorMsg, setResetErrorMsg] = useState<string>('');
  const [resetSubmitting, setResetSubmitting] = useState<boolean>(false);

  // In-App Delete Confirmation Modal State
  const [deleteTargetCompany, setDeleteTargetCompany] = useState<Company | null>(null);
  const [deleteStats, setDeleteStats] = useState<Record<string, number> | null>(null);
  const [loadingDeleteStats, setLoadingDeleteStats] = useState<boolean>(false);
  const [deletingCompany, setDeletingCompany] = useState<boolean>(false);
  const [cleaningOrphans, setCleaningOrphans] = useState<boolean>(false);
  const [savingLocal, setSavingLocal] = useState<boolean>(false);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await api.getCompanies();
      setCompanies(res.companies);
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const calculateDaysRemaining = (expiryDate: string): number => {
    const today = new Date(getTodayDhakaDate()).getTime();
    const expiry = new Date(expiryDate).getTime();
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const openAddModal = () => {
    setEditingCompany(null);
    setName('');
    setLogoUrl('');
    setAddress('');
    setPhone('');
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setSubscriptionExpiry(nextYear.toISOString().split('T')[0]);
    setAdminLoginId('');
    setPin('1234');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Company) => {
    setEditingCompany(c);
    setName(c.name || '');
    setLogoUrl(c.logoUrl || '');
    setAddress(c.address || '');
    setPhone(c.phone || '');
    setSubscriptionExpiry(c.subscriptionExpiry || '');
    setAdminLoginId('');
    setPin('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      if (editingCompany) {
        await api.updateCompany(editingCompany.id, {
          name,
          logoUrl,
          address,
          phone,
          subscriptionExpiry,
          adminLoginId: adminLoginId.trim() ? adminLoginId.trim() : undefined,
          pin: pin.trim() ? pin.trim() : undefined,
        });
        setSuccessMsg(`কোম্পানি "${name}" এর সাবস্ক্রিপশন ও লোগো তথ্য সফলভাবে আপডেট হয়েছে!`);
        if (activeCompanyId === editingCompany.id || user?.companyId === editingCompany.id) {
          setActiveCompanyId(editingCompany.id);
        }
      } else {
        if (!pin.trim() || pin.trim().length < 4 || pin.trim().length > 6) {
          throw new Error('এডমিন পিন অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।');
        }
        const createRes = await api.createCompany({
          name,
          logoUrl,
          address,
          phone,
          subscriptionExpiry,
          adminLoginId,
          pin: pin.trim(),
        });
        if (createRes?.company?.id) {
          setActiveCompanyId(createRes.company.id);
        }
        setSuccessMsg(`নতুন কোম্পানি "${name}" সফলভাবে যুক্ত হয়েছে এবং সক্রিয় হিসেবে সেট করা হয়েছে!`);
      }
      setIsModalOpen(false);
      await fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'কোম্পানি সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtendSubscription = async (c: Company, daysToAdd: number) => {
    try {
      const currentExpiry = new Date(c.subscriptionExpiry > getTodayDhakaDate() ? c.subscriptionExpiry : getTodayDhakaDate());
      currentExpiry.setDate(currentExpiry.getDate() + daysToAdd);
      const newExpiry = currentExpiry.toISOString().split('T')[0];

      await api.updateCompany(c.id, {
        subscriptionExpiry: newExpiry,
        status: 'active',
      });
      setSuccessMsg(`কোম্পানি "${c.name}" এর সাবস্ক্রিপশন ${toBengaliDigits(daysToAdd)} দিন বাড়ানো হয়েছে! নতুন মেয়াদ: ${newExpiry}`);
      await fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'সাবস্ক্রিপশন বৃদ্ধি ব্যর্থ হয়েছে।');
    }
  };

  const openDeleteModal = async (c: Company) => {
    setErrorMsg('');
    setSuccessMsg('');
    setDeleteTargetCompany(c);
    setDeleteStats(null);
    setLoadingDeleteStats(true);
    try {
      const res = await api.getCompanyStats(c.id);
      setDeleteStats(res.stats || {});
    } catch {
      setDeleteStats({});
    } finally {
      setLoadingDeleteStats(false);
    }
  };

  const confirmDeleteCompany = async () => {
    if (!deleteTargetCompany) return;
    setDeletingCompany(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const targetId = deleteTargetCompany.id;
      const targetName = deleteTargetCompany.name;
      const res = await api.deleteCompany(targetId);
      if (activeCompanyId === targetId) {
        setActiveCompanyId(null);
      }
      setDeleteTargetCompany(null);
      setDeleteStats(null);
      const removedLabel = res.removedCount
        ? ` (সংশ্লিষ্ট ${toBengaliDigits(res.removedCount)} টি রেকর্ড সহ)`
        : '';
      setSuccessMsg(
        `কোম্পানি "${targetName}"${removedLabel} নিরাপদভাবে মুছে ফেলা হয়েছে। অন্য কোনো কোম্পানির ডাটাবেইজে কোনো প্রভাব পড়েনি।`
      );
      await fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'কোম্পানি মোছা যায়নি।');
    } finally {
      setDeletingCompany(false);
    }
  };

  const handleCleanupOrphans = async () => {
    setCleaningOrphans(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.cleanupOrphans();
      const totalCleaned = (res.serverRemoved || 0) + (res.browserRemoved || 0);
      if (totalCleaned > 0) {
        setSuccessMsg(
          `পূর্ববর্তী মুছে ফেলা কোম্পানির অবশিষ্ট ${toBengaliDigits(totalCleaned)} টি অরফান রেকর্ড ও ক্যাশ সফলভাবে পরিষ্কার করা হয়েছে।`
        );
      } else {
        setSuccessMsg('ডাটাবেইজ ও ব্রাউজার ক্যাশ সম্পূর্ণ পরিষ্কার রয়েছে — কোনো অরফান ডাটা পাওয়া যায়নি।');
      }
      await fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'অরফান ডাটা পরিষ্কার ব্যর্থ হয়েছে।');
    } finally {
      setCleaningOrphans(false);
    }
  };

  const handleSaveToLocal = async () => {
    setSavingLocal(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const stats = await api.saveToLocalStorage();
      const sizeKb = Math.max(1, Math.round((stats.localStorageBytes || 0) / 1024));
      setSuccessMsg(
        `বর্তমান ${toBengaliDigits(stats.companies)} টি কোম্পানির সকল ডাটা (${toBengaliDigits(sizeKb)} KB) ব্রাউজারের লোকাল স্টোরেজে নিরাপদভাবে সংরক্ষণ করা হয়েছে!`
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'লোকাল স্টোরেজে ডাটা জমা করতে সমস্যা হয়েছে।');
    } finally {
      setSavingLocal(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalCompany) return;
    if (!newAdminLoginId.trim()) {
      setResetErrorMsg('এডমিন লগইন আইডি দিন।');
      return;
    }
    if (!newPin.trim() || newPin.trim().length < 4 || newPin.trim().length > 6) {
      setResetErrorMsg('নতুন পিন অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।');
      return;
    }
    setResetSubmitting(true);
    setResetErrorMsg('');
    try {
      await api.updateCompany(resetModalCompany.id, {
        adminLoginId: newAdminLoginId.trim(),
        pin: newPin.trim(),
      });
      setSuccessMsg(`কোম্পানি "${resetModalCompany.name}" এর এডমিন আইডি (${newAdminLoginId}) ও পিন সফলভাবে রিসেট হয়েছে!`);
      setResetModalCompany(null);
      await fetchCompanies();
    } catch (err: any) {
      setResetErrorMsg(err.message || 'আইডি ও পিন রিসেট ব্যর্থ হয়েছে।');
    } finally {
      setResetSubmitting(false);
    }
  };

  const [isProcessingLogo, setIsProcessingLogo] = useState<boolean>(false);

  // Handle local file upload (mobile gallery / local storage / PC drive / camera)
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('শুধুমাত্র ছবি ফাইল (PNG, JPG, JPEG, WEBP) আপলোড করা যাবে।');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('ছবির সাইজ সর্বোচ্চ ২৫ মেগাবাইট (25MB) হতে পারবে।');
      return;
    }

    setIsProcessingLogo(true);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setIsProcessingLogo(false);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Optional crisp background fill for PNGs
            ctx.drawImage(img, 0, 0, width, height);
            const isPng = file.type === 'image/png';
            const compressed = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.88);
            setLogoUrl(compressed);
            setErrorMsg('');
          } else {
            setLogoUrl(reader.result as string);
          }
        } catch (err) {
          console.error('Error compressing logo:', err);
          setLogoUrl(reader.result as string);
        } finally {
          setIsProcessingLogo(false);
        }
      };

      img.onerror = () => {
        setIsProcessingLogo(false);
        setErrorMsg('ছবি প্রসেস করতে সমস্যা হয়েছে। অন্য একটি ছবি নির্বাচন করুন।');
      };

      img.src = reader.result;
    };

    reader.onerror = () => {
      setIsProcessingLogo(false);
      setErrorMsg('ফাইলটি পড়তে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    };

    reader.readAsDataURL(file);
    // Reset file input value so selecting the same file again triggers onChange
    e.target.value = '';
  };

  const today = getTodayDhakaDate();

  const filteredCompanies = companies.filter((c) => {
    const isExpired = c.subscriptionExpiry < today || c.status === 'expired';
    if (statusFilter === 'active' && isExpired) return false;
    if (statusFilter === 'expired' && !isExpired) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term)) ||
      (c.address && c.address.toLowerCase().includes(term))
    );
  });

  const activeCount = companies.filter((c) => c.subscriptionExpiry >= today && c.status === 'active').length;
  const expiredCount = companies.length - activeCount;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-700">
              সুপার এডমিন প্যানেল
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-semibold text-slate-600">এডমিন: {user?.name || 'Zayem Bhuiya'}</span>
          </div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 mt-1">
            <Building2 className="w-6 h-6 text-purple-600" />
            <span>কোম্পানি ও সাবস্ক্রিপশন ব্যবস্থাপনা</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            বিভিন্ন বাস কোম্পানির জন্য স্বতন্ত্র সাবস্ক্রিপশন, নিজস্ব লোগো ও নাম, এডমিন লগইন আইডি ও পিন নির্ধারণ করুন।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchCompanies}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isMasterAdmin && (
            <>
              <button
                type="button"
                onClick={handleCleanupOrphans}
                disabled={cleaningOrphans}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                title="আগের মুছে যাওয়া কোম্পানির কোনো অরফান ডাটা বা ক্যাশ থাকলে পরিষ্কার করুন"
              >
                <Database className={`w-3.5 h-3.5 text-slate-600 ${cleaningOrphans ? 'animate-pulse' : ''}`} />
                <span>{cleaningOrphans ? 'পরিষ্কার হচ্ছে...' : 'পুরানো ডাটা পরিষ্কার'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveToLocal}
                disabled={savingLocal}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                title="ডাটাবেইজের বর্তমান স্ন্যাপশট ব্রাউজার লোকাল স্টোরেজে জমা করুন"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
                <span>{savingLocal ? 'সংরক্ষণ হচ্ছে...' : 'লোকাল সেভ'}</span>
              </button>

              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all shadow-purple-600/30 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন কোম্পানি ও সাবস্ক্রিপশন</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">মোট কোম্পানি</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{toBengaliDigits(companies.length)} টি</div>
            <div className="text-[11px] text-slate-400 mt-0.5">নিবন্ধিত পরিবহন প্রতিষ্ঠান</div>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-600 font-bold">সক্রিয় সাবস্ক্রিপশন</div>
            <div className="text-2xl font-black text-emerald-700 mt-1">{toBengaliDigits(activeCount)} টি</div>
            <div className="text-[11px] text-emerald-500 mt-0.5">নিয়মিত সেবা সচল রয়েছে</div>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-rose-600 font-bold">মেয়াদোত্তীর্ণ সাবস্ক্রিপশন</div>
            <div className="text-2xl font-black text-rose-700 mt-1">{toBengaliDigits(expiredCount)} টি</div>
            <div className="text-[11px] text-rose-500 mt-0.5">নবায়ন করা প্রয়োজন</div>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm ?? ''}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="কোম্পানির নাম বা মোবাইল নম্বর দিয়ে খুঁজুন..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            সব ({toBengaliDigits(companies.length)})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            সক্রিয় ({toBengaliDigits(activeCount)})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === 'expired' ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-100 text-rose-700 hover:bg-rose-50'
            }`}
          >
            মেয়াদোত্তীর্ণ ({toBengaliDigits(expiredCount)})
          </button>
        </div>
      </div>

      {/* Company Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredCompanies.map((c) => {
          const daysLeft = calculateDaysRemaining(c.subscriptionExpiry);
          const isExpired = daysLeft <= 0;

          return (
            <div
              key={c.id}
              className={`bg-white rounded-3xl border transition-all shadow-xs hover:shadow-md p-5 flex flex-col justify-between ${
                isExpired ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'
              }`}
            >
              <div>
                {/* Card Top: Logo and Badges */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <img
                      src={c.logoUrl || '/logo.png'}
                      alt={c.name}
                      className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-xs bg-slate-900"
                    />
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">{c.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>এডমিন লগইন:</span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          গোপন ও সুরক্ষিত
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {isExpired ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>মেয়াদোত্তীর্ণ</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="w-3 h-3" />
                        <span>সক্রিয়</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Company Contact & Location */}
                <div className="py-3 space-y-1.5 text-xs text-slate-600 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{c.address || 'ঠিকানা নির্ধারিত হয়নি'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{c.phone || 'হটলাইন নেই'}</span>
                  </div>
                </div>

                {/* Subscription Expiry & Countdown */}
                <div className="py-3 bg-slate-50/80 rounded-2xl p-3 my-3 border border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 flex items-center gap-1 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <span>সাবস্ক্রিপশন মেয়াদ শেষ:</span>
                    </span>
                    <span className="font-bold text-slate-800 font-mono">
                      {formatBengaliDate(c.subscriptionExpiry)} ({toBengaliDigits(c.subscriptionExpiry)})
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">অবশিষ্ট সময়কাল:</span>
                    {isExpired ? (
                      <span className="font-bold text-rose-600">
                        সাবস্ক্রিপশন শেষ ({toBengaliDigits(Math.abs(daysLeft))} দিন পূর্বে শেষ)
                      </span>
                    ) : (
                      <span className={`font-bold ${daysLeft <= 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {toBengaliDigits(daysLeft)} দিন বাকি রয়েছে
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleExtendSubscription(c, 30)}
                    className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="সাবস্ক্রিপশন ৩০ দিন বাড়ান"
                  >
                    +৩০ দিন
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtendSubscription(c, 90)}
                    className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="সাবস্ক্রিপশন ৩ মাস বাড়ান"
                  >
                    +৩ মাস
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExtendSubscription(c, 365)}
                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="সাবস্ক্রিপশন ১ বছর বাড়ান"
                  >
                    +১ বছর
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setResetModalCompany(c);
                      setNewAdminLoginId('');
                      setNewPin('');
                      setResetErrorMsg('');
                    }}
                    className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                    title="এডমিন আইডি ও পিন রিসেট করুন"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="সম্পাদনা করুন"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteModal(c)}
                    className="p-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
                    title="কোম্পানি ও এর সব ডাটা নিরাপদভাবে মুছুন"
                    aria-label={`${c.name} মুছুন`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Enter Company Dashboard Context */}
              <button
                type="button"
                onClick={() => {
                  setActiveCompanyId(c.id);
                  setSuccessMsg(`"${c.name}" এর ড্যাশবোর্ডে প্রবেশ করেছেন। এখন আপনি এই কোম্পানির ট্রিপ, বাস ও কাউন্টার ব্যবস্থাপনা করতে পারবেন।`);
                }}
                className="w-full mt-2.5 px-3 py-2 bg-slate-900 hover:bg-purple-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                <span>কোম্পানি ড্যাশবোর্ডে প্রবেশ করুন</span>
              </button>
            </div>
          );
        })}
      </div>

      {filteredCompanies.length === 0 && !loading && (
        <div className="bg-white p-12 text-center rounded-3xl border border-dashed border-slate-300">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700">কোনো কোম্পানি খুঁজে পাওয়া যায়নি</div>
          <p className="text-xs text-slate-400 mt-1">
            নতুন পরিবহন কোম্পানি ও সাবস্ক্রিপশন তৈরি করতে উপরের বোতামে ক্লিক করুন।
          </p>
        </div>
      )}

      {/* Add / Edit Company Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingCompany ? 'কোম্পানি তথ্য ও সাবস্ক্রিপশন সম্পাদনা' : 'নতুন কোম্পানি ও সাবস্ক্রিপশন তৈরি'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  কোম্পানির নাম, নিজস্ব লোগো, এডমিন আইডি, পিন এবং নির্দিষ্ট মেয়াদের সাবস্ক্রিপশন দিন
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কোম্পানির নাম (Company Name) *
                </label>
                <input
                  type="text"
                  value={name ?? ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="যেমন: ঢাকা এক্সপ্রেস, সোনার বাংলা ট্রাভেলস"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  কোম্পানির নিজস্ব লোগো (গ্যালারি / ড্রাইভ / লোকাল স্টোরেজ থেকে আপলোড)
                </label>
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  {logoUrl ? (
                    <div className="relative group shrink-0">
                      <img
                        src={logoUrl}
                        alt="Company Logo"
                        className="w-14 h-14 rounded-xl object-cover border-2 border-purple-500 shadow-sm bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-1 shadow-md hover:bg-rose-700 cursor-pointer"
                        title="লোগো মুছে ফেলুন"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 bg-white shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor="company-logo-file-input"
                      className={`inline-flex items-center gap-2 px-3 py-1.5 ${
                        isProcessingLogo ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'
                      } text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs`}
                    >
                      {isProcessingLogo ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>লোগো প্রসেস হচ্ছে...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{logoUrl ? 'নতুন ছবি আপলোড করুন' : 'ডিভাইস বা ড্রাইভ থেকে লোগো নির্বাচন'}</span>
                        </>
                      )}
                    </label>
                    <input
                      id="company-logo-file-input"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                    <div className="text-[10px] text-slate-500 mt-1">
                      মোবাইল বা পিসির গ্যালারি/ড্রাইভ থেকে যে কোনো ছবি/লোগো সিলেক্ট করুন (PNG, JPG, WEBP)
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    এডমিন লগইন আইডি {editingCompany ? '(রিসেট করতে চাইলে)' : '*'}
                  </label>
                  <input
                    type="text"
                    value={adminLoginId ?? ''}
                    onChange={(e) => setAdminLoginId(e.target.value)}
                    placeholder={editingCompany ? 'অপরিবর্তিত রাখতে খালি রাখুন' : 'যেমন: admin01, transport01'}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                    required={!editingCompany}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    সিকিউর পিন (৪-৬ ডিজিট) {editingCompany ? '(পরিবর্তন করতে চাইলে)' : '*'}
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pin ?? ''}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder={editingCompany ? 'পরিবর্তন না করলে খালি রাখুন' : 'যেমন: 1234'}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                    required={!editingCompany}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  সাবস্ক্রিপশনের মেয়াদ শেষ হওয়ার তারিখ *
                </label>
                <input
                  type="date"
                  value={subscriptionExpiry ?? ''}
                  onChange={(e) => setSubscriptionExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  required
                />
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-slate-400">দ্রুত মেয়াদ সেট:</span>
                  {[
                    { label: '+১ মাস', days: 30 },
                    { label: '+৩ মাস', days: 90 },
                    { label: '+৬ মাস', days: 180 },
                    { label: '+১ বছর', days: 365 },
                  ].map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + p.days);
                        setSubscriptionExpiry(d.toISOString().split('T')[0]);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    প্রধান অফিসের ঠিকানা
                  </label>
                  <input
                    type="text"
                    value={address ?? ''}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="টার্মিনাল বা প্রধান অফিস"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    হটলাইন / মোবাইল নম্বর
                  </label>
                  <input
                    type="text"
                    value={phone ?? ''}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01711-XXXXXX"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{editingCompany ? 'আপডেট সংরক্ষণ' : 'কোম্পানি তৈরি করুন'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Reset Admin ID & PIN Modal */}
      {resetModalCompany && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">এডমিন লগইন আইডি ও পিন রিসেট</h3>
                  <div className="text-[11px] text-slate-300">{resetModalCompany.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalCompany(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetErrorMsg && (
              <div className="m-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-2xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{resetErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleResetSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কোম্পানি এডমিন লগইন আইডি *
                </label>
                <input
                  type="text"
                  value={newAdminLoginId}
                  onChange={(e) => setNewAdminLoginId(e.target.value)}
                  placeholder="যেমন: chandra01"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  নতুন ৪-৬ ডিজিট সিকিউর পিন *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="যেমন: 1234"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  required
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  এই নতুন আইডি ও পিন দিয়ে কোম্পানি এডমিন তার প্যানেলে লগইন করতে পারবে।
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetModalCompany(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{resetSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'আইডি ও পিন আপডেট করুন'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Isolated Delete Confirmation Modal */}
      {deleteTargetCompany && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-company-title"
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="delete-company-title" className="font-bold text-sm">
                    কোম্পানি স্থায়ীভাবে মুছে ফেলার নিশ্চিতকরণ
                  </h3>
                  <div className="text-[11px] text-rose-100">{deleteTargetCompany.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !deletingCompany && setDeleteTargetCompany(null)}
                disabled={deletingCompany}
                className="p-1.5 text-rose-100 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs text-slate-700 leading-relaxed">
                আপনি কি নিশ্চিতভাবে <strong className="text-slate-900">"{deleteTargetCompany.name}"</strong> কোম্পানি ও এর অধীনস্থ সকল রেকর্ড মুছে ফেলতে চান?
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5">
                <div className="text-[11px] font-bold text-slate-600 mb-2.5">
                  এই কোম্পানির সাথে যেসব নিজস্ব ডাটা মুছে যাবে:
                </div>
                {loadingDeleteStats ? (
                  <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>ডাটাবেইজ রেকর্ড হিসাব করা হচ্ছে...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: 'ইউজার ও অপারেটর', val: deleteStats?.users || 0 },
                      { label: 'কাউন্টার', val: deleteStats?.counters || 0 },
                      { label: 'গাড়ি', val: deleteStats?.vehicles || 0 },
                      { label: 'রুট', val: deleteStats?.routes || 0 },
                      { label: 'ট্রিপ / শিডিউল', val: deleteStats?.schedules || 0 },
                      { label: 'টিকিট বুকিং', val: deleteStats?.bookings || 0 },
                      { label: 'ট্রিপ হিসাব সমন্বয়', val: deleteStats?.reconciliations || 0 },
                      { label: 'ফুয়েল লগ এন্ট্রি', val: deleteStats?.fuelEntries || 0 },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between px-2.5 py-1.5 bg-white rounded-lg border border-slate-200"
                      >
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-bold text-slate-900 tabular-nums">
                          {toBengaliDigits(row.val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 font-medium leading-relaxed">
                সুরক্ষা নিশ্চিত: কেবল এই কোম্পানির (<span className="font-mono">{deleteTargetCompany.id}</span>) নিজস্ব ডাটা ও ব্রাউজার ক্যাশ মুছে যাবে। অন্য কোনো কোম্পানির ডাটাবেইজ, টিকিট বা সুপার এডমিন অ্যাকাউন্টে কোনো প্রভাব পড়বে না।
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteTargetCompany(null)}
                  disabled={deletingCompany}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  বাতিল করুন
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCompany}
                  disabled={deletingCompany || loadingDeleteStats}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingCompany ? 'মুছে ফেলা হচ্ছে...' : 'কোম্পানি ও সব ডাটা মুছুন'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
