"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { AccountInfo } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { TransactionStatus } from "./contract-functions";
import { SimulationResult, simulateTransaction } from "./aptos-service";

interface UseSimulateContractFunctionOptions {
  moduleAddress: string;
  functionName: string;
  args: unknown[];
  account: AccountInfo | null | undefined;
  enabled?: boolean;
  network?: Network;
  onSuccess?: (data: SimulationResult) => void;
  onError?: (error: Error) => void;
  onSimulate?: (
    functionName: string,
    args: unknown[]
  ) => Promise<SimulationResult>;
}

interface UseSubmitContractFunctionOptions {
  moduleAddress: string;
  functionName: string;
  args: unknown[];
  account: AccountInfo | null | undefined;
  onSuccess?: (data: { hash: string }) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
  submitFunction: (
    functionName: string,
    args: unknown[]
  ) => Promise<{ hash: string }>;
}

// Hook for simulating contract functions
export function useSimulateContractFunction({
  moduleAddress,
  functionName,
  args,
  account,
  enabled = true,
  network,
  onSimulate,
}: Omit<UseSimulateContractFunctionOptions, "onSuccess" | "onError">) {
  return useQuery({
    queryKey: [
      "contractSimulation",
      moduleAddress,
      functionName,
      args,
      account?.address?.toString(),
    ],
    queryFn: async () => {
      if (!account) {
        throw new Error("Wallet not connected");
      }

      if (onSimulate) {
        return await onSimulate(functionName, args);
      }

      return await simulateTransaction(
        account,
        functionName,
        moduleAddress,
        args,
        network
      );
    },
    enabled: !!account && enabled,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

// Hook for submitting contract transactions
export function useSubmitContractFunction({
  moduleAddress,
  functionName,
  args,
  account,
  onSuccess,
  onError,
  onSettled,
  submitFunction,
}: UseSubmitContractFunctionOptions) {
  return useMutation({
    mutationKey: [
      "contractSubmission",
      moduleAddress,
      functionName,
      args,
      account?.address?.toString(),
    ],
    mutationFn: async () => {
      if (!account) {
        throw new Error("Wallet not connected");
      }

      return await submitFunction(functionName, args);
    },
    onSuccess,
    onError,
    onSettled,
  });
}

// Hook for tracking transaction status with loading state
export function useTransactionStatus() {
  const initialStatus: TransactionStatus = {
    status: "idle",
    message: "",
  };

  return { initialStatus };
}
