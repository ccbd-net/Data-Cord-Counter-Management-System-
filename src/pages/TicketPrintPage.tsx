import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import type { Booking } from '../types/index.ts';
import { ThermalTicketModal } from '../components/ThermalTicketModal.tsx';
import { formatTaka, toBengaliDigits, formatBengaliDateTime, getTodayDhakaDate } from '../utils/formatters.ts';
import {
  Printer,
  Search,
  Calendar,
  Ticket,
  Clock,
  User,
  CheckCircle,
  RefreshCw,
  Phone,
  Filter,
} from 'lucide-react';

export const TicketPrintPage: React.FC = () => {
  const [date, setDate] = useState<string>(getTodayDhakaDate());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBookingForPrint, setSelectedBookingForPrint] = useState<Booking | null>(null);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await api.getBookings({ date });
      setBookings(res.bookings);
    } catch (err) {
      console.error('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [date]);

  // Filter bookings by search term (ticketNo, phone, passengerName, seatNumber)
  const filteredBookings = bookings.filter((b) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      b.ticketNo.toLowerCase().includes(term) ||
      b.passengerName.toLowerCase().includes(term) ||
      b.passengerPhone.includes(term) ||
      b.vehicleRegNo.toLowerCase().includes(term) ||
      b.seatNumbers.some((s) => s.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-600" />
            <span>৫৮ মিমি থার্মাল টিকিট প্রিন্ট ও রিপ্ৰিন্ট হাব</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ইস্যুকৃত সকল টিকিটের তালিকা, যাত্রী কপি, অফিস কপি বা উভয় কপি পুনর্মুদ্রণ করুন
          </p>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={fetchBookings}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search Input Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="টিকিট নম্বর, যাত্রীর নাম, মোবাইল নম্বর অথবা সিট নম্বর দিয়ে খুঁজুন..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
          />
        </div>
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="text-xs text-slate-500 hover:text-slate-800 px-3 py-2 bg-slate-100 rounded-xl font-medium"
          >
            ক্লিয়ার
          </button>
        )}
      </div>

      {/* Bookings Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            টিকিটের তালিকা ({toBengaliDigits(filteredBookings.length)} টি)
          </h3>
          <span className="text-[11px] text-slate-500">
            ৫৮ মিমি থার্মাল পিওএস প্রিন্টারের জন্য অপ্টিমাইজড
          </span>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            {searchTerm ? 'কোনো টিকিট খুঁজে পাওয়া যায়নি।' : 'এই তারিখে কোনো বুকিং নেই।'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b">
                  <th className="py-3 px-4 font-bold">টিকিট নং</th>
                  <th className="py-3 px-4 font-bold">কাউন্টার ও অপারেটর</th>
                  <th className="py-3 px-4 font-bold">ট্রিপ ও সময়</th>
                  <th className="py-3 px-4 font-bold">যাত্রী ও ফোন</th>
                  <th className="py-3 px-4 font-bold">আসন</th>
                  <th className="py-3 px-4 font-bold">মোট ভাড়া</th>
                  <th className="py-3 px-4 font-bold text-center">প্রিন্ট কাউন্ট</th>
                  <th className="py-3 px-4 font-bold text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900">{b.ticketNo}</div>
                      <div className="text-[10px] text-slate-400">{formatBengaliDateTime(b.bookedAt)}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: b.counterColor }}
                        />
                        <span className="font-semibold text-slate-800">{b.counterName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">{b.bookedByUserName}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{b.tripNo} ({b.tripTime})</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{b.routeName}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{b.passengerName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{b.passengerPhone || 'নেই'}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {b.seatNumbers.map((s) => (
                          <span
                            key={s}
                            className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: b.counterColor }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        মোট: {toBengaliDigits(b.totalSeats)} সিট
                      </div>
                    </td>

                    <td className="py-3 px-4 font-bold text-emerald-800 text-sm">
                      {formatTaka(b.totalFare)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.printedCount > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {toBengaliDigits(b.printedCount || 0)} বার
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedBookingForPrint(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>প্রিন্ট</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Thermal Ticket Modal */}
      {selectedBookingForPrint && (
        <ThermalTicketModal
          booking={selectedBookingForPrint}
          onClose={() => setSelectedBookingForPrint(null)}
          onPrinted={fetchBookings}
        />
      )}
    </div>
  );
};
