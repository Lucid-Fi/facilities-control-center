"use client";

import { ReactNode } from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";

export default function WalletContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
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
  );
}
