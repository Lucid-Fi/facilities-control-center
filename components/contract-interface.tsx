"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { WalletSelector } from "./wallet-selector";
import { FunctionCard } from "./function-card";
import { contractFunctions } from "@/lib/contract-functions";
import { TransactionStatus } from "./transaction-status";
import { type SimulationResult, createAptosClient } from "@/lib/aptos-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/use-wallet";

export default function ContractInterface() {
  const searchParams = useSearchParams();
  const { submitTransaction, connected, account, wallet, network } =
    useWallet();

  const [walletAccount, setWalletAccount] = useState<string | null>(null);
  const [moduleAddress, setModuleAddress] = useState<string>("0x1");
  const [inputModuleAddress, setInputModuleAddress] = useState<string>("0x1");
  const [facilityAddress, setFacilityAddress] = useState<string>("");
  const [inputFacilityAddress, setInputFacilityAddress] = useState<string>("");
  const [transactionStatus, setTransactionStatus] = useState<{
    status: "idle" | "pending" | "success" | "error";
    message: string;
    txHash?: string;
  }>({
    status: "idle",
    message: "",
  });

  // Initialize addresses from URL query params
  useEffect(() => {
    const facilityFromUrl = searchParams.get("facility");
    if (facilityFromUrl) {
      setFacilityAddress(facilityFromUrl);
      setInputFacilityAddress(facilityFromUrl);
    }

    const moduleFromUrl = searchParams.get("module");
    if (moduleFromUrl) {
      setModuleAddress(moduleFromUrl);
      setInputModuleAddress(moduleFromUrl);
    }
  }, [searchParams]);

  // Create an Aptos client instance based on the current network
  const aptosClient = useMemo(() => {
    // Get network URL based on connected wallet's network
    const networkUrl =
      network === "Mainnet"
        ? "https://fullnode.mainnet.aptoslabs.com/v1"
        : wallet?.network === "Testnet"
        ? "https://fullnode.testnet.aptoslabs.com/v1"
        : "https://fullnode.devnet.aptoslabs.com/v1"; // Default to devnet

    const client = createAptosClient({
      nodeUrl: networkUrl,
    });

    // Set the wallet submit function if we have one
    if (submitTransaction) {
      client.setWalletSubmit(submitTransaction);
    }

    return client;
  }, [submitTransaction, wallet?.network]);

  const handleTransactionSubmit = useCallback(
    async (functionName: string, args: unknown[]) => {
      if (!walletAccount || !connected) {
        setTransactionStatus({
          status: "error",
          message: "Please connect your wallet first",
        });
        return;
      }

      try {
        setTransactionStatus({
          status: "pending",
          message: `Submitting transaction for ${functionName}...`,
        });

        // Create the transaction payload using the configured module address
        const payload = {
          ...aptosClient.createEntryFunctionPayload(
            `${moduleAddress}::test_harness`,
            functionName,
            [],
            args
          ),
          type: "entry_function_payload",
        };

        // Submit the transaction
        const result = await aptosClient.submitTransaction(
          walletAccount,
          payload
        );

        // Set success status with tx hash
        setTransactionStatus({
          status: "success",
          message: `Transaction for ${functionName} submitted successfully!`,
          txHash: result.hash,
        });

        // Wait for the transaction to complete
        try {
          await aptosClient.waitForTransaction(result.hash);
          // Update status to show transaction is completed
          setTransactionStatus({
            status: "success",
            message: `Transaction for ${functionName} completed successfully!`,
            txHash: result.hash,
          });
        } catch (error) {
          console.error("Error waiting for transaction:", error);
        }

        // Reset status after 5 seconds
        setTimeout(() => {
          setTransactionStatus({
            status: "idle",
            message: "",
          });
        }, 5000);
      } catch (error) {
        setTransactionStatus({
          status: "error",
          message: `Transaction failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    },
    [walletAccount, connected, aptosClient, moduleAddress]
  );

  const handleTransactionSimulate = useCallback(
    async (
      functionName: string,
      args: unknown[]
    ): Promise<SimulationResult> => {
      if (!account) {
        throw new Error("Wallet not connected");
      }

      // Create the transaction payload using the configured module address
      const payload = {
        function: `${moduleAddress}::test_harness::${functionName}`,
        type_arguments: [],
        arguments: args,
        type: "entry_function_payload",
      };

      // Simulate the transaction - Make sure we pass a string address
      // This prevents the "accountOrPubkey.toBytes is not a function" error
      return await aptosClient.simulateTransaction(account, payload);
    },
    [walletAccount, aptosClient, moduleAddress]
  );

  const updateFacilityAddress = () => {
    if (inputFacilityAddress) {
      setFacilityAddress(inputFacilityAddress);

      // Update URL with the new facility address
      const params = new URLSearchParams(window.location.search);
      params.set("facility_address", inputFacilityAddress);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, "", newUrl);
    }
  };

  const updateModuleAddress = () => {
    if (inputModuleAddress) {
      setModuleAddress(inputModuleAddress);

      // Update URL with the new module address
      const params = new URLSearchParams(window.location.search);
      params.set("module_address", inputModuleAddress);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, "", newUrl);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <h2 className="text-xl font-semibold">Contract Functions</h2>
          <p className="text-sm text-gray-500">
            Connect your wallet to interact with the contract
          </p>
        </div>
        <WalletSelector
          onConnect={setWalletAccount}
          connectedAccount={walletAccount}
        />
      </div>

      {connected && account && (
        <div className="p-4 border rounded-lg bg-blue-50">
          <h3 className="text-lg font-medium mb-2">Connected Account</h3>
          <p className="text-sm mb-1">
            <strong>Address:</strong> {account.address.toString()}
          </p>
          <p className="text-sm mb-1">
            <strong>Network:</strong> {wallet?.name || "Unknown"}
          </p>
          <p className="text-sm">
            <strong>Wallet:</strong> {wallet?.name || "Unknown"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-medium mb-2">Module Address</h3>
          <p className="text-sm text-gray-500 mb-4">
            Set the contract module address
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                value={inputModuleAddress}
                onChange={(e) => setInputModuleAddress(e.target.value)}
                placeholder="Enter module address (0x...)"
              />
            </div>
            <Button onClick={updateModuleAddress}>Set Address</Button>
          </div>
          {moduleAddress && (
            <p className="mt-2 text-sm text-green-600">
              Current module address: {moduleAddress}
            </p>
          )}
        </div>

        <div className="p-4 border rounded-lg">
          <h3 className="text-lg font-medium mb-2">Facility Address</h3>
          <p className="text-sm text-gray-500 mb-4">
            Set the default facility address to use for all function calls
          </p>
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
          {facilityAddress && (
            <p className="mt-2 text-sm text-green-600">
              Current facility address: {facilityAddress}
            </p>
          )}
        </div>
      </div>

      {transactionStatus.status !== "idle" && (
        <TransactionStatus
          status={transactionStatus.status}
          message={transactionStatus.message}
          txHash={transactionStatus.txHash}
          network={wallet?.network}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {contractFunctions.map((func) => (
          <FunctionCard
            key={func.name}
            functionData={func}
            onSubmit={handleTransactionSubmit}
            onSimulate={handleTransactionSimulate}
            isWalletConnected={!!walletAccount}
            moduleAddress={moduleAddress}
            facilityAddress={facilityAddress}
          />
        ))}
      </div>
    </div>
  );
}
