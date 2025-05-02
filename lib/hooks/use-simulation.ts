import { useQuery } from "@tanstack/react-query";
import { AccountInfo } from "@aptos-labs/wallet-adapter-react";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { simulateTransaction } from "@/lib/aptos-service";

interface SimulationParams {
  account: AccountInfo;
  functionName: string;
  moduleName: string;
  moduleAddress: string;
  args: EntryFunctionArgumentTypes[];
}

export function useSimulation(params: SimulationParams | null) {
  return useQuery({
    queryKey: [
      "simulation",
      params?.account.address,
      params?.functionName,
      params?.moduleName,
      params?.moduleAddress,
      params?.args,
    ],
    queryFn: () => {
      if (!params) return null;
      return simulateTransaction(
        params.account,
        `${params.moduleName}::${params.functionName}`,
        params.moduleAddress,
        params.args as unknown[]
      );
    },
    enabled: !!params,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
