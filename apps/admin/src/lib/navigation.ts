import {
  Banknote,
  Building2,
  CalendarClock,
  CalendarDays,
  Car,
  ChartColumn,
  Clock,
  FileText,
  GraduationCap,
  Hourglass,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  Receipt,
  ScrollText,
  Send,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import { hasPermission, type Permission } from './permissions';

export type NavTarget =
  | '/'
  | '/calendar'
  | '/students'
  | '/leads'
  | '/instructors'
  | '/waiting-list'
  | '/slot-offers'
  | '/inbox'
  | '/invoices'
  | '/payments'
  | '/reports'
  | '/settings'
  | '/branches'
  | '/vehicles'
  | '/staff'
  | '/lesson-types'
  | '/price-items'
  | '/platform-statements'
  | '/audit-log';

export type NavLabelKey =
  | 'nav.dashboard'
  | 'nav.calendar'
  | 'nav.students'
  | 'nav.leads'
  | 'nav.availability'
  | 'nav.waitingList'
  | 'nav.slotOffers'
  | 'nav.inbox'
  | 'nav.invoices'
  | 'nav.payments'
  | 'nav.reports'
  | 'nav.settings'
  | 'nav.branches'
  | 'nav.vehicles'
  | 'nav.staff'
  | 'nav.lessonTypes'
  | 'nav.priceItems'
  | 'nav.platformStatements'
  | 'nav.auditLog';

export interface NavItem {
  to: NavTarget;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  anyOf: readonly Permission[];
  /** A plan feature the item needs, for example `enrolment_page`. */
  feature?: string;
}

export const ENROLMENT_PAGE_FEATURE = 'enrolment_page';

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, anyOf: [] },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays, anyOf: ['calendar.read'] },
  { to: '/students', labelKey: 'nav.students', icon: GraduationCap, anyOf: ['students.read'] },
  {
    to: '/leads',
    labelKey: 'nav.leads',
    icon: Inbox,
    anyOf: ['leads.read'],
    feature: ENROLMENT_PAGE_FEATURE,
  },
  {
    to: '/instructors',
    labelKey: 'nav.availability',
    icon: CalendarClock,
    anyOf: ['availability.manage'],
  },
  {
    to: '/waiting-list',
    labelKey: 'nav.waitingList',
    icon: Hourglass,
    anyOf: ['waiting_list.manage'],
  },
  { to: '/slot-offers', labelKey: 'nav.slotOffers', icon: Send, anyOf: ['slot_offers.manage'] },
  {
    to: '/inbox',
    labelKey: 'nav.inbox',
    icon: MessagesSquare,
    anyOf: ['chat.read_all', 'chat.use'],
  },
  { to: '/invoices', labelKey: 'nav.invoices', icon: Receipt, anyOf: ['invoices.read'] },
  {
    to: '/payments',
    labelKey: 'nav.payments',
    icon: Banknote,
    anyOf: ['payments.cash.record'],
  },
  { to: '/reports', labelKey: 'nav.reports', icon: ChartColumn, anyOf: ['reports.read'] },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, anyOf: ['settings.manage'] },
  { to: '/branches', labelKey: 'nav.branches', icon: Building2, anyOf: ['school.read'] },
  { to: '/vehicles', labelKey: 'nav.vehicles', icon: Car, anyOf: ['school.read'] },
  { to: '/staff', labelKey: 'nav.staff', icon: Users, anyOf: ['staff.read'] },
  {
    to: '/lesson-types',
    labelKey: 'nav.lessonTypes',
    icon: Clock,
    anyOf: ['lesson_types.manage', 'calendar.read'],
  },
  { to: '/price-items', labelKey: 'nav.priceItems', icon: Tag, anyOf: ['prices.manage'] },
  {
    to: '/platform-statements',
    labelKey: 'nav.platformStatements',
    icon: FileText,
    anyOf: ['platform_statements.read'],
  },
  { to: '/audit-log', labelKey: 'nav.auditLog', icon: ScrollText, anyOf: ['audit_log.read'] },
];

export function visibleNavItems(
  permissions: ReadonlySet<Permission>,
  features: ReadonlySet<string>,
): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      hasPermission(permissions, item.anyOf) &&
      (item.feature === undefined || features.has(item.feature)),
  );
}
