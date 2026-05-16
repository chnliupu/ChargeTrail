import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { formatTopBarDate } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar';

type NavItem = {
  to: string;
  label: string;
  icon: IconName;
};

type AvatarMenuItem =
  | {
      type: 'link';
      to: string;
      label: string;
      icon: IconName;
      adminOnly?: boolean;
    }
  | {
      type: 'action';
      action: 'signOut';
      label: string;
      icon: IconName;
    };

const NAV_ITEMS: NavItem[] = [
  { to: '/connectors', label: 'Connectors', icon: 'connector' },
  { to: '/data', label: 'Data', icon: 'data' },
  { to: '/summary', label: 'Summary', icon: 'summary' },
];

const AVATAR_MENU_ITEMS: AvatarMenuItem[] = [
  {
    type: 'link',
    to: '/admin/settings',
    label: 'Admin settings',
    icon: 'admin',
    adminOnly: true,
  },
  { type: 'link', to: '/settings', label: 'Settings', icon: 'settings' },
  {
    type: 'action',
    action: 'signOut',
    label: 'Sign out',
    icon: 'logout',
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/connectors': 'Connectors',
  '/data': 'Charging Sessions',
  '/summary': 'Summary',
  '/settings': 'Settings',
  '/admin/settings': 'Admin settings',
};

function AppSidebar() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const userLabel = user?.name ?? user?.email ?? t('Account');

  // Auto-close the mobile sidebar after navigating to a new route so the
  // newly rendered page is fully visible without an extra tap.
  const previousPathnameRef = useRef(location.pathname);
  useEffect(() => {
    if (previousPathnameRef.current !== location.pathname) {
      previousPathnameRef.current = location.pathname;
      if (isMobile) {
        setOpenMobile(false);
      }
    }
  }, [location.pathname, isMobile, setOpenMobile]);
  const isAvatarMenuRoute = AVATAR_MENU_ITEMS.some(
    (item) => item.type === 'link' && location.pathname === item.to,
  );
  const visibleAvatarMenuItems = AVATAR_MENU_ITEMS.filter(
    (item) =>
      item.type === 'action' || !item.adminOnly || user?.role === 'admin',
  );

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="px-3 py-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-primary/30 bg-logo-tile text-primary group-data-[collapsible=icon]:hidden">
            <Icon name="bolt" size={17} />
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-[15px] font-bold leading-tight">
              ChargeTrail
            </div>
            <div className="truncate text-[11px] text-text-muted">
              {t('EV charging dashboard')}
            </div>
          </div>
          <SidebarTrigger
            aria-label={t('Toggle sidebar panel')}
            className="ml-auto size-7 shrink-0 text-text-muted hover:bg-card-hover hover:text-text group-data-[collapsible=icon]:ml-0"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 pt-3 group-data-[collapsible=icon]:px-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.to;
                const label = t(item.label);

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={label}
                      className="h-10 gap-3 px-3 text-[13px] font-medium text-text-muted hover:bg-card-hover hover:text-text data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                    >
                      <NavLink to={item.to}>
                        <Icon name={item.icon} size={16} />
                        <span className="flex-1 group-data-[collapsible=icon]:hidden">
                          {label}
                        </span>
                        {isActive ? (
                          <span className="size-[5px] rounded-full bg-primary group-data-[collapsible=icon]:hidden" />
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <SidebarMenu>
          {user ? (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('Open account menu')}
                    data-sidebar="menu-button"
                    data-size="lg"
                    data-active={isAvatarMenuRoute}
                    className="peer/menu-button flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2.5 py-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] hover:bg-card-hover focus-visible:ring-2 data-[active=true]:bg-primary/10 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
                  >
                    <Avatar className="size-[30px] border border-border">
                      <AvatarImage
                        src={user.image ?? undefined}
                        alt={user.name ?? user.email}
                      />
                      <AvatarFallback className="bg-logo-tile text-[12px] font-bold text-primary">
                        {(user.name ?? user.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                      <span className="block truncate text-[12px] font-semibold text-text">
                        {user.name ?? user.email}
                      </span>
                      {user.username ? (
                        <span className="block truncate text-[10px] text-text-muted">
                          @{user.username}
                        </span>
                      ) : user.name ? (
                        <span className="block truncate text-[10px] text-text-muted">
                          {user.email}
                        </span>
                      ) : null}
                    </span>
                    <Icon
                      name="chevronsUpDown"
                      size={14}
                      className="ml-auto text-text-dim group-data-[collapsible=icon]:hidden"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side={isMobile ? 'bottom' : 'right'}
                  align="end"
                  sideOffset={8}
                  className="w-56"
                >
                  <DropdownMenuLabel>{userLabel}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {visibleAvatarMenuItems.map((item) =>
                    item.type === 'link' ? (
                      <DropdownMenuItem key={item.to} asChild>
                        <NavLink to={item.to}>
                          <Icon name={item.icon} size={14} />
                          <span>{t(item.label)}</span>
                        </NavLink>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        key={item.action}
                        onSelect={() => void signOut()}
                      >
                        <Icon name={item.icon} size={14} />
                        <span>{t(item.label)}</span>
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const title = t(PAGE_TITLES[location.pathname] ?? 'ChargeTrail');
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    // `sticky top-0` keeps the bar pinned to the top of the scroll
    // container so the sidebar trigger stays reachable on long pages.
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-bg px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger
          aria-label={t('Toggle sidebar')}
          className="-ml-1 text-text-muted hover:bg-card-hover hover:text-text md:hidden"
        />
        <h1 className="truncate text-[15px] font-semibold text-text sm:text-[17px]">
          {title}
        </h1>
      </div>
      <div className="hidden shrink-0 text-xs text-text-muted sm:block">
        {formatTopBarDate(new Date(), locale)}
      </div>
    </header>
  );
}

/**
 * Renders the authenticated application frame with shared navigation chrome.
 */
export function AppShell() {
  const location = useLocation();

  // Reset window scroll on route change so navigating between pages always
  // starts at the top — the page (window) is the scroll container.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': '15rem',
          '--sidebar-width-mobile': '15rem',
        } as CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-bg text-text">
        {/* TopBar uses `sticky top-0` and the page itself is the scroll
            container (SidebarProvider sets `min-h-svh`, not a bounded
            height), so the bar pins to the viewport top on long pages. */}
        <TopBar />
        <div className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
