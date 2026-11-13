import { LayoutDashboard, BarChart3, Mail, ClipboardPaste, ClipboardList, PenLine } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/job-tracker", label: "Job Tracker", icon: ClipboardList },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/drafter", label: "Drafter", icon: PenLine },
  { href: "/add-job", label: "Add Job", icon: ClipboardPaste },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function visibleNavItems(_followupsEnabled?: boolean): NavItem[] {
  return NAV_ITEMS;
}

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
