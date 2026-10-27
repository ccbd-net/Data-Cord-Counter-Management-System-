import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Building2,
  Bus,
  MapPin,
  Users,
  CalendarPlus,
  CalendarDays,
  Armchair,
  Printer,
  Scale,
  History,
  Sparkles,
  Settings,
  ShieldCheck,
  ChevronRight,
  Layers,
  Database,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'company_admin'
  | 'counters'
  | 'vehicles'
  | 'routes'
  | 'users'
  | 'schedule_maker'
  | 'daily_schedules'
  | 'seat_booking'
  | 'ticket_print'
  | 'reconciliation'
  | 'database'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onCloseMobile,
}) => {
  const { user, isMasterAdmin, isModerator, isMasterBookingCounter, canManageTrips } = useAuth();

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ElementType;
    badge?: string;
    adminOnly?: boolean;
    modOnly?: boolean;
    tripManagerOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: LayoutDashboard },
    { id: 'company_admin', label: 'কোম্পানি ও সাবস্ক্রিপশন', icon: Building2, adminOnly: true, badge: 'এডমিন' },
    { id: 'seat_booking', label: 'সিট বুকিং', icon: Armchair, badge: 'লাইভ' },
    { id: 'ticket_print', label: 'টিকিট প্রিন্ট', icon: Printer },
    { id: 'daily_schedules', label: 'দৈনিক ট্রিপ ও ফিরতি লগ', icon: CalendarDays, badge: 'ট্রিপ' },
    { id: 'schedule_maker', label: 'শিডিউল মেকার', icon: CalendarPlus, tripManagerOnly: true },
    { id: 'reconciliation', label: 'ট্রিপ হিসাব সমন্বয়', icon: Scale, modOnly: true },
    { id: 'counters', label: 'কাউন্টার ব্যবস্থাপনা', icon: Layers, modOnly: true },
    { id: 'vehicles', label: 'গাড়ি ব্যবস্থাপনা', icon: Bus, modOnly: true },
    { id: 'routes', label: 'রুট ব্যবস্থাপনা', icon: MapPin, tripManagerOnly: true },
    { id: 'users', label: 'ইউজার ও সুপারভাইজার', icon: Users, modOnly: true },
    { id: 'database', label: 'ডাটাবেইজ', icon: Database, badge: 'রেকর্ড' },
    { id: 'settings', label: 'সিস্টেম সেটিংস', icon: Settings, adminOnly: true },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (item.adminOnly && !isMasterAdmin) return false;
    if (item.tripManagerOnly && !canManageTrips) return false;
    if (item.modOnly && !isModerator) return false;
    return true;
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-200 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } border-r border-slate-800 shadow-xl lg:shadow-none`}
      >
        {/* Brand Header */}
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="CMS"
              className="w-10 h-10 rounded-xl object-cover shadow-md border border-slate-700/80 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-bold text-white text-xs leading-tight tracking-wide truncate">
                Counter Management
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold leading-tight mt-0.5">
                Powered By Data&Code
              </div>
            </div>
          </div>
        </div>

        {/* User Role Badge in Sidebar */}
        <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: user?.counterColor || '#10B981' }}
            />
            <span className="truncate max-w-[130px] text-slate-300 font-medium">
              {user?.counterName || user?.name}
            </span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold shrink-0">
            {user?.role === 'master_admin'
              ? 'এডমিন'
              : user?.role === 'moderator'
              ? 'ম্যানেজার'
              : isMasterBookingCounter
              ? 'মাষ্টার কাউন্টার'
              : 'কাউন্টার'}
          </span>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badge === 'লাইভ'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : item.badge === 'এডমিন'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-purple-500/20 text-purple-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* System Footer info */}
        <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>সিস্টেম সচল</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Asia/Dhaka</span>
        </div>
      </aside>
    </>
  );
};
