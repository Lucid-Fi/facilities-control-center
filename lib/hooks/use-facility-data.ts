/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { createAptosClient } from "../aptos-service";
import { useEffectiveNetwork } from "./use-effective-network";

export interface FacilityData {
  fundingRequestId?: string;
  principalCollectionBalance: string;
  interestCollectionBalance: string;
  facilitySize: string;
  minDraw: string;
  outstandingPrincipal: string;
  admin: string;
  originator: string;
  hasActiveCapitalCall: boolean;
  capitalCallTotalAmount: string;
  capitalCallAmountRemaining: string;
  testBasketExists: boolean;
  testsStatus: "success" | "fail" | "revert";
  capitalCallRequestAmount: string;
  recycleRequestAmount: string;
  maxCapitalCallAmount: string;
  maxRecycleAmount: string;
  isInDrawPeriod: boolean;
  isInRecyclePeriod: boolean;
  borrowingBase: string;
}

interface UseFacilityInfoProps {
  facilityAddress?: string;
  moduleAddress?: string;
}

export const useFacilityInfo = ({
  facilityAddress,
  moduleAddress,
}: UseFacilityInfoProps) => {
  const network = useEffectiveNetwork();
  const {
    data: facilityData,
    isLoading,
    error,
  } = useQuery<FacilityData, Error>({
    queryKey: [
      "facilityData",
      facilityAddress,
      moduleAddress,
      network.chainId,
    ],
    queryFn: async (): Promise<FacilityData> => {
      if (!facilityAddress) {
        throw new Error("Facility address is required");
      }
      if (!moduleAddress) {
        throw new Error("Module address is required");
      }

      const client = createAptosClient(network.name);

      try {
        // Using Promise.allSettled to make all view function calls in parallel
        // and handle individual failures gracefully.
        const results = await Promise.allSettled([
          // Get principal collection balance
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::get_principal_collection_account_balance`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get interest collection balance
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::get_interest_collection_account_balance`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get facility size
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::facility_size`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get min draw
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::min_draw`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get outstanding principal
          client.view({
            payload: {
              function: `${moduleAddress}::shares_manager::get_outstanding_principal`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Check if there's an active capital call
          client.view({
            payload: {
              function: `${moduleAddress}::shares_manager::has_active_capital_call`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get total capital call amount
          client.view({
            payload: {
              function: `${moduleAddress}::shares_manager::get_capital_call_total_amount`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get remaining capital call amount
          client.view({
            payload: {
              function: `${moduleAddress}::shares_manager::get_capital_call_amount_remaining`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Check if test basket exists
          client.view({
            payload: {
              function: `${moduleAddress}::facility_tests::test_basket_exists`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Check if all tests pass
          client.view({
            payload: {
              function: `${moduleAddress}::facility_tests::vehicle_tests_satisfied`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get max capital call amount
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::max_capital_call_amount`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get max recycle amount
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::max_recycle_amount`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Check if in draw period
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::in_draw_period`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Check if in recycle period
          client.view({
            payload: {
              function: `${moduleAddress}::facility_core::in_recycle_period`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),

          // Get current borrowing base
          client.view({
            payload: {
              function: `${moduleAddress}::borrowing_base_engine::evaluate`,
              typeArguments: [],
              functionArguments: [facilityAddress],
            },
          }),
        ]);

        // Process results from Promise.allSettled
        const principalBalanceResult = results[0];
        const interestBalanceResult = results[1];
        const facilitySizeResult = results[2];
        const minDrawResult = results[3];
        const outstandingPrincipalResult = results[4];
        const hasActiveCapitalCallResult = results[5];
        const capitalCallTotalAmountResult = results[6];
        const capitalCallAmountRemainingResult = results[7];
        const testBasketExistsResult = results[8];
        const testsPassResult = results[9];
        const maxCapitalCallAmountResult = results[10];
        const maxRecycleAmountResult = results[11];
        const isInDrawPeriodResult = results[12];
        const isInRecyclePeriodResult = results[13];
        const borrowingBaseResult = results[14];

        // Helper to extract value or return default
        // Specifying types for T (generic type for promise value) and U (generic type for default value)
        const getValueOrDefault = <T, U>(
          result: PromiseSettledResult<T>,
          defaultValue: U
        ): (T extends (infer R)[] ? R : T) | U => {
          // Adjusted to handle array unwrapping if necessary
          if (result.status === "fulfilled") {
            // If the fulfilled value is an array, assume we want the first element as per original logic.
            // This might need adjustment based on the actual structure of your view function returns.
            if (Array.isArray(result.value) && result.value.length > 0) {
              return result.value[0] as T extends (infer R)[] ? R : T;
            }
            return result.value as T extends (infer R)[] ? R : T;
          }
          return defaultValue;
        };

        // Extract data or use defaults
        const principalBalance = getValueOrDefault(
          principalBalanceResult,
          null
        );
        const interestBalance = getValueOrDefault(interestBalanceResult, null);
        const facilitySize = getValueOrDefault(facilitySizeResult, null);
        const minDraw = getValueOrDefault(minDrawResult, null);
        const outstandingPrincipal = getValueOrDefault(
          outstandingPrincipalResult,
          null
        );
        const hasActiveCapitalCall = getValueOrDefault(
          hasActiveCapitalCallResult,
          null
        );
        const capitalCallTotalAmount = getValueOrDefault(
          capitalCallTotalAmountResult,
          null
        );
        const capitalCallAmountRemaining = getValueOrDefault(
          capitalCallAmountRemainingResult,
          null
        );
        const testBasketExists = getValueOrDefault(
          testBasketExistsResult,
          null
        );
        const testsPass = getValueOrDefault(testsPassResult, null);
        const maxCapitalCallAmount = getValueOrDefault(
          maxCapitalCallAmountResult,
          null
        );
        const maxRecycleAmount = getValueOrDefault(
          maxRecycleAmountResult,
          null
        );
        const isInDrawPeriod = getValueOrDefault(isInDrawPeriodResult, null);
        const isInRecyclePeriod = getValueOrDefault(
          isInRecyclePeriodResult,
          null
        );
        const borrowingBase = getValueOrDefault(borrowingBaseResult, null);

        // Fetch resource accounts for admin info since we don't have a direct view function
        let resourceAccounts: any[] = []; // Consider defining a more specific type if possible
        let admin: string | undefined = "Unknown";
        let originator: string | undefined = "Unknown";
        // Define more specific types for request states if possible
        let capitalCallRequestState: {
          data?: {
            run_id?: { creation_num?: string };
            proposed_max?: { vec?: string[] };
          };
        } | null = null;
        let recycleRequestState: {
          data?: {
            run_id?: { creation_num?: string };
            proposed_max?: { vec?: string[] };
          };
        } | null = null;

        try {
          resourceAccounts = await client.account.getAccountResources({
            accountAddress: facilityAddress,
          });

          const facilityDetails = resourceAccounts.find((r) =>
            r.type.includes("FacilityBaseDetails")
          ) as
            | {
                // Type assertion, consider defining a more precise type
                data: {
                  admin: { inner: string };
                  originator_admin: { value: string };
                  originator_receivable_account: string;
                };
              }
            | undefined;

          const objectDetails = resourceAccounts.find((r) =>
            r.type.includes("ObjectCore")
          ) as
            | {
                // Type assertion, consider defining a more precise type
                data: {
                  owner: string;
                };
              }
            | undefined;

          capitalCallRequestState = resourceAccounts.find(
            (r) =>
              r.type.includes("FundingRequestState") &&
              r.type.includes("CapitalCallRequestTypeTag")
          ) as unknown as {
            data: {
              run_id: {
                creation_num: string;
                addr: string;
              };
              proposed_max: {
                vec: string[];
              };
            };
          };

          recycleRequestState = resourceAccounts.find(
            (r) =>
              r.type.includes("FundingRequestState") &&
              r.type.includes("RecycleRequestTypeTag")
          ) as unknown as {
            data: {
              run_id: {
                creation_num: string;
                addr: string;
              };
              proposed_max: {
                vec: string[];
              };
            };
          };

          admin = objectDetails?.data?.owner;
          originator = facilityDetails?.data?.originator_receivable_account;
        } catch (resourceError) {
          console.error("Error fetching resource accounts:", resourceError);
          admin = "Error fetching";
          originator = "Error fetching";
        }

        return {
          fundingRequestId:
            capitalCallRequestState?.data?.run_id?.creation_num ||
            recycleRequestState?.data?.run_id?.creation_num,
          principalCollectionBalance: principalBalance?.toString() ?? "Error",
          interestCollectionBalance: interestBalance?.toString() ?? "Error",
          facilitySize: facilitySize?.toString() ?? "Error",
          minDraw: minDraw?.toString() ?? "Error",
          outstandingPrincipal: outstandingPrincipal?.toString() ?? "Error",
          admin: admin || "Unknown",
          originator: originator || "Unknown",
          hasActiveCapitalCall: hasActiveCapitalCall === true,
          capitalCallTotalAmount: capitalCallTotalAmount?.toString() ?? "Error",
          capitalCallAmountRemaining:
            capitalCallAmountRemaining?.toString() ?? "Error",
          testBasketExists: testBasketExists === true,
          testsStatus:
            testsPass === null
              ? "revert"
              : testsPass === true
              ? "success"
              : "fail",
          capitalCallRequestAmount:
            capitalCallRequestState?.data?.proposed_max?.vec?.[0]?.toString() ||
            "0",
          recycleRequestAmount:
            recycleRequestState?.data?.proposed_max?.vec?.[0]?.toString() ||
            "0",
          maxCapitalCallAmount: maxCapitalCallAmount?.toString() ?? "Error",
          maxRecycleAmount: maxRecycleAmount?.toString() ?? "Error",
          isInDrawPeriod: isInDrawPeriod === true,
          isInRecyclePeriod: isInRecyclePeriod === true,
          borrowingBase: borrowingBase?.toString() ?? "Stale",
        };
      } catch (e) {
        // This catch block might now be less likely to be hit for individual view failures,
        // but could still catch errors during setup or resource fetching.
        console.error("Error fetching facility data:", e);
        // Fallback remains, but provides less specific information
        // Ensure the returned object matches the FacilityData interface
        const errorReturn: FacilityData = {
          fundingRequestId: undefined,
          principalCollectionBalance: "Error",
          interestCollectionBalance: "Error",
          facilitySize: "Error",
          minDraw: "Error",
          outstandingPrincipal: "Error",
          admin: "Error",
          originator: "Error",
          hasActiveCapitalCall: false,
          capitalCallTotalAmount: "Error",
          capitalCallAmountRemaining: "Error",
          testBasketExists: false,
          testsStatus: "fail",
          capitalCallRequestAmount: "0",
          recycleRequestAmount: "0",
          maxCapitalCallAmount: "Error",
          maxRecycleAmount: "Error",
          isInDrawPeriod: false,
          isInRecyclePeriod: false,
          borrowingBase: "Stale",
        };

        return errorReturn;
      }
    },
    enabled: !!facilityAddress && !!moduleAddress,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  return { facilityData, isLoading, error };
};
