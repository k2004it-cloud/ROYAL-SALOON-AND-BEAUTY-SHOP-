import { useCallback, useEffect, useState } from 'react';
import type {
  Appointment,
  AppointmentStatus,
  AuthStatus,
  BootstrapPayload,
  BusinessSettings,
  CartLine,
  CatalogItem,
  PaymentMethod,
  InventoryReportType,
  Ticket,
  StaffUser,
  StaffRole,
  WorkspaceTab,
} from './types';
import { isAdminRole } from './types';
import { formatKsh, salonApi, todayIsoDate } from './api/client';
import { SidebarRail } from './components/SidebarRail';
import { ScheduleView } from './components/ScheduleView';
import { PosView } from './components/PosView';
import { ClientsView } from './components/ClientsView';
import { CatalogView } from './components/CatalogView';
import { LedgerView } from './components/LedgerView';
import { AuthView } from './components/AuthView';
import { EmployeesView } from './components/EmployeesView';
import { WorkspaceHomeView } from './components/WorkspaceHomeView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { SystemPages } from './components/SystemPages';
import { EmployeePages } from './components/EmployeePages';
import { NotificationsView } from './components/NotificationsView';
import { AttendanceView } from './components/AttendanceView';
import { EmployeeAttendanceView } from './components/EmployeeAttendanceView';
import { TasksView } from './components/TasksView';
import { InventoryReportsView } from './components/InventoryReportsView';
import { PayrollView } from './components/PayrollView';
import { ExpensesView, LoyaltyView } from './components/BusinessTrackingViews';
import { SuperadminView } from './components/SuperadminView';
import { Bell, CalendarDays, ChevronDown, Crown, LogOut, Menu, Search } from 'lucide-react';

const ROLE_TABS: Record<StaffRole, WorkspaceTab[]> = {
  superadmin: [
    'dashboard', 'superadmin', 'clients', 'loyalty', 'expenses', 'employees', 'catalog',
    'schedule', 'pos', 'inventory', 'reports', 'payroll', 'attendance', 'tasks',
    'notifications', 'settings', 'system-logs', 'backups', 'support',
  ],
  admin: [
    'dashboard',
    'clients',
    'loyalty',
    'expenses',
    'employees',
    'catalog',
    'schedule',
    'pos',
    'inventory',
    'reports',
    'payroll',
    'attendance',
    'tasks',
    'notifications',
    'settings',
    'system-logs',
    'backups',
    'support',
  ],
  employee: [
    'my-day',
    'earnings',
    'my-appointments',
    'my-clients',
    'timesheet',
    'tasks',
    'notifications',
    'profile',
    'support',
    'schedule',
    'pos',
    'clients',
    'loyalty',
    'expenses',
    'inventory',
    'reports',
  ],
};

function roleFromPath(path: string): StaffRole | null {
  const firstSegment = path.split('/').filter(Boolean)[0];
  return firstSegment === 'superadmin' || firstSegment === 'admin' || firstSegment === 'employee' ? firstSegment : null;
}

function defaultTabForRole(role: StaffRole): WorkspaceTab {
  return isAdminRole(role) ? 'dashboard' : 'my-day';
}

function tabFromPath(path: string, role: StaffRole): WorkspaceTab {
  const section = path.split('/').filter(Boolean)[1] as WorkspaceTab | undefined;
  return section && ROLE_TABS[role].includes(section) ? section : defaultTabForRole(role);
}

function pathForTab(role: StaffRole, tab: WorkspaceTab): string {
  if (!ROLE_TABS[role].includes(tab)) return `/${role}`;
  if (tab === defaultTabForRole(role)) return `/${role}`;
  return `/${role}/${tab}`;
}

function formatReadableDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const initialRole = roleFromPath(window.location.pathname) ?? 'employee';
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    tabFromPath(window.location.pathname, initialRole)
  );
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [businessDate, setBusinessDate] = useState<string>(todayIsoDate);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileMenuOpen]);

  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [toast, setToast] = useState<string>('');
  const [authUser, setAuthUser] = useState<StaffUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [superadminSetupRequired, setSuperadminSetupRequired] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authConnectionError, setAuthConnectionError] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(0);

  const navigatePath = useCallback((targetPath: string, replace = false) => {
    if (window.location.pathname !== targetPath) {
      if (replace) window.history.replaceState({}, '', targetPath);
      else window.history.pushState({}, '', targetPath);
    }
    setCurrentPath(targetPath);
    setAuthError('');
    const role = roleFromPath(targetPath);
    if (role) setActiveTab(tabFromPath(targetPath, role));
  }, []);

  const navigateToTab = useCallback((tab: WorkspaceTab) => {
    if (!authUser) return;
    navigatePath(pathForTab(authUser.role, tab));
  }, [authUser, navigatePath]);

  // Shared POS Ticket state across workspace handoffs
  const [cart, setCart] = useState<CartLine[]>([]);
  const [posClientId, setPosClientId] = useState<string>('');
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? '' : curr));
    }, 3400);
  }, []);

  const refreshData = useCallback(async (targetDate: string) => {
    setLoadError('');
    try {
      const payload = await salonApi.bootstrap(targetDate);
      setData(payload);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to reach the Royal Saloon API.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBusinessSettingsSaved = (settings: BusinessSettings) => {
    setData((current) => current ? { ...current, business_settings: settings } : current);
  };

  const handleProfileUpdated = (user: StaffUser) => {
    setAuthUser(user);
  };

  const checkAuthStatus = useCallback(async () => {
    setAuthChecking(true);
    setAuthError('');
    try {
      const status: AuthStatus = await salonApi.authStatus();
      setAuthUser(status.user);
      setSetupRequired(status.setup_required);
      setAdminSetupRequired(status.admin_setup_required);
      setSuperadminSetupRequired(status.superadmin_setup_required);
      setDemoMode(status.demo_mode);
      setAuthConnectionError(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to check staff access.');
      setAuthConnectionError(true);
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname;
      setCurrentPath(nextPath);
      const role = roleFromPath(nextPath);
      if (role) setActiveTab(tabFromPath(nextPath, role));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (authChecking) return;
    if (authUser) {
      const routeRole = roleFromPath(currentPath);
      if (!routeRole || (routeRole === authUser.role && currentPath.endsWith('/login'))) {
        navigatePath(pathForTab(authUser.role, defaultTabForRole(authUser.role)), true);
        return;
      }
      if (routeRole !== authUser.role) return;
      const canonicalPath = pathForTab(authUser.role, tabFromPath(currentPath, authUser.role));
      if (canonicalPath !== currentPath) navigatePath(canonicalPath, true);
    } else if (currentPath !== '/' && !roleFromPath(currentPath)) {
      navigatePath('/', true);
    }
  }, [authChecking, authUser, currentPath, navigatePath]);

  useEffect(() => {
    if (!authUser) return;
    void refreshData(businessDate);
  }, [authUser, businessDate, refreshData]);

  const syncWorkspace = useCallback(async () => {
    if (!authUser || document.visibilityState !== 'visible') return;
    void refreshData(businessDate);
    try {
      const [status, supportResult, announcementResult] = await Promise.all([
        salonApi.authStatus(),
        salonApi.listSupportRequests(),
        salonApi.listAnnouncements(),
      ]);
      setUnreadAnnouncementCount(announcementResult.unread_count);
      if (status.user && isAdminRole(status.user.role)) {
        setOpenSupportCount(supportResult.requests.filter((request) => request.status !== 'resolved').length);
      } else if (status.user?.role === 'employee') {
        const lastSeen = Number(window.localStorage.getItem('salon-support-seen-' + status.user.id) || 0);
        setOpenSupportCount(supportResult.requests.filter((request) =>
          Boolean(request.admin_reply.trim()) && new Date(request.updated_at).getTime() > lastSeen
        ).length);
      }
      setAuthUser((current) => {
        if (!status.user) return null;
        if (
          current &&
          current.id === status.user.id &&
          current.name === status.user.name &&
          current.username === status.user.username &&
          current.email === status.user.email &&
          current.phone === status.user.phone &&
          current.stylist_id === status.user.stylist_id &&
          current.role === status.user.role &&
          current.active === status.user.active
        ) return current;
        return status.user;
      });
    } catch {
      // Keep the current workspace visible during a temporary sync outage.
    }
  }, [authUser, businessDate, refreshData]);

  useEffect(() => {
    if (!authUser) return;
    void syncWorkspace();
    const fallbackInterval = window.setInterval(() => void syncWorkspace(), 60000);
    window.addEventListener('focus', syncWorkspace);
    document.addEventListener('visibilitychange', syncWorkspace);
    return () => {
      window.clearInterval(fallbackInterval);
      window.removeEventListener('focus', syncWorkspace);
      document.removeEventListener('visibilitychange', syncWorkspace);
    };
  }, [authUser?.id, syncWorkspace]);

  useEffect(() => {
    if (!authUser || import.meta.env.PROD) return;
    const events = new EventSource('/api/events');
    const handleWorkspaceUpdate = () => {
      window.dispatchEvent(new Event('salon:workspace-updated'));
      void syncWorkspace();
    };
    events.onopen = () => { void syncWorkspace(); };
    events.addEventListener('workspace-updated', handleWorkspaceUpdate);
    return () => {
      events.onopen = null;
      events.removeEventListener('workspace-updated', handleWorkspaceUpdate);
      events.close();
    };
  }, [authUser?.id, syncWorkspace]);

  useEffect(() => {
    if (authUser?.role !== 'employee' || activeTab !== 'support') return;
    window.localStorage.setItem('salon-support-seen-' + authUser.id, String(Date.now()));
    setOpenSupportCount(0);
  }, [authUser, activeTab]);

  const handleSetupAdmin = async (payload: {
    name: string;
    username: string;
    email: string;
    password: string;
    role: 'admin' | 'superadmin';
  }) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = payload.role === 'superadmin' ? await salonApi.setupSuperadmin(payload) : await salonApi.setupAdmin(payload);
      setAuthUser(response.user);
      setSetupRequired(false);
      if (payload.role === 'admin') setAdminSetupRequired(false);
      if (payload.role === 'superadmin') setSuperadminSetupRequired(false);
      setLoading(true);
      navigatePath(pathForTab(response.user.role, defaultTabForRole(response.user.role)), true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to create administrator account.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogin = async (payload: {
    username: string;
    password: string;
    role: StaffRole;
  }) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await salonApi.login(payload);
      setAuthUser(response.user);
      setSetupRequired(false);
      setLoading(true);
      navigatePath(pathForTab(response.user.role, defaultTabForRole(response.user.role)), true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthError('');
    const role = authUser?.role;
    try {
      await salonApi.logout();
      setAuthUser(null);
      setData(null);
      navigatePath(role ? `/${role}/login` : '/');
      setLoading(true);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign out.');
    }
  };

  const handleAddToCart = (item: CatalogItem, overrideStylistId?: string) => {
    const defaultStylist =
      overrideStylistId || data?.stylists[0]?.id || '';
    setCart((prev) => {
      const existing = prev.find(
        (l) =>
          l.catalog_item_id === item.id &&
          l.stylist_id === defaultStylist
      );
      if (existing) {
        return prev.map((l) =>
          l.uid === existing.uid ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          uid: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          catalog_item_id: item.id,
          name: item.name,
          kind: item.kind,
          unit_price_ksh: item.price_ksh,
          quantity: 1,
          stylist_id: defaultStylist,
        },
      ];
    });
  };

  const handleSendToPos = (appointment: Appointment) => {
    const serviceItem = data?.catalog.find((c) => c.id === appointment.service_id);
    setPosClientId(appointment.client_id);
    setLinkedAppointmentId(appointment.id);
    setCart([
      {
        uid: `${appointment.service_id}-${Date.now()}`,
        catalog_item_id: appointment.service_id,
        name: appointment.service_name,
        kind: 'service',
        unit_price_ksh: serviceItem?.price_ksh ?? appointment.service_price_ksh,
        quantity: 1,
        stylist_id: appointment.stylist_id,
      },
    ]);
    navigateToTab('pos');
    showToast(`Loaded ${appointment.client_name}'s appointment into POS`);
  };

  const handleOpenPosForClient = (clientId: string) => {
    setPosClientId(clientId);
    setLinkedAppointmentId('');
    navigateToTab('pos');
  };

  const handleCreateAppointment = async (payload: {
    client_id: string;
    stylist_id: string;
    service_id: string;
    date: string;
    start_time: string;
    notes: string;
  }) => {
    await salonApi.createAppointment(payload);
    await refreshData(businessDate);
    showToast('Appointment booked');
  };

  const handleUpdateAppointment = async (
    id: string,
    payload: Partial<{
      stylist_id: string;
      service_id: string;
      date: string;
      start_time: string;
      duration_min: number;
      status: AppointmentStatus;
      notes: string;
    }>
  ) => {
    await salonApi.updateAppointment(id, payload);
    await refreshData(businessDate);
    showToast('Schedule updated');
  };

  const handleCreateClient = async (payload: {
    name: string;
    phone: string;
    email?: string;
    preferred_stylist_id?: string;
    formula_notes?: string;
  }) => {
    await salonApi.createClient(payload);
    await refreshData(businessDate);
    showToast('Client profile created');
  };

  const handleUpdateClient = async (
    id: string,
    payload: Partial<{
      name: string;
      phone: string;
      email: string;
      preferred_stylist_id: string;
      formula_notes: string;
    }>
  ) => {
    await salonApi.updateClient(id, payload);
    await refreshData(businessDate);
    showToast('Client profile updated');
  };

  const handleCreateCatalogItem = async (payload: {
    kind: 'service' | 'product';
    category: string;
    name: string;
    description: string;
    price_ksh: number;
    duration_min: number;
    stock_qty: number;
  }) => {
    await salonApi.createCatalogItem(payload);
    await refreshData(businessDate);
    showToast('Catalog updated');
  };

  const handleAdjustStock = async (id: string, stockDelta: number) => {
    await salonApi.updateCatalogItem(id, { stock_delta: stockDelta });
    await refreshData(businessDate);
    showToast('Stock adjusted');
  };

  const handleReportInventory = async (payload: { catalog_item_id: string; report_type: InventoryReportType; quantity: number; note: string }) => {
    await salonApi.createInventoryReport(payload);
    await refreshData(businessDate);
    showToast('Inventory report saved and shared with the administrator.');
  };

  const handleCheckout = async (payload: {
    client_id: string;
    client_name: string;
    appointment_id?: string;
    payment_method: PaymentMethod;
    transaction_reference: string;
    tip_ksh: number;
    tip_stylist_id: string;
    discount_type: 'none' | 'percent' | 'fixed';
    discount_value: number;
    tendered_ksh: number;
    business_date: string;
    items: Array<{ catalog_item_id: string; quantity: number; stylist_id: string }>;
  }): Promise<Ticket> => {
    const res = await salonApi.checkoutTicket(payload);
    setCart([]);
    setLinkedAppointmentId('');
    setPosClientId('');
    await refreshData(businessDate);
    showToast(`Settled ${res.ticket.ticket_number} (${formatKsh(res.ticket.total_ksh)})`);
    return res.ticket;
  };

  const handleVoidTicket = async (ticketId: string) => {
    await salonApi.voidTicket(ticketId);
    await refreshData(businessDate);
    showToast('Ticket voided and stock restored');
  };

  const routeRole = roleFromPath(currentPath);
  const isRoleSwitchLogin = Boolean(authUser && routeRole && routeRole !== authUser.role);
  const searchItems: Array<{ label: string; tab: WorkspaceTab }> = authUser?.role === 'employee'
    ? [
        { label: 'Staff Dashboard', tab: 'my-day' },
        { label: 'My Earnings', tab: 'earnings' },
        { label: 'My Appointments', tab: 'my-appointments' },
        { label: 'Services & Clients', tab: 'clients' },
        { label: 'Loyalty Points', tab: 'loyalty' },
        { label: 'Expenses', tab: 'expenses' },
        { label: 'Sales & Payments', tab: 'pos' },
        { label: 'Inventory', tab: 'inventory' },
        { label: 'My Profile', tab: 'profile' },
        { label: 'Notifications', tab: 'notifications' },
        { label: 'Reports', tab: 'reports' },
        { label: 'My Attendance', tab: 'timesheet' },
        { label: 'My Tasks', tab: 'tasks' },
        { label: 'Help & Support', tab: 'support' },
        { label: 'Schedule', tab: 'schedule' },
      ]
    : [
        { label: 'Dashboard', tab: 'dashboard' },
        ...(authUser?.role === 'superadmin' ? [{ label: 'Superadmin', tab: 'superadmin' as WorkspaceTab }] : []),
        { label: 'Notifications', tab: 'notifications' },
        { label: 'Clients', tab: 'clients' },
        { label: 'Loyalty Points', tab: 'loyalty' },
        { label: 'Expenses', tab: 'expenses' },
        { label: 'Employees', tab: 'employees' },
        { label: 'Services & Products', tab: 'catalog' },
        { label: 'Appointments', tab: 'schedule' },
        { label: 'Sales & Payments', tab: 'pos' },
        { label: 'Inventory', tab: 'inventory' },
        { label: 'Reports', tab: 'reports' },
        { label: 'Commission Payroll', tab: 'payroll' },
        { label: 'Staff Attendance', tab: 'attendance' },
        { label: 'Staff Tasks', tab: 'tasks' },
        { label: 'Settings', tab: 'settings' },
        { label: 'Support & Help', tab: 'support' },
      ];
  const matchedSearchItems = workspaceSearch.trim()
    ? searchItems.filter((item) => item.label.toLowerCase().includes(workspaceSearch.trim().toLowerCase()))
    : [];
  const employeeNotificationCount = (data?.employee_dashboard?.low_stock_items.length ?? 0)
    + (data?.appointments.filter((item) => ['Pending', 'Confirmed'].includes(item.status)).length ?? 0);
  const headerNotificationCount = (authUser?.role === 'employee' ? employeeNotificationCount : 0)
    + openSupportCount + unreadAnnouncementCount;
  const profileStylist = authUser?.stylist_id
    ? data?.stylists.find((stylist) => stylist.id === authUser.stylist_id)
    : undefined;

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
        <div className="salon-card w-full max-w-sm rounded-2xl p-8 text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-[#DFE7F1] border-t-[#0B5ED7] animate-spin" />
          <p className="mt-4 text-sm font-semibold text-[#667085]">Checking staff access…</p>
        </div>
      </div>
    );
  }

  if (authUser && !isRoleSwitchLogin && routeRole !== authUser.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
        <p className="text-sm font-semibold text-[#667085]">Opening your workspace…</p>
      </div>
    );
  }

  if (!authUser || isRoleSwitchLogin) {
    return (
      <AuthView
        role={roleFromPath(currentPath)}
        setupRequired={setupRequired}
        adminSetupRequired={adminSetupRequired}
        superadminSetupRequired={superadminSetupRequired}
        demoMode={demoMode}
        connectionError={authConnectionError}
        error={authError}
        busy={authBusy}
        onSetup={handleSetupAdmin}
        onLogin={handleLogin}
        onNavigate={(path) => navigatePath(path)}
        onRetry={() => void checkAuthStatus()}
      />
    );
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex bg-transparent">
        <div className="hidden md:block w-[248px] beauty-sidebar shrink-0" />
        <main className="flex-1 p-6 md:p-10 space-y-6">
          <div className="h-36 rounded-3xl skeleton-shimmer" />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 rounded-2xl skeleton-shimmer" />
            ))}
          </div>
          <div className="h-[420px] rounded-2xl skeleton-shimmer" />
        </main>
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
        <div className="salon-card rounded-2xl max-w-md w-full p-6 text-center space-y-4">
          <h1 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
            Royal Saloon Unavailable
          </h1>
          <p className="text-sm text-[#667085]">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void refreshData(businessDate);
            }}
            className="h-11 px-5 rounded-lg bg-[#6D28D9] text-white text-sm font-semibold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen flex bg-transparent text-[#14213D]">
      <SidebarRail
        activeTab={activeTab}
        businessName={data.business_settings.business_name}
        onSelectTab={navigateToTab}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        cartCount={cart.reduce((sum, line) => sum + line.quantity, 0)}
        lowStockCount={authUser.role === 'employee'
          ? (data.employee_dashboard?.low_stock_items.length ?? 0)
          : data.analytics.low_stock_count}
        supportRequestCount={openSupportCount}
        notificationCount={unreadAnnouncementCount}
        user={authUser}
        onLogout={() => void handleLogout()}
      />

      <main className="min-h-screen min-w-0 flex-1 bg-transparent p-3 pb-4 sm:p-4 md:pb-6 lg:p-4">
        <div className="workspace-content mx-auto max-w-[1440px]">
          {demoMode && (
            <p className="no-print mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">
              Demo data environment. Do not enter real customer information.
            </p>
          )}
          <div className="no-print mb-3 flex items-center gap-2 rounded-2xl border border-[#D8E4F2] bg-white/95 px-2 py-2 shadow-[0_12px_30px_-24px_rgba(15,42,84,0.16)] sm:px-3">
            <button type="button" aria-label="Open navigation" aria-expanded={mobileMenuOpen} onClick={() => {
              if (window.matchMedia('(max-width: 767px)').matches) setMobileMenuOpen((open) => !open);
              else setRailCollapsed((value) => !value);
            }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#071B53] hover:bg-[#EFF4FF]">
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#344E91]" />
              <input
                aria-label="Search workspace"
                value={workspaceSearch}
                onChange={(event) => setWorkspaceSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && matchedSearchItems[0]) {
                    navigateToTab(matchedSearchItems[0].tab);
                    setWorkspaceSearch('');
                  }
                  if (event.key === 'Escape') setWorkspaceSearch('');
                }}
                placeholder="Search anything..."
                className="h-11 w-full rounded-full border border-[#D8DFFA] bg-[#F5F6FF] pl-12 pr-4 text-sm text-[#14213D] outline-none placeholder:text-[#475F9F] focus:border-[#8FA8F5] focus:ring-2 focus:ring-[#DCE5FF]"
              />
              {matchedSearchItems.length > 0 && (
                <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-[#DDE6F1] bg-white py-1 shadow-xl">
                  {matchedSearchItems.slice(0, 6).map((item) => (
                    <button key={item.tab} type="button" onClick={() => { navigateToTab(item.tab); setWorkspaceSearch(''); }} className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-[#14213D] hover:bg-[#EFF4FF]">
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" aria-label="Open notifications" onClick={() => navigateToTab('notifications')} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#071B53] hover:bg-[#EFF4FF]">
              <Bell className="h-6 w-6" />
              {headerNotificationCount > 0 && <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F42F43] px-1 text-[10px] font-bold text-white">{headerNotificationCount > 9 ? '9+' : headerNotificationCount}</span>}
            </button>
            <div className="relative">
              <button type="button" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-xl p-1.5 text-left hover:bg-[#F3F6FD]">
                {profileStylist?.avatar_url ? <img src={profileStylist.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F1FF] text-sm font-bold text-[#0757D8]">{authUser.name.slice(0, 1).toUpperCase()}</span>}
                <span className="hidden min-w-0 sm:block"><span className="block max-w-36 truncate text-xs font-bold text-[#14213D]">{authUser.name}</span><span className="block text-[10px] text-[#475467]">{authUser.role === 'employee' ? (profileStylist?.role || 'Stylist') : authUser.role === 'superadmin' ? 'Superadmin' : 'Owner / Admin'}</span></span>
                <ChevronDown className="hidden h-4 w-4 text-[#071B53] sm:block" />
              </button>
              {profileMenuOpen && <div className="absolute right-0 top-14 z-50 w-48 rounded-xl border border-[#DDE6F1] bg-white p-1 shadow-xl">
                {authUser.role === 'employee' && <button type="button" onClick={() => { navigateToTab('profile'); setProfileMenuOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#14213D] hover:bg-[#EFF4FF]">My Profile</button>}
                {isAdminRole(authUser.role) && <button type="button" onClick={() => { navigateToTab('settings'); setProfileMenuOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#14213D] hover:bg-[#EFF4FF]">Settings</button>}
                <button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Sign out</button>
              </div>}
            </div>
            <div className="hidden items-center gap-2 border-l border-[#E1E7F0] pl-3 text-xs font-semibold text-[#475467] lg:flex">
              <CalendarDays className="h-4 w-4 text-[#2563EB]" />{formatReadableDate(businessDate)}
            </div>
          </div>
          {activeTab === 'dashboard' && isAdminRole(authUser.role) && (
            <AdminDashboardView
              userName={authUser.name}
              date={businessDate}
              data={data}
              onNavigate={navigateToTab}
            />
          )}
          {activeTab === 'my-day' && authUser.role === 'employee' && (
            <WorkspaceHomeView
              user={authUser}
              date={businessDate}
              appointments={data.appointments}
              stylists={data.stylists}
              catalog={data.catalog}
              dashboard={data.employee_dashboard}
              onNavigate={navigateToTab}
            />
          )}
          {authUser.role === 'employee' && [
            'earnings',
            'my-appointments',
            'my-clients',
            'profile',
            'inventory',
            'reports',
            'clients',
          ].includes(activeTab) && (
            <EmployeePages
              tab={activeTab}
              appointments={data.appointments}
              clients={data.clients}
              catalog={data.catalog}
              stylists={data.stylists}
              user={authUser}
              dashboard={data.employee_dashboard}
              date={businessDate}
              onNavigate={navigateToTab}
              onUpdateAppointment={handleUpdateAppointment}
              onOpenPosForClient={handleOpenPosForClient}
              onProfileUpdated={handleProfileUpdated}
              onReportInventory={handleReportInventory}
            />
          )}
          {activeTab === 'notifications' && <NotificationsView user={authUser} appointments={data.appointments} dashboard={data.employee_dashboard} />}
          {activeTab === 'superadmin' && authUser.role === 'superadmin' && <SuperadminView onNavigate={navigateToTab} />}
          {activeTab === 'loyalty' && <LoyaltyView clients={data.clients} />}
          {activeTab === 'expenses' && <ExpensesView />}
          {activeTab === 'timesheet' && authUser.role === 'employee' && <EmployeeAttendanceView openingTime={data.business_settings.opening_time} />}
          {activeTab === 'attendance' && isAdminRole(authUser.role) && <AttendanceView openingTime={data.business_settings.opening_time} />}
          {activeTab === 'tasks' && <TasksView user={authUser} />}
          {activeTab === 'payroll' && isAdminRole(authUser.role) && <PayrollView />}
          {activeTab === 'schedule' && (
            <ScheduleView
              date={businessDate}
              openingTime={data.business_settings.opening_time}
              closingTime={data.business_settings.closing_time}
              onChangeDate={setBusinessDate}
              stylists={data.stylists}
              employeeStylistId={authUser.role === 'employee' ? authUser.stylist_id : undefined}
              appointments={data.appointments}
              clients={data.clients}
              catalog={data.catalog}
              onCreateAppointment={handleCreateAppointment}
              onUpdateAppointment={handleUpdateAppointment}
              onSendToPos={handleSendToPos}
              onOpenWalkInPos={() => {
                if (cart.length > 0) {
                  showToast('A ticket is already open. Clear it before starting a walk-in.');
                  navigateToTab('pos');
                  return;
                }
                setPosClientId('');
                setLinkedAppointmentId('');
                navigateToTab('pos');
              }}
              showFinancials={false}
              grossRevenueKsh={0}
            />
          )}

          {activeTab === 'employees' && isAdminRole(authUser.role) && (
            <EmployeesView onNotify={showToast} demoMode={demoMode} stylists={data.stylists} />
          )}

          {activeTab === 'pos' && (
            <PosView
              catalog={data.catalog}
              clients={data.clients}
              stylists={data.stylists}
              cart={cart}
              selectedClientId={posClientId}
              linkedAppointmentId={linkedAppointmentId}
              businessDate={businessDate}
              onSelectClient={setPosClientId}
              onAddToCart={(item) => handleAddToCart(item)}
              onUpdateLineQty={(uid, delta) => {
                setCart((prev) =>
                  prev
                    .map((l) =>
                      l.uid === uid ? { ...l, quantity: l.quantity + delta } : l
                    )
                    .filter((l) => l.quantity > 0)
                );
              }}
              onUpdateLineStylist={(uid, stylistId) => {
                setCart((prev) =>
                  prev.map((l) => (l.uid === uid ? { ...l, stylist_id: stylistId } : l))
                );
              }}
              onRemoveLine={(uid) => {
                setCart((prev) => prev.filter((l) => l.uid !== uid));
              }}
              onClearCart={() => {
                setCart([]);
                setLinkedAppointmentId('');
              }}
              onCheckout={handleCheckout}
            />
          )}

          {activeTab === 'clients' && isAdminRole(authUser.role) && (
            <ClientsView
              clients={data.clients}
              stylists={data.stylists}
              onCreateClient={handleCreateClient}
              onUpdateClient={handleUpdateClient}
              onOpenPosForClient={handleOpenPosForClient}
              showFinancials={isAdminRole(authUser.role)}
            />
          )}

          {activeTab === 'catalog' && isAdminRole(authUser.role) && (
            <CatalogView
              key={activeTab}
              initialTab="service"
              catalog={data.catalog}
              onCreateItem={handleCreateCatalogItem}
              onAdjustStock={handleAdjustStock}
            />
          )}
          {activeTab === 'inventory' && isAdminRole(authUser.role) && (
            <>
              <CatalogView
                key={activeTab}
                initialTab="product"
                catalog={data.catalog}
                onCreateItem={handleCreateCatalogItem}
                onAdjustStock={handleAdjustStock}
              />
              <InventoryReportsView />
            </>
          )}
          {activeTab === 'reports' && isAdminRole(authUser.role) && (
            <LedgerView
              date={businessDate}
              analytics={data.analytics}
              tickets={data.tickets}
              onVoidTicket={handleVoidTicket}
            />
          )}
          {(activeTab === 'settings' ||
            activeTab === 'system-logs' ||
            activeTab === 'backups') && isAdminRole(authUser.role) && (
            <SystemPages
              tab={activeTab}
              user={authUser}
              date={businessDate}
              demoMode={demoMode}
              businessSettings={data.business_settings}
              onBusinessSettingsSaved={handleBusinessSettingsSaved}
            />
          )}
          {activeTab === 'support' && (
            <SystemPages
              tab={activeTab}
              user={authUser}
              date={businessDate}
              demoMode={demoMode}
              businessSettings={data.business_settings}
              onBusinessSettingsSaved={handleBusinessSettingsSaved}
            />
          )}

        </div>
      </main>

      {toast && (
        <div
          role="status"
          className="beauty-toast no-print fixed bottom-20 md:bottom-6 right-4 left-4 md:left-auto z-50 rounded-xl bg-[#071A34] text-white px-4 py-3 text-xs font-semibold shadow-[0_16px_32px_-12px_rgba(7,26,52,0.38)] border border-[#B7D2FF]/20 md:max-w-sm"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
