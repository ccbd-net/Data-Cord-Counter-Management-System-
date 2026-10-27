import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { User, Counter, Supervisor, Driver } from '../types/index.ts';
import { toBengaliDigits, formatBengaliDateTime } from '../utils/formatters.ts';
import {
  Users,
  Plus,
  Search,
  KeyRound,
  Shield,
  Phone,
  Building2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Edit,
  Trash2,
  UserCheck,
  Briefcase,
  UserCog,
  Truck,
} from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { user: currentUser, isMasterAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'supervisors' | 'drivers'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [loginId, setLoginId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [role, setRole] = useState<User['role']>('booking_point');
  const [counterId, setCounterId] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Supervisor Modal State (Name only, NO phone)
  const [isSupModalOpen, setIsSupModalOpen] = useState<boolean>(false);
  const [editingSup, setEditingSup] = useState<Supervisor | null>(null);
  const [supName, setSupName] = useState<string>('');

  // Driver Modal State (Name only, NO login)
  const [isDriverModalOpen, setIsDriverModalOpen] = useState<boolean>(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [driverName, setDriverName] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, cRes, sRes, dRes] = await Promise.all([
        api.getUsers(),
        api.getCounters(),
        api.getSupervisors(),
        api.getDrivers(),
      ]);
      setUsers(uRes.users);
      setCounters(cRes.counters);
      setSupervisors(sRes.supervisors);
      setDrivers(dRes.drivers || []);
    } catch (err) {
      console.error('Failed to load user, supervisor and driver data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // USER CRUD
  const openAddUserModal = () => {
    setEditingUser(null);
    setLoginId('');
    setName('');
    setRole('booking_point');
    setCounterId(counters[0]?.id || '');
    setPhone('');
    setPin('');
    setStatus('active');
    setErrorMsg('');
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (u: User) => {
    setEditingUser(u);
    setLoginId(u.loginId ?? '');
    setName(u.name ?? '');
    setRole(u.role || 'booking_point');
    setCounterId(u.counterId ?? '');
    setPhone(u.phone ?? '');
    setPin('');
    setStatus(u.status || 'active');
    setErrorMsg('');
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          name,
          role,
          counterId: role === 'booking_point' ? counterId : null,
          phone,
          status,
          pin: pin.trim() ? pin.trim() : undefined,
        });
        setSuccessMsg(`ব্যবহারকারী "${name}" এর তথ্য সফলভাবে আপডেট হয়েছে!`);
      } else {
        if (!pin.trim() || pin.trim().length < 4 || pin.trim().length > 6) {
          setErrorMsg('নতুন ব্যবহারকারীর জন্য ৪-৬ ডিজিট পিন কোড আবশ্যক!');
          return;
        }
        await api.createUser({
          loginId,
          name,
          role,
          counterId: role === 'booking_point' ? counterId : undefined,
          phone,
          pin,
        });
        setSuccessMsg(`নতুন ব্যবহারকারী "${name}" সফলভাবে তৈরি হয়েছে!`);
      }
      setIsUserModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'ব্যবহারকারী সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (u.id === currentUser?.id) {
      setErrorMsg('আপনি নিজের একাউন্ট ডিলিট করতে পারবেন না!');
      return;
    }
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${u.name}" (${u.loginId}) ব্যবহারকারীকে মুছে ফেলতে চান?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.deleteUser(u.id);
      setSuccessMsg(`ব্যবহারকারী "${u.name}" সফলভাবে মুছে ফেলা হয়েছে!`);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'ব্যবহারকারী মুছে ফেলা ব্যর্থ হয়েছে।');
    }
  };

  // SUPERVISOR CRUD (Strictly name directory - NO login)
  const openAddSupModal = () => {
    setEditingSup(null);
    setSupName('');
    setErrorMsg('');
    setIsSupModalOpen(true);
  };

  const openEditSupModal = (s: Supervisor) => {
    setEditingSup(s);
    setSupName(s.name ?? '');
    setErrorMsg('');
    setIsSupModalOpen(true);
  };

  const handleSaveSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!supName.trim()) {
      setErrorMsg('সুপারভাইজারের নাম আবশ্যক!');
      return;
    }

    try {
      if (editingSup) {
        await api.updateSupervisor(editingSup.id, {
          name: supName.trim(),
        });
        setSuccessMsg(`সুপারভাইজার "${supName}" এর তথ্য আপডেট হয়েছে!`);
      } else {
        await api.createSupervisor({
          name: supName.trim(),
        });
        setSuccessMsg(`নতুন সুপারভাইজার "${supName}" সফলভাবে তালিকায় যুক্ত হয়েছে!`);
      }
      setIsSupModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'সুপারভাইজার সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleDeleteSupervisor = async (s: Supervisor) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${s.name}" সুপারভাইজারকে তালিকা থেকে মুছে ফেলতে চান?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.deleteSupervisor(s.id);
      setSuccessMsg(`সুপারভাইজার "${s.name}" সফলভাবে মুছে ফেলা হয়েছে!`);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'সুপারভাইজার ডিলিট ব্যর্থ হয়েছে।');
    }
  };

  // DRIVER CRUD (Strictly name directory - NO login)
  const openAddDriverModal = () => {
    setEditingDriver(null);
    setDriverName('');
    setErrorMsg('');
    setIsDriverModalOpen(true);
  };

  const openEditDriverModal = (d: Driver) => {
    setEditingDriver(d);
    setDriverName(d.name ?? '');
    setErrorMsg('');
    setIsDriverModalOpen(true);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!driverName.trim()) {
      setErrorMsg('ড্রাইভারের নাম আবশ্যক!');
      return;
    }

    try {
      if (editingDriver) {
        await api.updateDriver(editingDriver.id, {
          name: driverName.trim(),
        });
        setSuccessMsg(`ড্রাইভার "${driverName}" এর তথ্য আপডেট হয়েছে!`);
      } else {
        await api.createDriver({
          name: driverName.trim(),
        });
        setSuccessMsg(`নতুন ড্রাইভার "${driverName}" সফলভাবে তালিকায় যুক্ত হয়েছে!`);
      }
      setIsDriverModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'ড্রাইভার সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleDeleteDriver = async (d: Driver) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${d.name}" ড্রাইভারকে তালিকা থেকে মুছে ফেলতে চান?`)) {
      return;
    }
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.deleteDriver(d.id);
      setSuccessMsg(`ড্রাইভার "${d.name}" সফলভাবে মুছে ফেলা হয়েছে!`);
      await fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'ড্রাইভার ডিলিট ব্যর্থ হয়েছে।');
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.loginId.toLowerCase().includes(term) ||
      (u.counterName && u.counterName.toLowerCase().includes(term))
    );
  });

  const filteredSupervisors = supervisors.filter((s) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return s.name.toLowerCase().includes(term);
  });

  const filteredDrivers = drivers.filter((d) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return d.name.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <span>ইউজার, সুপারভাইজার ও ড্রাইভার ব্যবস্থাপনা</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            লগইন অপারেটর, সুপারভাইজার ও ড্রাইভারদের নাম তালিকা পরিচালনা করুন
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isMasterAdmin && (
            activeTab === 'users' ? (
              <button
                type="button"
                onClick={openAddUserModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন ইউজার তৈরি করুন</span>
              </button>
            ) : activeTab === 'supervisors' ? (
              <button
                type="button"
                onClick={openAddSupModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন সুপারভাইজার যোগ করুন</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={openAddDriverModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>নতুন ড্রাইভার যোগ করুন</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-3 text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'users' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>লগইন ইউজার ও কাউন্টার অপারেটর ({toBengaliDigits(users.length)})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('supervisors')}
          className={`pb-3 px-3 text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'supervisors' ? 'text-blue-700 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>সুপারভাইজার তালিকা (শুধু নাম) ({toBengaliDigits(supervisors.length)})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('drivers')}
          className={`pb-3 px-3 text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeTab === 'drivers' ? 'text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>ড্রাইভার তালিকা (শুধু নাম) ({toBengaliDigits(drivers.length)})</span>
        </button>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold border border-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl text-xs font-semibold border border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Search Input */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm ?? ''}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'users'
                ? 'ব্যবহারকারীর নাম, লগইন আইডি বা কাউন্টার খুঁজুন...'
                : activeTab === 'supervisors'
                ? 'সুপারভাইজারের নাম খুঁজুন...'
                : 'ড্রাইভারের নাম খুঁজুন...'
            }
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
          />
        </div>
      </div>

      {/* TAB 1: USERS TABLE */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">ব্যবহারকারী</th>
                  <th className="py-3 px-4">লগইন আইডি</th>
                  <th className="py-3 px-4">ভূমিকা (Role)</th>
                  <th className="py-3 px-4">নিযুক্ত কাউন্টার</th>
                  <th className="py-3 px-4">মোবাইল</th>
                  <th className="py-3 px-4 text-center">স্ট্যাটাস</th>
                  {isMasterAdmin && <th className="py-3 px-4 text-right">একশন</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      কোনো ব্যবহারকারী পাওয়া যায়নি।
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          তৈরি: {formatBengaliDateTime(u.createdAt)}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {u.loginId}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === 'master_admin'
                              ? 'bg-purple-100 text-purple-800'
                              : u.role === 'super_admin'
                              ? 'bg-rose-100 text-rose-800'
                              : u.role === 'moderator'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {u.role === 'master_admin'
                            ? 'মাস্টার এডমিন'
                            : u.role === 'super_admin'
                            ? 'সুপার এডমিন'
                            : u.role === 'moderator'
                            ? 'মডারেটর'
                            : 'কাউন্টার অপারেটর'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {u.counterName ? (
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <span
                              className="w-2.5 h-2.5 rounded-full shadow-2xs"
                              style={{ backgroundColor: u.counterColor || '#2563EB' }}
                            />
                            <span>{u.counterName}</span>
                            <span className="text-[10px] text-slate-400">({u.counterCode})</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">সকল কাউন্টার / কেন্দ্রীয়</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-600">
                        {u.phone || 'ফোন নেই'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {u.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
                        </span>
                      </td>

                      {isMasterAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditUserModal(u)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-semibold"
                              title="সম্পাদনা ও পিন পরিবর্তন"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-semibold"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUPERVISORS DIRECTORY (NO LOGIN, NAME ONLY) */}
      {activeTab === 'supervisors' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl p-4 text-xs">
            <h4 className="font-bold flex items-center gap-1.5 mb-1">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span>সুপারভাইজার তালিকা নির্দেশিকা (শুধু নাম)</span>
            </h4>
            <p className="text-slate-700 leading-relaxed">
              সুপারভাইজারদের সিস্টেমে কোনো নিজস্ব লগইন বা মোবাইল নম্বরের প্রয়োজন নেই। তারা শুধুমাত্র নামের তালিকায় অন্তর্ভুক্ত থাকেন এবং শিডিউল মেকিং বা ট্রিপ বরাদ্দের সময় ড্রপডাউন থেকে তাদের নির্বাচিত করা হয়।
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">ক্রমিক</th>
                    <th className="py-3 px-4">সুপারভাইজারের নাম</th>
                    <th className="py-3 px-4">যোগদানের তারিখ</th>
                    <th className="py-3 px-4">ব্যবহারের ক্ষেত্র</th>
                    <th className="py-3 px-4 text-center">স্ট্যাটাস</th>
                    {isMasterAdmin && <th className="py-3 px-4 text-right">একশন</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredSupervisors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        কোনো সুপারভাইজার যুক্ত করা নেই। "+ নতুন সুপারভাইজার যোগ করুন" বাটনে ক্লিক করে নাম যুক্ত করুন।
                      </td>
                    </tr>
                  ) : (
                    filteredSupervisors.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">
                          {toBengaliDigits(idx + 1)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                              {s.name.slice(0, 1)}
                            </div>
                            <span>{s.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {formatBengaliDateTime(s.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          শিডিউল মেকার ও ট্রিপ বরাদ্দ
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            সক্রিয়
                          </span>
                        </td>
                        {isMasterAdmin && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditSupModal(s)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-semibold"
                                title="সম্পাদনা"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSupervisor(s)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-semibold"
                                title="মুছে ফেলুন"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DRIVERS DIRECTORY (NAME ONLY, NO LOGIN) */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl p-4 text-xs">
            <h4 className="font-bold flex items-center gap-1.5 mb-1">
              <Truck className="w-4 h-4 text-indigo-600" />
              <span>ড্রাইভার তালিকা নির্দেশিকা (শুধু নাম)</span>
            </h4>
            <p className="text-slate-700 leading-relaxed">
              ড্রাইভারদের সিস্টেমে কোনো লগইন একাউন্টের প্রয়োজন নেই। এখানে শুধুমাত্র তাদের নাম যুক্ত থাকে, যা ট্রিপ শিডিউল তৈরি, ট্রিপ লগ এবং ফিরতি ট্রিপ বরাদ্দ করার সময় ড্রপডাউনে পাওয়া যায়।
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">ক্রমিক</th>
                    <th className="py-3 px-4">ড্রাইভারের নাম</th>
                    <th className="py-3 px-4">যোগদানের তারিখ</th>
                    <th className="py-3 px-4">ব্যবহারের ক্ষেত্র</th>
                    <th className="py-3 px-4 text-center">স্ট্যাটাস</th>
                    {isMasterAdmin && <th className="py-3 px-4 text-right">একশন</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredDrivers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        কোনো ড্রাইভার যুক্ত করা নেই। "+ নতুন ড্রাইভার যোগ করুন" বাটনে ক্লিক করে নাম যুক্ত করুন।
                      </td>
                    </tr>
                  ) : (
                    filteredDrivers.map((d, idx) => (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-500">
                          {toBengaliDigits(idx + 1)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                              {d.name.slice(0, 1)}
                            </div>
                            <span>{d.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                          {formatBengaliDateTime(d.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          শিডিউল মেকার, ট্রিপ লগ ও ফিরতি ট্রিপ
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            সক্রিয়
                          </span>
                        </td>
                        {isMasterAdmin && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditDriverModal(d)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-semibold"
                                title="সম্পাদনা"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDriver(d)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-semibold"
                                title="মুছে ফেলুন"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingUser ? 'ইউজার ও পিন সম্পাদনা' : 'নতুন ইউজার তৈরি করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
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

            <form onSubmit={handleSaveUser} className="space-y-4">
              {!editingUser && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    লগইন আইডি (ইউনিক) *
                  </label>
                  <input
                    type="text"
                    value={loginId ?? ''}
                    onChange={(e) => setLoginId(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="e.g. counter01, mod02"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ব্যবহারকারীর পূর্ণ নাম *
                </label>
                <input
                  type="text"
                  value={name ?? ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. মোঃ করিম হোসেন"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ভূমিকা (Role) *</label>
                <select
                  value={role ?? 'booking_point'}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white outline-none"
                >
                  <option value="booking_point">কাউন্টার বুকিং পয়েন্ট (Booking Operator)</option>
                  <option value="moderator">মডারেটর / অপারেশন ম্যানেজার (Moderator)</option>
                  <option value="master_admin">মাস্টার এডমিন (Master Admin)</option>
                </select>
              </div>

              {role === 'booking_point' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    নির্ধারিত কাউন্টার নির্বাচন *
                  </label>
                  <select
                    value={counterId ?? ''}
                    onChange={(e) => setCounterId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white outline-none"
                    required
                  >
                    <option value="">-- কাউন্টার সিলেক্ট করুন --</option>
                    {counters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) — {c.counterType === 'master_booking' ? 'মাষ্টার কাউন্টার' : 'রোড কাউন্টার'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">মোবাইল ফোন নম্বর</label>
                <input
                  type="tel"
                  value={phone ?? ''}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="017xxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {editingUser ? 'নতুন পিন কোড (পরিবর্তন করতে চাইলে)' : 'লগইন পিন (৪-৬ ডিজিট) *'}
                </label>
                <input
                  type="password"
                  value={pin ?? ''}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={editingUser ? 'পিন অপরিবর্তিত রাখতে খালি রাখুন' : '৪ থেকে ৬ সংখ্যার পিন'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono tracking-widest text-center font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required={!editingUser}
                />
              </div>

              {editingUser && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">স্ট্যাটাস</label>
                  <select
                    value={status ?? 'active'}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white outline-none"
                  >
                    <option value="active">সক্রিয় (Active)</option>
                    <option value="inactive">নিষ্ক্রিয় (Inactive)</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                {editingUser ? 'তথ্য আপডেট করুন' : 'নতুন ব্যবহারকারী তৈরি করুন'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Supervisor Modal */}
      {isSupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingSup ? 'সুপারভাইজার তথ্য সম্পাদনা' : 'নতুন সুপারভাইজার যোগ করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setIsSupModalOpen(false)}
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

            <form onSubmit={handleSaveSupervisor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  সুপারভাইজারের নাম *
                </label>
                <input
                  type="text"
                  value={supName ?? ''}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="যেমন: মোঃ কানন, সবুজ, সিরাজ"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                💡 <strong>দ্রষ্টব্য:</strong> সুপারভাইজারের কোনো মোবাইল নম্বর বা লগইন পাসওয়ার্ড প্রয়োজন নেই। এটি কেবল নাম হিসেবে তালিকায় সংরক্ষিত থাকবে এবং শিডিউল তৈরির ড্রপডাউনে পাওয়া যাবে।
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                {editingSup ? 'সুপারভাইজার নাম আপডেট করুন' : 'তালিকায় যোগ করুন'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Driver Modal */}
      {isDriverModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingDriver ? 'ড্রাইভার তথ্য সম্পাদনা' : 'নতুন ড্রাইভার যোগ করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(false)}
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

            <form onSubmit={handleSaveDriver} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ড্রাইভারের নাম *
                </label>
                <input
                  type="text"
                  value={driverName ?? ''}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="যেমন: জামাল, আনু, ফটিক, কুদ্দুস"
                  className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-relaxed">
                💡 <strong>দ্রষ্টব্য:</strong> ড্রাইভারের কোনো মোবাইল নম্বর বা লগইন অ্যাকাউন্টের প্রয়োজন নেই। এটি শুধু নাম হিসেবে সংরক্ষিত থাকবে এবং শিডিউল মেকার ও ফিরতি ট্রিপ ড্রপডাউনে সিলেক্ট করা যাবে।
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                {editingDriver ? 'ড্রাইভারের নাম আপডেট করুন' : 'তালিকায় যোগ করুন'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
