"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { WalletSelector } from "./wallet-selector"
import { FunctionCard } from "./function-card"
import { contractFunctions } from "@/lib/contract-functions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { type SimulationResult, createAptosClient } from "@/lib/aptos-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function ContractInterface() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [account, setAccount] = useState<string | null>(null)
  const [facilityAddress, setFacilityAddress] = useState<string>("")
  const [inputFacilityAddress, setInputFacilityAddress] = useState<string>("")
  const [transactionStatus, setTransactionStatus] = useState<{
    status: "idle" | "pending" | "success" | "error"
    message: string
  }>({
    status: "idle",
    message: "",
  })

  // Initialize facility address from URL query param
  useEffect(() => {
    const addressFromUrl = searchParams.get("facility_address")
    if (addressFromUrl) {
      setFacilityAddress(addressFromUrl)
      setInputFacilityAddress(addressFromUrl)
    }
  }, [searchParams])

  // Create an Aptos client instance
  const aptosClient = useMemo(
    () =>
      createAptosClient({
        nodeUrl: "https://fullnode.devnet.aptoslabs.com/v1",
      }),
    [],
  )

  const handleTransactionSubmit = useCallback(
    async (functionName: string, args: any[]) => {
      if (!account) {
        setTransactionStatus({
          status: "error",
          message: "Please connect your wallet first",
        })
        return
      }

      try {
        setTransactionStatus({
          status: "pending",
          message: `Submitting transaction for ${functionName}...`,
        })

        // This would be replaced with actual transaction submission logic
        // using the Aptos SDK
        await new Promise((resolve) => setTimeout(resolve, 2000))

        setTransactionStatus({
          status: "success",
          message: `Transaction for ${functionName} submitted successfully!`,
        })

        // Reset status after 5 seconds
        setTimeout(() => {
          setTransactionStatus({
            status: "idle",
            message: "",
          })
        }, 5000)
      } catch (error) {
        setTransactionStatus({
          status: "error",
          message: `Transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        })
      }
    },
    [account],
  )

  const handleTransactionSimulate = useCallback(
    async (functionName: string, args: any[]): Promise<SimulationResult> => {
      if (!account) {
        throw new Error("Wallet not connected")
      }

      // Create a transaction payload
      // In a real implementation, this would use the Aptos SDK to create the payload
      const payload = {
        function: `0x1::test_harness::${functionName}`,
        type_arguments: [],
        arguments: args,
      }

      // Simulate the transaction
      return await aptosClient.simulateTransaction(account, payload)
    },
    [account, aptosClient],
  )

  const updateFacilityAddress = () => {
    if (inputFacilityAddress) {
      setFacilityAddress(inputFacilityAddress)

      // Update URL with the new facility address
      const params = new URLSearchParams(window.location.search)
      params.set("facility_address", inputFacilityAddress)
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.pushState({}, "", newUrl)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <h2 className="text-xl font-semibold">Contract Functions</h2>
          <p className="text-sm text-gray-500">Connect your wallet to interact with the contract</p>
        </div>
        <WalletSelector onConnect={setAccount} connectedAccount={account} />
      </div>

      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-medium mb-2">Facility Address</h3>
        <p className="text-sm text-gray-500 mb-4">Set the default facility address to use for all function calls</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={inputFacilityAddress}
              onChange={(e) => setInputFacilityAddress(e.target.value)}
              placeholder="Enter facility address (0x...)"
            />
          </div>
          <Button onClick={updateFacilityAddress}>Set Address</Button>
        </div>
        {facilityAddress && <p className="mt-2 text-sm text-green-600">Current facility address: {facilityAddress}</p>}
      </div>

      {transactionStatus.status !== "idle" && (
        <Alert
          variant={
            transactionStatus.status === "error"
              ? "destructive"
              : transactionStatus.status === "success"
                ? "default"
                : "default"
          }
          className={
            transactionStatus.status === "pending"
              ? "border-yellow-500 text-yellow-800 bg-yellow-50"
              : transactionStatus.status === "success"
                ? "border-green-500 text-green-800 bg-green-50"
                : undefined
          }
        >
          {transactionStatus.status === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{transactionStatus.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {contractFunctions.map((func) => (
          <FunctionCard
            key={func.name}
            functionData={func}
            onSubmit={handleTransactionSubmit}
            onSimulate={handleTransactionSimulate}
            isWalletConnected={!!account}
            facilityAddress={facilityAddress}
          />
        ))}
      </div>
    </div>
  )
}
