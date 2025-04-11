"use client";

import { useMemo } from "react";
import { useWallet } from "@/lib/use-wallet";
import { useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { createAptosClient } from "@/lib/aptos-service";
import { Network } from "@aptos-labs/ts-sdk";

export function UserRoleDisplay() {
  const { account, network: walletNetwork } = useWallet();
  const searchParams = useSearchParams();
  const facilityAddress = searchParams?.get("facility") as string | undefined;
  const moduleAddress = searchParams?.get("module") as string | undefined;

  const connectedAddress = useMemo(
    () => account?.address.toString(),
    [account]
  );

  // Determine Aptos network from wallet network
  const aptosNetwork = useMemo(() => {
    if (walletNetwork?.chainId === 1) return Network.MAINNET;
    if (walletNetwork?.chainId === 2) return Network.TESTNET; // Assuming Testnet for chainId 2
    // Add other networks if needed
    return Network.TESTNET; // Default to Testnet
  }, [walletNetwork]);

  const client = useMemo(() => createAptosClient(aptosNetwork), [aptosNetwork]);

  const commonQueryConfig = {
    enabled:
      !!facilityAddress && !!connectedAddress && !!moduleAddress && !!client,
    staleTime: 5 * 60 * 1000, // 5 minutes
  };

  const results = useQueries({
    queries: [
      {
        queryKey: ["isAdmin", facilityAddress, connectedAddress, aptosNetwork],
        queryFn: async () => {
          if (
            !facilityAddress ||
            !connectedAddress ||
            !moduleAddress ||
            !client
          )
            return false;
          try {
            const response = await client.view<[boolean]>({
              payload: {
                function: `${moduleAddress}::facility_core::is_admin`,
                functionArguments: [facilityAddress, connectedAddress],
              },
            });
            return response[0];
          } catch (error) {
            console.error("Error fetching isAdmin:", error);
            return false;
          }
        },
        ...commonQueryConfig,
      },
      {
        queryKey: [
          "isOriginatorAdmin",
          facilityAddress,
          connectedAddress,
          aptosNetwork,
        ],
        queryFn: async () => {
          if (
            !facilityAddress ||
            !connectedAddress ||
            !moduleAddress ||
            !client
          )
            return false;
          try {
            const response = await client.view<[boolean]>({
              payload: {
                function: `${moduleAddress}::facility_core::is_originator_admin`,
                functionArguments: [facilityAddress, connectedAddress],
              },
            });
            return response[0];
          } catch (error) {
            console.error("Error fetching isOriginatorAdmin:", error);
            return false;
          }
        },
        ...commonQueryConfig,
      },
      {
        queryKey: [
          "isOriginatorReceivable",
          facilityAddress,
          connectedAddress,
          aptosNetwork,
        ],
        queryFn: async () => {
          if (
            !facilityAddress ||
            !connectedAddress ||
            !moduleAddress ||
            !client
          )
            return false;
          try {
            const response = await client.view<[string]>({
              payload: {
                function: `${moduleAddress}::facility_core::get_originator_receivable_account`,
                functionArguments: [facilityAddress],
              },
            });
            const receivableAccount = response[0];
            return (
              receivableAccount?.toLowerCase() ===
              connectedAddress?.toLowerCase()
            );
          } catch (error) {
            console.error("Error fetching isOriginatorReceivable:", error);
            return false;
          }
        },
        ...commonQueryConfig,
      },
    ],
  });

  const [
    { data: isAdmin, isLoading: isLoadingAdmin },
    { data: isOriginatorAdmin, isLoading: isLoadingOriginatorAdmin },
    { data: isOriginatorReceivable, isLoading: isLoadingReceivable },
  ] = results;

  // Don't render anything if not connected, loading, or no facility address
  if (
    !connectedAddress ||
    !facilityAddress ||
    isLoadingAdmin ||
    isLoadingOriginatorAdmin ||
    isLoadingReceivable
  ) {
    return <Badge variant="outline">loading...</Badge>;
  }

  if (!isAdmin && !isOriginatorAdmin && !isOriginatorReceivable) {
    return <Badge variant="destructive">No Role Detected</Badge>;
  }

  return (
    <div className="flex items-center gap-1 ml-2">
      {isAdmin && <Badge variant="secondary">Admin</Badge>}
      {isOriginatorAdmin && <Badge variant="secondary">Originator Admin</Badge>}
      {isOriginatorReceivable && <Badge variant="secondary">Originator</Badge>}
    </div>
  );
}
