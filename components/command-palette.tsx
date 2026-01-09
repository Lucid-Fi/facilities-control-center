"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Home,
  Wallet,
  Droplets,
  FileText,
  HandCoins,
  Receipt,
  ArrowLeftRight,
  TrendingUp,
  Database,
  ArrowRight,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/lib/navigation-context";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface CommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
  category: string;
  keywords?: string[];
}

const commands: CommandItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Go to the main control center",
    icon: Home,
    href: "/",
    category: "Navigation",
    keywords: ["home", "main", "overview"],
  },
  {
    id: "capital-call",
    label: "Capital Call",
    description: "Capital call & recycle management",
    icon: Wallet,
    href: "/capital-call",
    category: "Operations",
    keywords: ["capital", "call", "recycle", "funding"],
  },
  {
    id: "waterfall",
    label: "Waterfall",
    description: "Interest & principal distribution",
    icon: Droplets,
    href: "/waterfall",
    category: "Operations",
    keywords: ["waterfall", "interest", "principal", "distribution"],
  },
  {
    id: "funding-requests",
    label: "Funding Requests",
    description: "Manage funding requests",
    icon: FileText,
    href: "/funding-requests",
    category: "Operations",
    keywords: ["funding", "requests", "manage"],
  },
  {
    id: "offer-loan",
    label: "Offer Loan",
    description: "Create new loan offers",
    icon: HandCoins,
    href: "/offer-loan",
    category: "Loans",
    keywords: ["offer", "loan", "create", "new"],
  },
  {
    id: "repay-loan",
    label: "Repay Loan",
    description: "Process loan repayments",
    icon: Receipt,
    href: "/repay-loan",
    category: "Loans",
    keywords: ["repay", "loan", "payment", "process"],
  },
  {
    id: "token-exchange",
    label: "Token Exchange",
    description: "Exchange tokens",
    icon: ArrowLeftRight,
    href: "/token-exchange",
    category: "Exchange",
    keywords: ["token", "exchange", "swap", "convert"],
  },
  {
    id: "facility-upsize",
    label: "Facility Upsize",
    description: "Upsize facility capacity",
    icon: TrendingUp,
    href: "/facility-upsize",
    category: "Exchange",
    keywords: ["facility", "upsize", "capacity", "increase"],
  },
  {
    id: "staged-loan-books",
    label: "Staged Loan Books",
    description: "Manage staged loan books",
    icon: Database,
    href: "/admin/staged-loan-books",
    category: "Admin",
    keywords: ["staged", "loan", "books", "admin", "manage"],
  },
];

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Check if query words are found in text
  const queryWords = lowerQuery.split(/\s+/);
  return queryWords.every((word) => lowerText.includes(word));
}

function CommandItemComponent({
  item,
  isSelected,
  onSelect,
  onHover,
}: {
  item: CommandItem;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-md",
          isSelected ? "bg-primary/10" : "bg-muted"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {item.description}
        </div>
      </div>
      {isSelected && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const { buildNavUrl } = useNavigation();

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    return commands.filter((cmd) => {
      const searchText = [
        cmd.label,
        cmd.description,
        cmd.category,
        ...(cmd.keywords || []),
      ].join(" ");
      return fuzzyMatch(searchText, query);
    });
  }, [query]);

  // Group filtered commands by category
  const groupedCommands = useMemo(() => {
    const groups: { [key: string]: CommandItem[] } = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const executeCommand = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      setQuery("");
      if (item.href) {
        router.push(buildNavUrl(item.href));
      } else if (item.action) {
        item.action();
      }
    },
    [router, buildNavUrl]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredCommands.length - 1)
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          const selected = filteredCommands[selectedIndex];
          if (selected) {
            executeCommand(selected);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [filteredCommands, selectedIndex, executeCommand]
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  let flatIndex = 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="p-0 gap-0 max-w-xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          <AnimatePresence mode="wait">
            {filteredCommands.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No results found for &quot;{query}&quot;
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {Object.entries(groupedCommands).map(([category, items]) => (
                  <div key={category} className="mb-2">
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {category}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((item) => {
                        const currentIndex = flatIndex++;
                        return (
                          <CommandItemComponent
                            key={item.id}
                            item={item}
                            isSelected={currentIndex === selectedIndex}
                            onSelect={() => executeCommand(item)}
                            onHover={() => setSelectedIndex(currentIndex)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
                ↵
              </kbd>
              Select
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Command className="h-3 w-3" />
            <span>+</span>
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
              K
            </kbd>
            <span>to toggle</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
