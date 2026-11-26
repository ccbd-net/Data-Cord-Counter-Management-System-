import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Sidebar, type NavTab } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { BookingPage } from './pages/BookingPage.tsx';
import { TicketPrintPage } from './pages/TicketPrintPage.tsx';
import { DailySchedulesPage } from './pages/DailySchedulesPage.tsx';
import { ScheduleMakerPage } from './pages/ScheduleMakerPage.tsx';
import { ReconciliationPage } from './pages/ReconciliationPage.tsx';
import { CountersPage } from './pages/CountersPage.tsx';
import { VehiclesPage } from './pages/VehiclesPage.tsx';
import { RoutesPage } from './pages/RoutesPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';
import { AuditHistoryPage } from './pages/AuditHistoryPage.tsx';
import { AiSummaryPage } from './pages/AiSummaryPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { CompanyAdminPage } from './pages/CompanyAdminPage.tsx';
import { DatabasePage } from './pages/DatabasePage.tsx';
import { FuelManagementPage } from './pages/FuelManagementPage.tsx';

const TAB_TITLES: Record<NavTab, string> = {
  dashboard: 'ড্যাশবোর্ড',
  company_admin: 'কোম্পানি ও সাবস্ক্রিপশন এডমিন',
  seat_booking: 'সিট বুকিং',
  ticket_print: 'টিকিট প্রিন্ট',
  daily_schedules: 'দৈনিক ট্রিপ শিডিউল ও ফিরতি লগ',
  schedule_maker: 'শিডিউল মেকার',
  reconciliation: 'ট্রিপ হিসাব সমন্বয়',
  fuel_management: 'জ্বালানি ব্যবস্থাপনা ও ডিজেল লগ',
  counters: 'কাউন্টার ব্যবস্থাপনা',
  vehicles: 'গাড়ি ব্যবস্থাপনা',
  routes: 'রুট ব্যবস্থাপনা',
  users: 'ইউজার ও সুপারভাইজার',
  database: 'ডাটাবেইজ — ট্রিপ ও রুট সমন্বয় রেকর্ড',
  settings: 'সিস্টেম সেটিংস',
};

import { PWAInstallBanner } from './components/PWAInstallBanner.tsx';

const VALID_TABS = new Set<NavTab>(Object.keys(TAB_TITLES) as NavTab[]);

function MainLayout() {
  const { user, loading, isFuelManager, isChecker, isSuperAdmin, isMasterAdmin, isModerator, canManageTrips, canManageFuel } = useAuth();
  const [currentTab, setCurrentTabState] = useState<NavTab>(() => {
    try {
      const saved = localStorage.getItem('zb_active_tab') as NavTab | null;
      if (saved && VALID_TABS.has(saved)) return saved;
    } catch {}
    return 'dashboard';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const setCurrentTab = (tab: NavTab) => {
    try {
      localStorage.setItem('zb_active_tab', tab);
    } catch {}
    setCurrentTabState(tab);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <img
          src="/assets/aistudio/1795612353186_f79fafda.jpg"
          alt="Data Code Logo"
          className="w-20 h-20 rounded-2xl object-cover shadow-2xl border border-emerald-500/40 mb-4"
        />
        <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-sm font-bold tracking-wider">কাউন্টার ম্যানেজমেন্ট সিস্টেম লোড হচ্ছে...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const isTabAllowed = (tab: NavTab): boolean => {
    if (isFuelManager) {
      return tab === 'dashboard' || tab === 'fuel_management' || tab === 'daily_schedules' || tab === 'database';
    }
    if (isChecker) {
      return tab === 'dashboard' || tab === 'seat_booking' || tab === 'ticket_print' || tab === 'daily_schedules' || tab === 'database';
    }
    if (tab === 'company_admin') return isSuperAdmin;
    if (tab === 'settings') return isMasterAdmin;
    if (tab === 'schedule_maker' || tab === 'routes') return canManageTrips;
    if (tab === 'fuel_management') return canManageFuel;
    if (tab === 'reconciliation' || tab === 'counters' || tab === 'vehicles' || tab === 'users') return isModerator;
    return true;
  };

  const effectiveTab: NavTab = isTabAllowed(currentTab)
    ? currentTab
    : isFuelManager
    ? 'fuel_management'
    : 'dashboard';

  // Jump helper
  const navigateTo = (tab: NavTab) => {
    setCurrentTab(tab);
  };

  const renderCurrentPage = () => {
    switch (effectiveTab) {
      case 'dashboard':
        return <DashboardPage onNavigateTo={navigateTo} />;
      case 'company_admin':
        return <CompanyAdminPage />;
      case 'seat_booking':
        return <BookingPage />;
      case 'ticket_print':
        return <TicketPrintPage />;
      case 'daily_schedules':
        return (
          <DailySchedulesPage
            onSelectTripForBooking={() => {
              setCurrentTab('seat_booking');
            }}
          />
        );
      case 'schedule_maker':
        return (
          <ScheduleMakerPage
            onScheduleCreated={() => {
              setCurrentTab('daily_schedules');
            }}
          />
        );
      case 'reconciliation':
        return <ReconciliationPage />;
      case 'fuel_management':
        return <FuelManagementPage />;
      case 'counters':
        return <CountersPage />;
      case 'vehicles':
        return <VehiclesPage />;
      case 'routes':
        return <RoutesPage />;
      case 'users':
        return <UsersPage />;
      case 'database':
        return <DatabasePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigateTo={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={effectiveTab}
        onSelectTab={setCurrentTab}
        isOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <PWAInstallBanner />
        <Header
          pageTitle={TAB_TITLES[effectiveTab] || 'কাউন্টার ম্যানেজমেন্ট সিস্টেম'}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
