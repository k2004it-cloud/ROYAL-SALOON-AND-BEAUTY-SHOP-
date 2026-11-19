import {
  CalendarDays,
  CreditCard,
  Users,
  Sparkles,
  ReceiptText,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { WorkspaceTab } from '../types';
import { formatKsh } from '../api/client';

interface SidebarRailProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  todayRevenueKsh: number;
  cartCount: number;
  lowStockCount: number;
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  Icon: typeof CalendarDays;
}> = [
  { id: 'schedule', label: 'Master Schedule', shortLabel: 'Schedule', Icon: CalendarDays },
  { id: 'pos', label: 'Point of Sale', shortLabel: 'POS', Icon: CreditCard },
  { id: 'clients', label: 'Clients & Formulas', shortLabel: 'Clients', Icon: Users },
  { id: 'catalog', label: 'Services & Stock', shortLabel: 'Services', Icon: Sparkles },
  { id: 'ledger', label: 'Financial Ledger', shortLabel: 'Ledger', Icon: ReceiptText },
];

export function SidebarRail({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  todayRevenueKsh,
  cartCount,
  lowStockCount,
}: SidebarRailProps) {
  return (
    <>
      {/* Desktop Deep-Plum Navigation Rail */}
      <aside
        className={`no-print hidden md:flex flex-col justify-between bg-[#1E152A] text-[#F9FAFB] shrink-0 transition-[width] duration-200 border-r border-[#2D213D] ${
          collapsed ? 'w-[80px]' : 'w-[248px]'
        }`}
      >
        <div>
          {/* Brand Lockup */}
          <div className="flex items-center justify-between px-5 h-[72px] border-b border-white/10">
            {!collapsed ? (
              <span className="font-serif-editorial text-2xl font-semibold tracking-tight text-white whitespace-nowrap">
                Salon Pro
              </span>
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
                className="h-9 w-9 flex items-center justify-center rounded-lg text-[#DAC5FF]/80 hover:text-white hover:bg-white/10 transition-colors"
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
                className="h-10 w-10 flex items-center justify-center rounded-lg text-[#DAC5FF]/80 hover:text-white hover:bg-white/10 transition-colors"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="p-3 space-y-1.5" aria-label="Primary Navigation">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              const badgeCount =
                id === 'pos' && cartCount > 0
                  ? cartCount
                  : id === 'catalog' && lowStockCount > 0
                    ? lowStockCount
                    : 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  title={collapsed ? label : undefined}
                  className={`w-full min-h-[44px] flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#6D28D9] text-white'
                      : 'text-[#DAC5FF]/85 hover:bg-white/10 hover:text-white'
                  } ${collapsed ? 'justify-center px-0' : 'justify-between'}`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </span>
                  {!collapsed && badgeCount > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-ksh ${
                        id === 'catalog'
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

        {/* Daily Drawer Summary */}
        <div className="p-4 border-t border-white/10 bg-[#120D1A]">
          {!collapsed ? (
            <div className="space-y-1">
              <p className="text-[11px] font-bold tracking-[0.04em] text-[#DAC5FF]/70">
                Daily Settled Takings
              </p>
              <p className="tabular-ksh text-lg font-bold text-white">
                {formatKsh(todayRevenueKsh)}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-[10px] font-bold text-[#DAC5FF]/70">KSh</p>
              <p className="tabular-ksh text-xs font-bold text-white truncate">
                {Math.round(todayRevenueKsh / 1000)}k
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Compact Bottom Bar (<= 15% viewport height) */}
      <nav
        aria-label="Mobile Navigation"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#1E152A] border-t border-white/10 grid grid-cols-5 h-16 px-1"
      >
        {NAV_ITEMS.map(({ id, shortLabel, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors ${
                isActive ? 'text-white bg-[#6D28D9]/80' : 'text-[#DAC5FF]/75'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-full px-1">{shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
