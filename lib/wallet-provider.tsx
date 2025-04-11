"use client";

import { ReactNode } from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create a client
const queryClient = new QueryClient();

export default function WalletContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider
        optInWallets={[
          "Petra",
          "Continue with Apple",
          "Continue with Google",
          "Pontem Wallet",
        ]}
        autoConnect={true}
      >
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}
