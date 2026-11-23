import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Users,
  Sparkles,
  UsersRound,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Crown,
  WalletCards,
  ClipboardCheck,
  Bell,
  Clock3,
  PackageSearch,
  BarChart3,
  Settings,
  Database,
  CircleHelp,
  X,
} from 'lucide-react';
import type { StaffUser, WorkspaceTab } from '../types';

interface SidebarRailProps {
  activeTab: WorkspaceTab;
  businessName: string;
  onSelectTab: (tab: WorkspaceTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  cartCount: number;
  lowStockCount: number;
  supportRequestCount: number;
  notificationCount: number;
  user: StaffUser;
  onLogout: () => void;
}

const ADMIN_NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  Icon: typeof CalendarDays;
}> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', Icon: LayoutDashboard },
  { id: 'clients', label: 'Clients', shortLabel: 'Clients', Icon: Users },
  { id: 'employees', label: 'Employees', shortLabel: 'Employees', Icon: UsersRound },
  { id: 'catalog', label: 'Services & Products', shortLabel: 'Services', Icon: Sparkles },
  { id: 'schedule', label: 'Appointments', shortLabel: 'Bookings', Icon: CalendarDays },
  { id: 'pos', label: 'Sales & Payments', shortLabel: 'Sales', Icon: CreditCard },
  { id: 'inventory', label: 'Inventory', shortLabel: 'Inventory', Icon: PackageSearch },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', Icon: BarChart3 },
  { id: 'payroll', label: 'Commission Payroll', shortLabel: 'Payroll', Icon: WalletCards },
  { id: 'attendance', label: 'Staff Attendance', shortLabel: 'Attendance', Icon: Clock3 },
  { id: 'tasks', label: 'Staff Tasks', shortLabel: 'Tasks', Icon: ClipboardCheck },
  { id: 'notifications', label: 'Notifications', shortLabel: 'Alerts', Icon: Bell },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', Icon: Settings },
  { id: 'system-logs', label: 'System Logs', shortLabel: 'Logs', Icon: ClipboardList },
  { id: 'backups', label: 'Backups', shortLabel: 'Backups', Icon: Database },
  { id: 'support', label: 'Support & Help', shortLabel: 'Help', Icon: CircleHelp },
];

const EMPLOYEE_NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  Icon: typeof CalendarDays;
}> = [
  { id: 'my-day', label: 'Staff Dashboard', shortLabel: 'Dashboard', Icon: LayoutDashboard },
  { id: 'earnings', label: 'My Earnings', shortLabel: 'Earnings', Icon: WalletCards },
  { id: 'my-appointments', label: 'My Appointments', shortLabel: 'Bookings', Icon: CalendarDays },
  { id: 'timesheet', label: 'Attendance', shortLabel: 'Clock', Icon: Clock3 },
  { id: 'tasks', label: 'My Tasks', shortLabel: 'Tasks', Icon: ClipboardCheck },
  { id: 'clients', label: 'Services & Clients', shortLabel: 'Clients', Icon: Users },
  { id: 'pos', label: 'Sales & Payments', shortLabel: 'Sales', Icon: CreditCard },
  { id: 'inventory', label: 'Inventory', shortLabel: 'Inventory', Icon: PackageSearch },
  { id: 'profile', label: 'My Profile', shortLabel: 'Profile', Icon: UsersRound },
  { id: 'notifications', label: 'Notifications', shortLabel: 'Alerts', Icon: Bell },
  { id: 'reports', label: 'Reports', shortLabel: 'Reports', Icon: BarChart3 },
  { id: 'support', label: 'Help & Support', shortLabel: 'Help', Icon: CircleHelp },
];

export function SidebarRail({
  activeTab,
  businessName,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  cartCount,
  lowStockCount,
  supportRequestCount,
  notificationCount,
  user,
  onLogout,
}: SidebarRailProps) {
  const visibleNavItems = user.role === 'admin' ? ADMIN_NAV_ITEMS : EMPLOYEE_NAV_ITEMS;
  const getBadgeCount = (id: WorkspaceTab) =>
    id === 'pos' && cartCount > 0 ? cartCount
      : id === 'inventory' && lowStockCount > 0 ? lowStockCount
        : id === 'support' ? supportRequestCount
          : id === 'notifications' ? notificationCount : 0;

  return (
    <>
      {/* Desktop Beauty Boutique Navigation Rail */}
      <aside
        className={`no-print sticky top-0 hidden h-screen self-start md:flex flex-col justify-between text-[#F4F7FC] shrink-0 transition-[width] duration-200 border-r border-[#10284E] shadow-[12px_0_30px_-24px_rgba(8,27,54,0.36)] ${
          collapsed ? 'w-[80px]' : 'w-[248px]'
        } beauty-sidebar`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Brand Lockup */}
          <div className="flex items-center justify-between px-5 h-[78px] border-b border-white/10">
            {!collapsed ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-9 w-9 rounded-full border border-[#B7D2FF]/60 bg-white/10 flex items-center justify-center text-[#F4B629] shrink-0">
                  <Crown className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <span className="block max-w-full truncate font-serif-editorial text-lg font-semibold italic leading-none text-[#F4B629]">
                    {businessName}
                  </span>
                  <span className="block mt-1 text-[9px] uppercase tracking-[0.22em] text-[#B7D2FF]">
                    Beauty & Atelier
                  </span>
                </div>
              </div>
            ) : (
              <span className="font-serif-editorial text-xl font-semibold text-white mx-auto">
                SP
              </span>
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse navigation"
                className="h-9 w-9 flex items-center justify-center rounded-lg text-[#D5E4FF]/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </div>

          {collapsed && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand navigation"
                className="h-10 w-10 flex items-center justify-center rounded-lg text-[#D5E4FF]/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="p-3 space-y-1.5" aria-label="Primary Navigation">
            {visibleNavItems.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              const badgeCount = getBadgeCount(id);

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  title={collapsed ? label : undefined}
                  className={`w-full min-h-[44px] flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-r from-[#1479FF] to-[#0757D8] text-white shadow-[0_8px_18px_-10px_rgba(13,110,253,0.45)]'
                      : 'text-[#DCEBFF]/85 hover:bg-white/10 hover:text-white'
                  } ${collapsed ? 'justify-center px-0' : 'justify-between'}`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </span>
                  {!collapsed && badgeCount > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-ksh ${
                        id === 'inventory'
                          ? 'bg-[#FFFBEB] text-[#B45309]'
                          : 'bg-white/20 text-white'
                      }`}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className={`flex items-center gap-2 border-t border-white/10 bg-[#081B36]/70 p-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold text-white">{user.name}</p>
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#D5E4FF]/70">
                {user.role === 'admin' ? 'Owner / Admin' : 'Employee'}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            title={collapsed ? 'Sign out' : undefined}
            className="h-9 w-9 shrink-0 rounded-lg text-[#D5E4FF]/80 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="mx-auto h-4 w-4" />
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="no-print fixed inset-0 z-50 md:hidden">
        <button type="button" aria-label="Close navigation menu" onClick={onCloseMobile} className="absolute inset-0 bg-[#071426]/55" />
        <aside role="dialog" aria-modal="true" aria-label="Workspace navigation" className="relative flex h-full w-[min(86vw,300px)] flex-col text-[#F4F7FC] shadow-2xl beauty-sidebar">
          <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#B7D2FF]/60 bg-white/10 text-[#F4B629]"><Crown className="h-4 w-4" /></span>
              <div className="min-w-0"><span className="block truncate font-serif-editorial text-base font-semibold italic text-[#F4B629]">{businessName}</span><span className="mt-0.5 block text-[9px] uppercase tracking-[0.18em] text-[#B7D2FF]">Beauty & Atelier</span></div>
            </div>
            <button type="button" aria-label="Close navigation menu" onClick={onCloseMobile} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#D5E4FF]/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <nav aria-label="Primary Navigation" className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-1">{visibleNavItems.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              const badgeCount = getBadgeCount(id);
              return <button key={id} type="button" onClick={() => { onSelectTab(id); onCloseMobile(); }} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold ${isActive ? 'bg-gradient-to-r from-[#1479FF] to-[#0757D8] text-white' : 'text-[#DCEBFF]/85 hover:bg-white/10 hover:text-white'}`}>
                <span className="flex min-w-0 items-center gap-3"><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span></span>
                {badgeCount > 0 && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white">{badgeCount > 9 ? '9+' : badgeCount}</span>}
              </button>;
            })}</div>
          </nav>
          <div className="flex items-center justify-between border-t border-white/10 bg-[#081B36]/70 p-4">
            <div className="min-w-0"><p className="truncate text-xs font-bold text-white">{user.name}</p><p className="text-[9px] uppercase tracking-[0.12em] text-[#D5E4FF]/70">{user.role === 'admin' ? 'Owner / Admin' : 'Employee'}</p></div>
            <button type="button" onClick={onLogout} aria-label="Sign out" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#D5E4FF]/80 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
          </div>
        </aside>
      </div>}
    </>
  );
}
