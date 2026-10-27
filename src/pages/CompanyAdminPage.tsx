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
} from 'lucide-react';

export const CompanyAdminPage: React.FC = () => {
  const { isMasterAdmin, user } = useAuth();
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

  // Extend Subscription Modal
  const [extendingCompany, setExtendingCompany] = useState<Company | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

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
    // Default 1 year from today
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
    setAdminLoginId(c.adminLoginId || '');
    setPin(''); // Leave blank if not changing
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
          adminLoginId,
          pin: pin.trim() ? pin.trim() : undefined,
        });
        setSuccessMsg(`কোম্পানি "${name}" এর সাবস্ক্রিপশন ও তথ্য সফলভাবে আপডেট হয়েছে!`);
      } else {
        if (!pin.trim() || pin.trim().length < 4 || pin.trim().length > 6) {
          throw new Error('এডমিন পিন অবশ্যই ৪ থেকে ৬ ডিজিটের হতে হবে।');
        }
        await api.createCompany({
          name,
          logoUrl,
          address,
          phone,
          subscriptionExpiry,
          adminLoginId,
          pin: pin.trim(),
        });
        setSuccessMsg(`নতুন কোম্পানি "${name}" সফলভাবে যুক্ত হয়েছে!`);
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
      setExtendingCompany(null);
      await fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'সাবস্ক্রিপশন বৃদ্ধি ব্যর্থ হয়েছে।');
    }
  };

  const handleDelete = async (c: Company) => {
    if (!window.confirm(`আপনি কি নিশ্চিতভাবে "${c.name}" কোম্পানি মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      await api.deleteCompany(c.id);
      setSuccessMsg(`কোম্পানি "${c.name}" সফলভাবে মুছে ফেলা হয়েছে!`);
      await fetchCompanies();
    } catch (err: any) {
      setErrorMsg(err.message || 'কোম্পানি মোছা যায়নি।');
    }
  };

  // Preset logo helpers
  const presetLogos = [
    { label: 'ডিলাক্স বাস লোগো', url: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=120&auto=format&fit=crop&q=80' },
    { label: 'এক্সপ্রেস কোচ লোগো', url: 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=120&auto=format&fit=crop&q=80' },
    { label: 'রয়্যাল গ্রিন লোগো', url: 'https://images.unsplash.com/photo-1557223562-6c77ef16210f?w=120&auto=format&fit=crop&q=80' },
  ];

  const today = getTodayDhakaDate();

  const filteredCompanies = companies.filter((c) => {
    const isExpired = c.subscriptionExpiry < today || c.status === 'expired';
    if (statusFilter === 'active' && isExpired) return false;
    if (statusFilter === 'expired' && !isExpired) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.adminLoginId.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term))
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

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchCompanies}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isMasterAdmin && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all shadow-purple-600/30 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন কোম্পানি ও সাবস্ক্রিপশন</span>
            </button>
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
            placeholder="কোম্পানির নাম, এডমিন আইডি দিয়ে খুঁজুন..."
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
                    {c.logoUrl ? (
                      <img
                        src={c.logoUrl}
                        alt={c.name}
                        className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-xs"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-black text-lg flex items-center justify-center shadow-xs">
                        {c.name.slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">{c.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                        <span>এডমিন আইডি:</span>
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                          {c.adminLoginId}
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
                    onClick={() => openEditModal(c)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="সম্পাদনা করুন"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="কোম্পানি মুছুন"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
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
                  placeholder="যেমন: শ্যামলী এন আর ট্রাভেলস, হানিফ এন্টারপ্রাইজ"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কোম্পানির নিজস্ব লোগো (Logo Image URL)
                </label>
                <input
                  type="url"
                  value={logoUrl ?? ''}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                />
                {/* Preset quick logo selection */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-slate-400">নমুনা লোগো:</span>
                  {presetLogos.map((pl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setLogoUrl(pl.url)}
                      className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 cursor-pointer"
                    >
                      {pl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    এডমিন লগইন আইডি *
                  </label>
                  <input
                    type="text"
                    value={adminLoginId ?? ''}
                    onChange={(e) => setAdminLoginId(e.target.value)}
                    placeholder="যেমন: shyamoli01"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-purple-500"
                    required
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
    </div>
  );
};
