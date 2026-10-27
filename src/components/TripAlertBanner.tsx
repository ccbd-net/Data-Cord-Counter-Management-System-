import React, { useState } from 'react';
import type { Schedule } from '../types/index.ts';
import { formatBengaliDateTime } from '../utils/formatters.ts';
import { AlertCircle, X, Clock, ShieldAlert } from 'lucide-react';

interface TripAlertBannerProps {
  schedule: Schedule;
}

export const TripAlertBanner: React.FC<TripAlertBannerProps> = ({ schedule }) => {
  const [dismissed, setDismissed] = useState<boolean>(false);

  // If there's an update recorded
  if (!schedule.lastTripUpdateAt || dismissed) return null;

  return (
    <div className="mb-4 bg-red-500 text-white p-3.5 rounded-2xl shadow-md border border-red-600 animate-pulse-subtle flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 bg-red-600 rounded-xl text-white shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5 animate-bounce" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm tracking-wide">
              জরুরি সতর্কতা: এই ট্রিপের তথ্য পরিবর্তন করা হয়েছে!
            </h4>
            <span className="text-[10px] bg-red-700/80 px-2 py-0.5 rounded-full uppercase font-mono">
              Trip Alert
            </span>
          </div>
          <p className="text-xs text-red-100 mt-1 font-medium">
            {schedule.lastTripUpdateReason || 'ট্রিপের সময়, গাড়ি বা সুপারভাইজার আপডেট করা হয়েছে।'}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-red-200 mt-1">
            <Clock className="w-3.5 h-3.5" />
            <span>পরিবর্তনের সময়: {formatBengaliDateTime(schedule.lastTripUpdateAt)}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-red-600 rounded-lg text-red-200 hover:text-white transition-colors"
        title="সতর্কতা বার্তা বন্ধ করুন"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
