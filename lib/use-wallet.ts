"use client";

import { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import { useWallet as useAptosWallet } from "@aptos-labs/wallet-adapter-react";
import { useState, useCallback, useEffect } from "react";

export interface WalletTransactionOptions {
  max_gas_amount?: number;
  gas_unit_price?: number;
}

export function useWallet() {
  const {
    connect,
    disconnect,
    connected,
    account,
    network,
    wallet,
    wallets,
    signAndSubmitTransaction,
    signTransaction,
    signMessage,
    signMessageAndVerify,
  } = useAptosWallet();

  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Reset error when connection status changes
  useEffect(() => {
    if (connected) {
      setConnectionError(null);
    }
  }, [connected]);

  const connectWallet = useCallback(
    async (walletName: string) => {
      setIsWalletConnecting(true);
      setConnectionError(null);

      try {
        await connect(walletName);
      } catch (error) {
        console.error("Error connecting wallet:", error);
        setConnectionError(
          error instanceof Error ? error.message : "Failed to connect wallet"
        );
      } finally {
        setIsWalletConnecting(false);
      }
    },
    [connect]
  );

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect();
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Unknown error during disconnect";
      console.error("Error disconnecting wallet:", errorMessage, error);
    }
  }, [disconnect]);

  const submitTransaction = useCallback(
    async (
      payload: InputGenerateTransactionPayloadData,
      options?: WalletTransactionOptions
    ) => {
      if (!connected || !account) {
        throw new Error("Wallet not connected");
      }

      try {
        console.log("signAndSubmitTransaction", payload);
        return await signAndSubmitTransaction({
          sender: account.address,
          data: payload,
          options: {
            maxGasAmount: options?.max_gas_amount,
            gasUnitPrice: options?.gas_unit_price,
          },
        });
      } catch (error) {
        console.error("Transaction error:", error);
        throw error;
      }
    },
    [connected, account, signAndSubmitTransaction]
  );

  return {
    connectWallet,
    disconnectWallet,
    submitTransaction,
    signTransaction,
    signMessage,
    signMessageAndVerify,
    signAndSubmitTransaction,

    // State
    isWalletConnecting,
    connectionError,
    connected,
    account,
    network,
    wallet,
    wallets,
  };
}
