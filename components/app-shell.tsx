"use client";

import { ReactNode, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { NavigationProvider, useNavigation } from "@/lib/navigation-context";

function AppShellContent({ children }: { children: ReactNode }) {
  const { toggleSidebar } = useNavigation();

  // Keyboard shortcut to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + \ to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NavigationProvider>
      <AppShellContent>{children}</AppShellContent>
    </NavigationProvider>
  );
}
