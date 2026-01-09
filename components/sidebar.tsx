"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Wallet,
  Droplets,
  FileText,
  HandCoins,
  Receipt,
  ArrowLeftRight,
  TrendingUp,
  Database,
  Building2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/lib/navigation-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: Home,
        description: "Main control center",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Capital Call",
        href: "/capital-call",
        icon: Wallet,
        description: "Capital call & recycle management",
      },
      {
        label: "Waterfall",
        href: "/waterfall",
        icon: Droplets,
        description: "Interest & principal distribution",
      },
      {
        label: "Funding Requests",
        href: "/funding-requests",
        icon: FileText,
        description: "Manage funding requests",
      },
    ],
  },
  {
    label: "Loans",
    items: [
      {
        label: "Offer Loan",
        href: "/offer-loan",
        icon: HandCoins,
        description: "Create new loan offers",
      },
      {
        label: "Repay Loan",
        href: "/repay-loan",
        icon: Receipt,
        description: "Process loan repayments",
      },
    ],
  },
  {
    label: "Exchange",
    items: [
      {
        label: "Token Exchange",
        href: "/token-exchange",
        icon: ArrowLeftRight,
        description: "Exchange tokens",
      },
      {
        label: "Facility Upsize",
        href: "/facility-upsize",
        icon: TrendingUp,
        description: "Upsize facility capacity",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        label: "Staged Loan Books",
        href: "/admin/staged-loan-books",
        icon: Database,
        description: "Manage staged loan books",
      },
    ],
  },
];

function NavItemLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive &&
          "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-sidebar-primary")} />
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.15 }}
            className="text-sm whitespace-nowrap overflow-hidden"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col gap-1">
          <span className="font-medium">{item.label}</span>
          {item.description && (
            <span className="text-xs text-muted-foreground">
              {item.description}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

function NavGroupComponent({
  group,
  collapsed,
  pathname,
}: {
  group: NavGroup;
  collapsed: boolean;
  pathname: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="mb-2">
      {!collapsed && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
            "text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          )}
        >
          <span>{group.label}</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              !isExpanded && "-rotate-90"
            )}
          />
        </button>
      )}
      <AnimatePresence initial={false}>
        {(isExpanded || collapsed) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn("space-y-0.5", collapsed && "mt-2")}>
              {group.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    isActive={isActive}
                    collapsed={collapsed}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {collapsed && <div className="h-px bg-sidebar-border my-2" />}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, facilityAddress } = useNavigation();

  return (
    <TooltipProvider>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 60 : 240 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={cn(
          "h-screen sticky top-0 flex flex-col",
          "bg-sidebar border-r border-sidebar-border",
          "text-sidebar-foreground"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-4 border-b border-sidebar-border",
            sidebarCollapsed && "justify-center px-2"
          )}
        >
          <Building2 className="h-6 w-6 text-sidebar-primary shrink-0" />
          <AnimatePresence mode="wait">
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <h1 className="font-semibold text-sm whitespace-nowrap">
                  Control Center
                </h1>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Facility Address Display */}
        {facilityAddress && (
          <div
            className={cn(
              "px-3 py-2 border-b border-sidebar-border",
              sidebarCollapsed && "px-2"
            )}
          >
            {sidebarCollapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-mono">
                    {facilityAddress.slice(2, 4)}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      Facility
                    </span>
                    <span className="font-mono text-xs">{facilityAddress}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-sidebar-foreground/60 uppercase tracking-wider">
                  Facility
                </span>
                <span className="font-mono text-xs truncate">
                  {facilityAddress.slice(0, 8)}...{facilityAddress.slice(-6)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navigationGroups.map((group) => (
            <NavGroupComponent
              key={group.label}
              group={group}
              collapsed={sidebarCollapsed}
              pathname={pathname}
            />
          ))}
        </nav>

        {/* Keyboard Shortcut Hint */}
        <AnimatePresence mode="wait">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="px-3 py-2 border-t border-sidebar-border"
            >
              <div className="flex items-center gap-2 text-xs text-sidebar-foreground/50">
                <kbd className="px-1.5 py-0.5 bg-sidebar-accent rounded text-[10px] font-mono">
                  Cmd+K
                </kbd>
                <span>Quick actions</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse Toggle */}
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn(
              "w-full justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground",
              "hover:bg-sidebar-accent"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
