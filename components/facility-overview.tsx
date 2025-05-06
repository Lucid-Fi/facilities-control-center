/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Network } from "@aptos-labs/ts-sdk";
import { createAptosClient } from "@/lib/aptos-service";
import { useWallet } from "@/lib/use-wallet";
import { useQuery } from "@tanstack/react-query";

const DECIMAL_PLACES = process.env.NEXT_PUBLIC_TOKEN_DECIMALS
  ? parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS)
  : 6;

const adjustForDecimals = (value: string): string => {
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    return value;
  }
  return (num / Math.pow(10, DECIMAL_PLACES)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

interface FacilityData {
  fundingRequestId?: string;
  outstandingPrincipal?: string;
  interestCollectionBalance: string;
  principalCollectionBalance: string;
  admin?: string;
  originator?: string;
  facilitySize?: string;
  minDraw?: string;
  hasActiveCapitalCall: boolean;
  capitalCallTotalAmount: string;
  capitalCallAmountRemaining: string;
  testBasketExists: boolean;
  testsStatus: "success" | "fail" | "revert";
  capitalCallRequestAmount?: string;
  recycleRequestAmount?: string;
  maxCapitalCallAmount: string;
  maxRecycleAmount: string;
  isInDrawPeriod: boolean;
  isInRecyclePeriod: boolean;
  borrowingBase: string;
}

export function FacilityOverview({
  facilityAddress,
  moduleAddress,
}: {
  facilityAddress: string;
  moduleAddress: string;
}) {
  const { network } = useWallet();

  // Map wallet network string to SDK Network enum
  const aptosNetwork = () => {
    if (network && network.chainId === 1) return Network.MAINNET;
    if (network && network.chainId === 2) return Network.TESTNET;
    return Network.TESTNET;
  };

  // Use tanstack query to handle facility data fetching
  const {
    data: facilityData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      "facilityData",
      facilityAddress,
      moduleAddress,
      network?.chainId,
    ],
    queryFn: async (): Promise<FacilityData> => {
      if (!facilityAddress) {
        throw new Error("Facility address is required");
      }

      const client = createAptosClient(aptosNetwork());

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
        const getValueOrDefault = <T, U>(
          result: PromiseSettledResult<T>,
          defaultValue: U
        ): T | U => {
          return result.status === "fulfilled" ? result.value : defaultValue;
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
        let resourceAccounts: any[] = [];
        let admin: string | undefined = "Unknown";
        let originator: string | undefined = "Unknown";
        let capitalCallRequestState: any = null;
        let recycleRequestState: any = null;

        try {
          resourceAccounts = await client.account.getAccountResources({
            accountAddress: facilityAddress,
          });

          const facilityDetails = resourceAccounts.find((r) =>
            r.type.includes("FacilityBaseDetails")
          ) as unknown as {
            data: {
              admin: { inner: string };
              originator_admin: { value: string };
              originator_receivable_account: string;
            };
          };

          const objectDetails = resourceAccounts.find((r) =>
            r.type.includes("ObjectCore")
          ) as unknown as {
            data: {
              owner: string;
            };
          };

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
          // Assign defaults or handle as needed if resource fetching fails
          admin = "Error fetching";
          originator = "Error fetching";
        }

        return {
          fundingRequestId:
            capitalCallRequestState?.data?.run_id?.creation_num ||
            recycleRequestState?.data?.run_id?.creation_num,
          principalCollectionBalance:
            principalBalance?.[0]?.toString() ?? "Error",
          interestCollectionBalance:
            interestBalance?.[0]?.toString() ?? "Error",
          facilitySize: facilitySize?.[0]?.toString() ?? "Error",
          minDraw: minDraw?.[0]?.toString() ?? "Error",
          outstandingPrincipal:
            outstandingPrincipal?.[0]?.toString() ?? "Error",
          admin: admin || "Unknown",
          originator: originator || "Unknown",
          hasActiveCapitalCall: hasActiveCapitalCall?.[0] === true,
          capitalCallTotalAmount:
            capitalCallTotalAmount?.[0]?.toString() ?? "Error",
          capitalCallAmountRemaining:
            capitalCallAmountRemaining?.[0]?.toString() ?? "Error",
          testBasketExists: testBasketExists?.[0] === true,
          testsStatus:
            testsPass === null
              ? "revert"
              : testsPass?.[0] === true
              ? "success"
              : "fail",
          capitalCallRequestAmount:
            capitalCallRequestState?.data?.proposed_max?.vec[0]?.toString() ||
            "0",
          recycleRequestAmount:
            recycleRequestState?.data?.proposed_max?.vec[0]?.toString() || "0",
          maxCapitalCallAmount:
            maxCapitalCallAmount?.[0]?.toString() ?? "Error",
          maxRecycleAmount: maxRecycleAmount?.[0]?.toString() ?? "Error",
          isInDrawPeriod: isInDrawPeriod?.[0] === true,
          isInRecyclePeriod: isInRecyclePeriod?.[0] === true,
          borrowingBase: borrowingBase?.[0]?.toString() ?? "Stale",
        };
      } catch (error) {
        // This catch block might now be less likely to be hit for individual view failures,
        // but could still catch errors during setup or resource fetching.
        console.error("Error fetching facility data:", error);
        // Fallback remains, but provides less specific information
        return {
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
          testBasketExists: false, // Default to false on major error
          testsStatus: "fail", // Default to false on major error
          capitalCallRequestAmount: "0",
          recycleRequestAmount: "0",
          maxCapitalCallAmount: "Error",
          maxRecycleAmount: "Error",
          isInDrawPeriod: false, // Default to false on major error
          isInRecyclePeriod: false, // Default to false on major error
          borrowingBase: "Stale",
        };
      }
    },
    enabled: !!facilityAddress && !!moduleAddress,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });

  // Format a number with commas
  const formatNumber = (value: string): string => {
    const adjustedValue = adjustForDecimals(value);
    const num = parseFloat(adjustedValue);
    if (isNaN(num)) {
      return value;
    }
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  if (!facilityAddress) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facility Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-500">
            Please enter a facility address above to view details
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facility Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <div className="animate-pulse">Loading facility data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Facility Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500">
            {error instanceof Error
              ? error.message
              : "Failed to load facility data"}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facility Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {facilityData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                Facility Configuration
              </h3>
              <div className="mt-1 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      facilityData.isInDrawPeriod
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {facilityData.isInDrawPeriod
                      ? "In Draw Period"
                      : "Not In Draw Period"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      facilityData.isInRecyclePeriod
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {facilityData.isInRecyclePeriod
                      ? "In Recycle Period"
                      : "Not In Recycle Period"}
                  </span>
                </div>
                {facilityData.testBasketExists && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-500">Facility Tests</div>
                    <div
                      className={`text-sm font-medium flex items-center ${
                        facilityData.testsStatus === "success"
                          ? "text-green-600"
                          : facilityData.testsStatus === "fail"
                          ? "text-red-600"
                          : "text-yellow-600"
                      }`}
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                          facilityData.testsStatus === "success"
                            ? "bg-green-500"
                            : facilityData.testsStatus === "fail"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                        }`}
                      ></span>
                      {facilityData.testsStatus === "success"
                        ? "All Tests Passing"
                        : facilityData.testsStatus === "fail"
                        ? "Tests Failing"
                        : "Tests Reverted (borrowing base is stale)"}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500">Facility Size</div>
                  <div className="text-sm font-medium">
                    {facilityData.facilitySize
                      ? formatNumber(facilityData.facilitySize)
                      : "Unknown"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Minimum Draw</div>
                  <div className="text-sm font-medium">
                    {facilityData.minDraw
                      ? formatNumber(facilityData.minDraw)
                      : "Unknown"}
                  </div>
                </div>
                {facilityData.admin && (
                  <div>
                    <div className="text-xs text-gray-500">Admin</div>
                    <div className="text-sm font-medium truncate">
                      {facilityData.admin}
                    </div>
                  </div>
                )}
                {facilityData.originator && (
                  <div>
                    <div className="text-xs text-gray-500">Originator</div>
                    <div className="text-sm font-medium truncate">
                      {facilityData.originator}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">
                Financial Info
              </h3>
              <div className="mt-1 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/10">
                    Max Cap Call:{" "}
                    {formatNumber(facilityData.maxCapitalCallAmount)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/10">
                    Max Recycle: {formatNumber(facilityData.maxRecycleAmount)}
                  </span>
                </div>
                {facilityData.fundingRequestId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                    <div className="text-xs text-blue-700 font-medium flex items-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 mr-1.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Active Funding Request (ID:{" "}
                      {facilityData.fundingRequestId})
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500">
                    Outstanding Principal
                  </div>
                  <div className="text-sm font-medium">
                    {formatNumber(facilityData.outstandingPrincipal || "0")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">
                    Principal Collection Balance
                  </div>
                  <div className="text-sm font-medium">
                    {formatNumber(facilityData.principalCollectionBalance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">
                    Interest Collection Balance
                  </div>
                  <div className="text-sm font-medium">
                    {formatNumber(facilityData.interestCollectionBalance)}
                  </div>
                </div>
                {facilityData.capitalCallRequestAmount &&
                  parseInt(facilityData.capitalCallRequestAmount) > 0 &&
                  parseInt(facilityData.maxCapitalCallAmount) == 0 && (
                    <div>
                      <div className="text-xs text-gray-500">
                        Pending Capital Call Limit Request
                      </div>
                      <div className="text-sm font-medium text-orange-600">
                        {formatNumber(facilityData.capitalCallRequestAmount)}
                      </div>
                    </div>
                  )}
                {facilityData.recycleRequestAmount &&
                  parseInt(facilityData.recycleRequestAmount) > 0 &&
                  (facilityData.maxRecycleAmount === "Error" ||
                    parseInt(facilityData.maxRecycleAmount) == 0) && ( // Check for "Error" too
                    <div>
                      <div className="text-xs text-gray-500">
                        Pending Recycle Limit Request
                      </div>
                      <div className="text-sm font-medium text-purple-600">
                        {formatNumber(facilityData.recycleRequestAmount)}
                      </div>
                    </div>
                  )}
                {facilityData.borrowingBase &&
                  facilityData.borrowingBase !== "Error" && (
                    <div>
                      <div className="text-xs text-gray-500">
                        Current Borrowing Base
                      </div>
                      <div className="text-sm font-medium">
                        {formatNumber(facilityData.borrowingBase)}
                      </div>
                    </div>
                  )}
              </div>

              {facilityData.hasActiveCapitalCall && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-500">
                    Active Capital Call
                  </h3>
                  <div className="mt-1 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-2">
                    <div>
                      <div className="text-xs text-gray-500">Total Amount</div>
                      <div className="text-sm font-medium">
                        {formatNumber(facilityData.capitalCallTotalAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">
                        Remaining Amount
                      </div>
                      <div className="text-sm font-medium">
                        {formatNumber(facilityData.capitalCallAmountRemaining)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Completion</div>
                      <div className="text-sm font-medium">
                        {parseInt(facilityData.capitalCallTotalAmount, 10) >
                          0 &&
                        !isNaN(
                          parseInt(facilityData.capitalCallTotalAmount, 10)
                        ) && // Check if total is a valid number
                        !isNaN(
                          parseInt(facilityData.capitalCallAmountRemaining, 10)
                        ) // Check if remaining is a valid number
                          ? `${Math.round(
                              100 *
                                (1 -
                                  parseInt(
                                    facilityData.capitalCallAmountRemaining,
                                    10
                                  ) /
                                    parseInt(
                                      facilityData.capitalCallTotalAmount,
                                      10
                                    ))
                            )}%`
                          : "N/A"}{" "}
                        {/* Show N/A if calculation isn't possible */}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-gray-500">No facility data available</div>
        )}
      </CardContent>
    </Card>
  );
}
