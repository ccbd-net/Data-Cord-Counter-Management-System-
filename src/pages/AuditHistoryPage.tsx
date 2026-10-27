import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import type { AuditLog } from '../types/index.ts';
import { formatBengaliDateTime, toBengaliDigits } from '../utils/formatters.ts';
import {
  History,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Shield,
  Eye,
  X,
  FileText,
} from 'lucide-react';

export const AuditHistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditLogs({ actionType: actionFilter || undefined, limit: 200 });
      setLogs(res.auditLogs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const filteredLogs = logs.filter((l) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      l.userName.toLowerCase().includes(term) ||
      l.details.toLowerCase().includes(term) ||
      l.actionType.toLowerCase().includes(term) ||
      l.entityId.toLowerCase().includes(term)
    );
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE_BOOKING':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">বুকিং তৈরি</span>;
      case 'CANCEL_BOOKING':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">বুকিং বাতিল</span>;
      case 'CREATE_SCHEDULE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">শিডিউল তৈরি</span>;
      case 'UPDATE_SCHEDULE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">শিডিউল আপডেট</span>;
      case 'RECONCILE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">হিসাব সমন্বয়</span>;
      case 'SETTINGS_CHANGE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">সেটিংস পরিবর্তন</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{action}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            <span>পরিবর্তনের ইতিহাস ও অডিট ট্রেইল (Audit Logs)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            কে, কখন ট্রিপ শিডিউল, গাড়ি, সুপারভাইজার, ছাড়ার সময় বা বুকিং পরিবর্তন করেছেন তার বিস্তারিত রেকর্ড
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors self-start sm:self-auto"
          title="রিফ্রেশ"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="অপারেটর নাম, অ্যাকশন বা বিবরণ দিয়ে খুঁজুন..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
          />
        </div>

        {/* Action Type Filter Dropdown */}
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold outline-none"
        >
          <option value="">সকল অ্যাকশন (All Actions)</option>
          <option value="CREATE_BOOKING">বুকিং তৈরি (CREATE_BOOKING)</option>
          <option value="CANCEL_BOOKING">বুকিং বাতিল (CANCEL_BOOKING)</option>
          <option value="CREATE_SCHEDULE">শিডিউল তৈরি (CREATE_SCHEDULE)</option>
          <option value="UPDATE_SCHEDULE">শিডিউল পরিবর্তন (UPDATE_SCHEDULE)</option>
          <option value="RECONCILE">হিসাব সমন্বয় (RECONCILE)</option>
          <option value="SETTINGS_CHANGE">সেটিংস পরিবর্তন (SETTINGS_CHANGE)</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            লিপিবদ্ধ পরিবর্তন সমূহ ({toBengaliDigits(filteredLogs.length)} টি রেকর্ড)
          </h3>
          <span className="text-xs text-slate-500">অনপনেয় (Immutable Audit History)</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            কোনো পরিবর্তনের ইতিহাস পাওয়া যায়নি।
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="py-3 px-4 font-bold">সময় ও তারিখ</th>
                  <th className="py-3 px-4 font-bold">ব্যবহারকারী</th>
                  <th className="py-3 px-4 font-bold">অ্যাকশন টাইপ</th>
                  <th className="py-3 px-4 font-bold">বিবরণ</th>
                  <th className="py-3 px-4 font-bold text-right">পূর্বের/নতুন মান</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">
                        {formatBengaliDateTime(l.timestamp)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{l.id}</div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{l.userName}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">{l.role}</div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">{getActionBadge(l.actionType)}</td>

                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium leading-relaxed max-w-md">
                        {l.details}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {(l.previousValues || l.newValues) ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLog(l)}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>ডিফ দেখুন</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Diff / Value Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  পরিবর্তন বিবরণ ({selectedLog.actionType})
                </h3>
                <p className="text-xs text-slate-500">
                  সম্পাদনাকারী: {selectedLog.userName} ({formatBengaliDateTime(selectedLog.timestamp)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-medium text-slate-800">
                {selectedLog.details}
              </div>

              {selectedLog.previousValues && (
                <div>
                  <div className="font-bold text-red-600 mb-1">পূর্ববর্তী মান (Previous Values):</div>
                  <pre className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedLog.previousValues, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.newValues && (
                <div>
                  <div className="font-bold text-emerald-600 mb-1">নতুন মান (New Values):</div>
                  <pre className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-5 pt-3 border-t text-right">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
