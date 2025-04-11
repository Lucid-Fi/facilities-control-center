"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FunctionCard } from "./function-card";
import { FunctionSearch } from "./function-search";
import { FacilityOverview } from "./facility-overview";
import {
  contractFunctions,
  type TransactionStatus,
  type ContractFunction,
} from "@/lib/contract-functions";
import { TransactionStatus as TransactionStatusComponent } from "./transaction-status";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/use-wallet";
import { useMutation } from "@tanstack/react-query";
import {
  EntryFunctionArgumentTypes,
  MoveFunctionId,
  Network,
} from "@aptos-labs/ts-sdk";
import { SimulationResult, simulateTransaction } from "@/lib/aptos-service";
export default function ContractInterface() {
  const searchParams = useSearchParams();
  const { submitTransaction, connected, account, network } = useWallet();

  const [moduleAddress, setModuleAddress] = useState<string>("0x1");
  const [inputModuleAddress, setInputModuleAddress] = useState<string>("0x1");
  const [facilityAddress, setFacilityAddress] = useState<string>("");
  const [inputFacilityAddress, setInputFacilityAddress] = useState<string>("");
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>(
    {
      status: "idle",
      message: "",
    }
  );
  const [filteredFunctions, setFilteredFunctions] =
    useState<ContractFunction[]>(contractFunctions);

  // Map wallet network string to SDK Network enum
  const aptosNetwork = useCallback(() => {
    if (network && network.chainId === 1) return Network.MAINNET;
    if (network && network.chainId === 2) return Network.TESTNET;
    return Network.DEVNET;
  }, [network]);

  const walletAccount = useMemo(() => {
    return account?.address.toString();
  }, [account]);

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

  // Transaction submission handler
  const handleTransactionSubmit = useCallback(
    async (functionName: string, args: unknown[]) => {
      if (!account || !connected) {
        throw new Error("Please connect your wallet first");
      }

      const payload = {
        function: `${moduleAddress}::${functionName}`,
        type_arguments: [],
        arguments: args,
        type: "entry_function_payload",
      };

      const result = await submitTransaction({
        function: payload.function as MoveFunctionId,
        typeArguments: payload.type_arguments,
        functionArguments: payload.arguments as EntryFunctionArgumentTypes[],
      });

      return result;
    },
    [account, connected, moduleAddress, submitTransaction]
  );

  // Transaction mutation
  const { mutate: submitTx } = useMutation({
    mutationFn: async ({
      functionName,
      args,
    }: {
      functionName: string;
      args: unknown[];
    }) => {
      setTransactionStatus({
        status: "pending",
        message: `Submitting transaction for ${functionName}...`,
      });

      return await handleTransactionSubmit(functionName, args);
    },
    onSuccess: (data) => {
      setTransactionStatus({
        status: "success",
        message: "Transaction completed successfully!",
        txHash: data.hash,
      });

      // Reset status after 5 seconds
      setTimeout(() => {
        setTransactionStatus({
          status: "idle",
          message: "",
        });
      }, 5000);
    },
    onError: (error) => {
      setTransactionStatus({
        status: "error",
        message: `Transaction failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    },
  });

  // Wrapper function for FunctionCard to use
  const onSubmit = useCallback(
    async (functionName: string, args: unknown[]) => {
      return new Promise<{ hash: string }>((resolve, reject) => {
        submitTx(
          { functionName, args },
          {
            onSuccess: (data) => resolve(data),
            onError: (error) => reject(error),
          }
        );
      });
    },
    [submitTx]
  );

  // Transaction simulation handler using the official SDK
  const handleTransactionSimulate = useCallback(
    async (
      functionName: string,
      args: unknown[]
    ): Promise<SimulationResult> => {
      if (!account) {
        throw new Error("Wallet not connected");
      }

      // Use our simulateTransaction utility
      return await simulateTransaction(
        account,
        functionName,
        moduleAddress,
        args,
        aptosNetwork()
      );
    },
    [account, moduleAddress, aptosNetwork]
  );

  const updateFacilityAddress = () => {
    if (inputFacilityAddress) {
      setFacilityAddress(inputFacilityAddress);

      // Update URL with the new facility address
      const params = new URLSearchParams(window.location.search);
      params.set("facility", inputFacilityAddress);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, "", newUrl);
    }
  };

  const updateModuleAddress = () => {
    if (inputModuleAddress) {
      setModuleAddress(inputModuleAddress);

      // Update URL with the new module address
      const params = new URLSearchParams(window.location.search);
      params.set("module", inputModuleAddress);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({}, "", newUrl);
    }
  };

  return (
    <div className="space-y-6">
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
        <TransactionStatusComponent
          status={transactionStatus.status}
          message={transactionStatus.message}
          txHash={transactionStatus.txHash}
          network={network ? network.toString() : undefined}
        />
      )}

      {facilityAddress && (
        <FacilityOverview
          facilityAddress={facilityAddress}
          moduleAddress={moduleAddress}
        />
      )}

      <FunctionSearch
        functions={contractFunctions}
        onFilteredFunctionsChange={setFilteredFunctions}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredFunctions.map((func) => (
          <FunctionCard
            key={`${func.moduleName}::${func.functionName}`}
            functionData={func}
            onSubmit={onSubmit}
            onSimulate={handleTransactionSimulate}
            isWalletConnected={!!walletAccount}
            moduleAddress={moduleAddress}
            facilityAddress={facilityAddress}
            walletAccount={account}
          />
        ))}
      </div>
    </div>
  );
}
