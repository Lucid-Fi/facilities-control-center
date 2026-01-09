"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

interface NavigationContextType {
  facilityAddress: string;
  moduleAddress: string;
  setFacilityAddress: (address: string) => void;
  setModuleAddress: (address: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined
);

const STORAGE_KEYS = {
  FACILITY_ADDRESS: "facility-control-center:facility-address",
  MODULE_ADDRESS: "facility-control-center:module-address",
  SIDEBAR_COLLAPSED: "facility-control-center:sidebar-collapsed",
};

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [facilityAddress, setFacilityAddressState] = useState("");
  const [moduleAddress, setModuleAddressState] = useState("");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedFacility = localStorage.getItem(STORAGE_KEYS.FACILITY_ADDRESS);
    const storedModule = localStorage.getItem(STORAGE_KEYS.MODULE_ADDRESS);
    const storedCollapsed = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);

    if (storedFacility) setFacilityAddressState(storedFacility);
    if (storedModule) setModuleAddressState(storedModule);
    if (storedCollapsed) setSidebarCollapsedState(storedCollapsed === "true");

    setIsHydrated(true);
  }, []);

  const setFacilityAddress = useCallback((address: string) => {
    setFacilityAddressState(address);
    localStorage.setItem(STORAGE_KEYS.FACILITY_ADDRESS, address);
  }, []);

  const setModuleAddress = useCallback((address: string) => {
    setModuleAddressState(address);
    localStorage.setItem(STORAGE_KEYS.MODULE_ADDRESS, address);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(collapsed));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  // Prevent hydration mismatch by not rendering until hydrated
  if (!isHydrated) {
    return null;
  }

  return (
    <NavigationContext.Provider
      value={{
        facilityAddress,
        moduleAddress,
        setFacilityAddress,
        setModuleAddress,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return context;
}
