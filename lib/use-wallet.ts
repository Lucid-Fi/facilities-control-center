"use client"

import { 
  useWallet as useAptosWallet
} from "@aptos-labs/wallet-adapter-react"
import { Types } from "aptos"
import { useState, useCallback, useEffect } from "react"

export interface WalletTransactionOptions {
  max_gas_amount?: number
  gas_unit_price?: number
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
  } = useAptosWallet()
  
  const [isWalletConnecting, setIsWalletConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Reset error when connection status changes
  useEffect(() => {
    if (connected) {
      setConnectionError(null)
    }
  }, [connected])

  const connectWallet = useCallback(async (walletName: string) => {
    setIsWalletConnecting(true)
    setConnectionError(null)
    
    try {
      await connect(walletName)
    } catch (error) {
      console.error("Error connecting wallet:", error)
      setConnectionError(error instanceof Error ? error.message : "Failed to connect wallet")
    } finally {
      setIsWalletConnecting(false)
    }
  }, [connect])

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect()
    } catch (error) {
      console.error("Error disconnecting wallet:", error)
    }
  }, [disconnect])

  const submitTransaction = useCallback(
    async (
      payload: Types.TransactionPayload & { type: string }, 
      options?: WalletTransactionOptions
    ) => {
      if (!connected || !account) {
        throw new Error("Wallet not connected")
      }

      // Format transaction data as expected by the wallet adapter
      // Note: The exact structure needed may vary based on the wallet adapter version
      const transaction = {
        sender: account.address,
        data: payload, // Aptos wallet adapter expects 'data', not 'payload'
        options: {
          max_gas_amount: options?.max_gas_amount?.toString(),
          gas_unit_price: options?.gas_unit_price?.toString(),
        },
      } as const

      try {
        // @ts-expect-error - API seems to have changed between types and implementation
        return await signAndSubmitTransaction(transaction)
      } catch (error) {
        console.error("Transaction error:", error)
        throw error
      }
    },
    [connected, account, signAndSubmitTransaction]
  )

  return {
    connectWallet,
    disconnectWallet,
    submitTransaction,
    signTransaction,
    signMessage,
    signMessageAndVerify,
    
    // State
    isWalletConnecting,
    connectionError,
    connected,
    account,
    network,
    wallet,
    wallets,
  }
}