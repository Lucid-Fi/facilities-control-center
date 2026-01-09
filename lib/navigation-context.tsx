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
  loanBookAddress: string;
  setFacilityAddress: (address: string) => void;
  setModuleAddress: (address: string) => void;
  setLoanBookAddress: (address: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  buildNavUrl: (href: string) => string;
}

const NavigationContext = createContext<NavigationContextType | undefined>(
  undefined
);

const STORAGE_KEYS = {
  FACILITY_ADDRESS: "facility-control-center:facility-address",
  MODULE_ADDRESS: "facility-control-center:module-address",
  LOAN_BOOK_ADDRESS: "facility-control-center:loan-book-address",
  SIDEBAR_COLLAPSED: "facility-control-center:sidebar-collapsed",
};

// Routes that need facility param
const FACILITY_ROUTES = [
  "/capital-call",
  "/waterfall",
  "/funding-requests",
  "/token-exchange",
  "/facility-upsize",
];

// Routes that need loan_book param
const LOAN_BOOK_ROUTES = ["/offer-loan"];

// Routes that only need module param
const MODULE_ONLY_ROUTES = ["/repay-loan"];

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [facilityAddress, setFacilityAddressState] = useState("");
  const [moduleAddress, setModuleAddressState] = useState("");
  const [loanBookAddress, setLoanBookAddressState] = useState("");
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedFacility = localStorage.getItem(STORAGE_KEYS.FACILITY_ADDRESS);
    const storedModule = localStorage.getItem(STORAGE_KEYS.MODULE_ADDRESS);
    const storedLoanBook = localStorage.getItem(STORAGE_KEYS.LOAN_BOOK_ADDRESS);
    const storedCollapsed = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);

    if (storedFacility) setFacilityAddressState(storedFacility);
    if (storedModule) setModuleAddressState(storedModule);
    if (storedLoanBook) setLoanBookAddressState(storedLoanBook);
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

  const setLoanBookAddress = useCallback((address: string) => {
    setLoanBookAddressState(address);
    localStorage.setItem(STORAGE_KEYS.LOAN_BOOK_ADDRESS, address);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(collapsed));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  // Build navigation URL with appropriate query params based on route
  const buildNavUrl = useCallback(
    (href: string) => {
      const params = new URLSearchParams();

      // Check which params this route needs
      const needsFacility = FACILITY_ROUTES.some((route) =>
        href.startsWith(route)
      );
      const needsLoanBook = LOAN_BOOK_ROUTES.some((route) =>
        href.startsWith(route)
      );
      const needsModuleOnly = MODULE_ONLY_ROUTES.some((route) =>
        href.startsWith(route)
      );

      // Add module param if we have it and the route needs params
      if (moduleAddress && (needsFacility || needsLoanBook || needsModuleOnly)) {
        params.set("module", moduleAddress);
      }

      // Add facility param for facility routes
      if (needsFacility && facilityAddress) {
        params.set("facility", facilityAddress);
      }

      // Add loan_book param for loan book routes
      if (needsLoanBook && loanBookAddress) {
        params.set("loan_book", loanBookAddress);
      }

      const queryString = params.toString();
      return queryString ? `${href}?${queryString}` : href;
    },
    [facilityAddress, moduleAddress, loanBookAddress]
  );

  // Prevent hydration mismatch by not rendering until hydrated
  if (!isHydrated) {
    return null;
  }

  return (
    <NavigationContext.Provider
      value={{
        facilityAddress,
        moduleAddress,
        loanBookAddress,
        setFacilityAddress,
        setModuleAddress,
        setLoanBookAddress,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        buildNavUrl,
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
