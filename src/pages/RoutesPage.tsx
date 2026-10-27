import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { api } from '../services/api.ts';
import type { RouteItem } from '../types/index.ts';
import { formatTaka, toBengaliDigits } from '../utils/formatters.ts';
import {
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  X,
  Edit,
  Trash2,
  Navigation,
} from 'lucide-react';

export const RoutesPage: React.FC = () => {
  const { isMasterAdmin, isModerator, isMasterBookingCounter, canManageTrips } = useAuth();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal State for Add & Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRoute, setEditingRoute] = useState<RouteItem | null>(null);
  const [name, setName] = useState<string>('');
  const [origin, setOrigin] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [stopsText, setStopsText] = useState<string>('');
  const [direction, setDirection] = useState<'UP' | 'DOWN' | 'BOTH'>('UP');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'UP' | 'DOWN'>('ALL');
  const [baseFare, setBaseFare] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const res = await api.getRoutes();
      setRoutes(res.routes);
    } catch (err) {
      console.error('Failed to load routes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const openAddModal = () => {
    setEditingRoute(null);
    setName('');
    setOrigin('');
    setDestination('');
    setStopsText('');
    setDirection('UP');
    setBaseFare('');
    setDistanceKm('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (r: RouteItem) => {
    setEditingRoute(r);
    setName(r.name || '');
    setOrigin(r.origin || '');
    setDestination(r.destination || '');
    setStopsText(Array.isArray(r.intermediateStops) ? r.intermediateStops.join(', ') : '');
    setDirection(r.direction || 'UP');
    setBaseFare(r.baseFare ? String(r.baseFare) : '');
    setDistanceKm(r.distanceKm ? String(r.distanceKm) : '');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const intermediateStops = stopsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const fareNum = baseFare.trim() ? Number(baseFare) : undefined;
      const distNum = distanceKm.trim() ? Number(distanceKm) : undefined;
      const finalName = name.trim() || `${origin} - ${destination}`;

      if (editingRoute) {
        await api.updateRoute(editingRoute.id, {
          name: finalName,
          origin,
          destination,
          intermediateStops,
          direction,
          baseFare: fareNum,
          distanceKm: distNum,
        });
        setSuccessMsg(`রুট "${finalName}" এর তথ্য সফলভাবে আপডেট হয়েছে!`);
      } else {
        await api.createRoute({
          name: finalName,
          origin,
          destination,
          intermediateStops,
          direction,
          baseFare: fareNum,
          distanceKm: distNum,
        });
        setSuccessMsg(`নতুন রুট "${finalName}" সফলভাবে তৈরি হয়েছে!`);
      }

      setIsModalOpen(false);
      await fetchRoutes();
    } catch (err: any) {
      setErrorMsg(err.message || 'রুট সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleDelete = async (r: RouteItem) => {
    if (!window.confirm(`আপনি কি নিশ্চিতভাবে "${r.name}" রুটটি মুছে ফেলতে চান?`)) {
      return;
    }

    try {
      await api.deleteRoute(r.id);
      setSuccessMsg(`রুট "${r.name}" সফলভাবে মুছে ফেলা হয়েছে!`);
      await fetchRoutes();
    } catch (err: any) {
      setErrorMsg(err.message || 'রুট মোছা ব্যর্থ হয়েছে।');
    }
  };

  const filtered = routes.filter((r) => {
    if (directionFilter === 'UP' && r.direction !== 'UP' && r.direction !== 'BOTH') return false;
    if (directionFilter === 'DOWN' && r.direction !== 'DOWN' && r.direction !== 'BOTH') return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.name.toLowerCase().includes(term) ||
      r.origin.toLowerCase().includes(term) ||
      r.destination.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            <span>রুট ও স্টপেজ ব্যবস্থাপনা</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            বাস চলাচলের প্রধান রুট ও মধ্যবর্তী স্টপেজ। কোন নির্দিষ্ট ভাড়া বাধ্যতামূলক নয়; ট্রিপ শিডিউল তৈরির সময় ভাড়া নির্ধারিত হয়।
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchRoutes}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canManageTrips && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন রুট তৈরি করুন</span>
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

      {/* Search Bar & Direction Filter Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            value={searchTerm ?? ''}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="রুটের নাম, শুরুর স্থান বা গন্তব্য দিয়ে খুঁজুন..."
            className="w-full px-2 py-1 bg-transparent text-xs outline-none"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setDirectionFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex-1 sm:flex-none text-center ${
              directionFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            সকল রুট ({routes.length})
          </button>
          <button
            type="button"
            onClick={() => setDirectionFilter('UP')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex-1 sm:flex-none text-center ${
              directionFilter === 'UP'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            আপ রুট
          </button>
          <button
            type="button"
            onClick={() => setDirectionFilter('DOWN')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex-1 sm:flex-none text-center ${
              directionFilter === 'DOWN'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ডাউন রুট
          </button>
        </div>
      </div>

      {/* Route Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between pb-3 border-b">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{r.name}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.direction === 'UP'
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : r.direction === 'DOWN'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-purple-100 text-purple-800 border border-purple-200'
                      }`}
                    >
                      {r.direction === 'UP' ? 'আপ রুট' : r.direction === 'DOWN' ? 'ডাউন রুট' : 'উভয় দিক'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-medium">
                    <span className="font-semibold text-slate-700">{r.origin}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold text-slate-700">{r.destination}</span>
                  </div>
                </div>

                <div className="text-right">
                  {r.baseFare ? (
                    <span className="text-sm font-black text-emerald-700">{formatTaka(r.baseFare)}</span>
                  ) : (
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      ভাড়া ট্রিপভিত্তিক
                    </span>
                  )}
                  {r.distanceKm && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      দূরত্ব: {toBengaliDigits(r.distanceKm)} কিমি
                    </div>
                  )}
                </div>
              </div>

              {/* Intermediate Stops Badges */}
              <div className="mt-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  মধ্যবর্তী স্টপেজ সমূহ:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {r.intermediateStops.length > 0 ? (
                    r.intermediateStops.map((stop, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-200"
                      >
                        📍 {stop}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">কোনো বিরতি স্থান নেই (নন-স্টপ)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Edit / Delete Action Buttons */}
            {canManageTrips && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {isMasterBookingCounter ? 'মাষ্টার বুকিং কাউন্টার পারমিশন' : 'এডমিন নিয়ন্ত্রণ'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(r)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>সম্পাদনা</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>মুছুন</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add / Edit Route Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingRoute ? 'রুট তথ্য সম্পাদনা' : 'নতুন রুট তৈরি করুন'}
                </h3>
                <p className="text-[11px] text-slate-400">ভাড়া নির্দিষ্ট নয়; শিডিউল তৈরির সময় প্রয়োজনমতো পরিবর্তন করা যায়</p>
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
              {/* Route Direction: UP / DOWN / BOTH */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  রুটের ট্রিপ দিক (আপ ট্রিপ রুট / ডাউন ট্রিপ রুট) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('UP')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      direction === 'UP'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 ring-2 ring-blue-500/20 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">আপ রুট</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">মাদারীপুর ➔ ঢাকা</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('DOWN')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      direction === 'DOWN'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-500/20 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">ডাউন রুট</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">ঢাকা ➔ মাদারীপুর</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('BOTH')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      direction === 'BOTH'
                        ? 'bg-purple-50 border-purple-600 text-purple-900 ring-2 ring-purple-500/20 font-bold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">উভয় দিক</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">দ্বিমুখী রুট</div>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  আপ ও ডাউন রুট আলাদা করলে সমন্বয় করার সময় রুট জোড়া হয়ে পূর্ণাঙ্গ ট্রিপের পূর্ণ রুট তৈরি হবে (যেমন: কালকিনি - কদমতলী + গুলিস্তান - মাদারীপুর = ১টি পুর্নাঙ্গ ট্রিপ)।
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  রুটের নাম (Route Title)
                </label>
                <input
                  type="text"
                  value={name ?? ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="যেমন: মাদারীপুর - পদ্মা সেতু - সায়েদাবাদ"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    শুরুর স্থান (Origin) *
                  </label>
                  <input
                    type="text"
                    value={origin ?? ''}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="মাদারীপুর"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    গন্তব্য (Destination) *
                  </label>
                  <input
                    type="text"
                    value={destination ?? ''}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="ঢাকা (গাবতলী)"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  মধ্যবর্তী স্টপেজ সমূহ (কমা দিয়ে আলাদা করুন)
                </label>
                <textarea
                  rows={2}
                  value={stopsText ?? ''}
                  onChange={(e) => setStopsText(e.target.value)}
                  placeholder="ভাঙ্গা, শিবচর, পদ্মা সেতু টোলপ্লাজা, সায়েদাবাদ"
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    আনুমানিক বেস ভাড়া (৳) <span className="text-slate-400 font-normal">(ঐচ্ছিক)</span>
                  </label>
                  <input
                    type="number"
                    value={baseFare ?? ''}
                    onChange={(e) => setBaseFare(e.target.value)}
                    placeholder="ট্রিপে পরিবর্তনযোগ্য"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    দূরত্ব (কিমি)
                  </label>
                  <input
                    type="number"
                    value={distanceKm ?? ''}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    placeholder="যেমন: ৮৫"
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{editingRoute ? 'আপডেট সংরক্ষণ' : 'রুট যুক্ত করুন'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
