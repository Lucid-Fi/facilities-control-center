"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Network } from "@aptos-labs/ts-sdk";
import { createAptosClient } from "@/lib/aptos-service";
import { useWallet } from "@/lib/use-wallet";
import { useQuery } from "@tanstack/react-query";

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
  testsPass: boolean;
  capitalCallRequestAmount?: string;
  recycleRequestAmount?: string;
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
        // Using Promise.all to make all view function calls in parallel
        const [
          principalBalance,
          interestBalance,
          facilitySize,
          minDraw,
          outstandingPrincipal,
          hasActiveCapitalCall,
          capitalCallTotalAmount,
          capitalCallAmountRemaining,
          testBasketExists,
          testsPass,
        ] = await Promise.all([
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
        ]);

        // Fetch resource accounts for admin info since we don't have a direct view function
        const resourceAccounts = await client.account.getAccountResources({
          accountAddress: facilityAddress,
        });

        // Extract facility info from resources
        const facilityDetails = resourceAccounts.find((r) =>
          r.type.includes("FacilityBaseDetails")
        ) as unknown as {
          data: {
            admin: { inner: string }; // THIS IS A WHITELIST ADDRESS
            originator_admin: { value: string }; // THIS IS A WHITELIST ADDRESS
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

        const capitalCallRequestState = resourceAccounts.find(
          (r) =>
            r.type.includes("FundingRequestState") &&
            r.type.includes("CapitalCallRequestTypeTag")
        ) as unknown as {
          data: {
            run_id: {
              creation_num: string;
              addr: string;
            };
            proposed_max: string[];
          };
        };

        const recycleRequestState = resourceAccounts.find(
          (r) =>
            r.type.includes("FundingRequestState") &&
            r.type.includes("RecycleRequestTypeTag")
        ) as unknown as {
          data: {
            run_id: {
              creation_num: string;
              addr: string;
            };
            proposed_max: string[];
          };
        };

        const admin = objectDetails?.data?.owner;
        const originator = facilityDetails?.data?.originator_receivable_account;

        return {
          fundingRequestId:
            capitalCallRequestState?.data?.run_id?.creation_num ||
            recycleRequestState?.data?.run_id?.creation_num,
          principalCollectionBalance: principalBalance[0]?.toString() || "0",
          interestCollectionBalance: interestBalance[0]?.toString() || "0",
          facilitySize: facilitySize[0]?.toString() || "Unknown",
          minDraw: minDraw[0]?.toString() || "Unknown",
          outstandingPrincipal: outstandingPrincipal[0]?.toString() || "0",
          admin: admin || "Unknown",
          originator: originator || "Unknown",
          hasActiveCapitalCall: hasActiveCapitalCall[0] === true,
          capitalCallTotalAmount: capitalCallTotalAmount[0]?.toString() || "0",
          capitalCallAmountRemaining:
            capitalCallAmountRemaining[0]?.toString() || "0",
          testBasketExists: testBasketExists[0] === true,
          testsPass: testsPass[0] === true,
          capitalCallRequestAmount:
            capitalCallRequestState?.data?.proposed_max[0]?.toString() || "0",
          recycleRequestAmount:
            recycleRequestState?.data?.proposed_max[0]?.toString() || "0",
        };
      } catch (error) {
        console.error("Error fetching facility data:", error);
        // If view functions fail, fall back to resource-based approach
        return {
          principalCollectionBalance: "0",
          interestCollectionBalance: "0",
          hasActiveCapitalCall: false,
          capitalCallTotalAmount: "0",
          capitalCallAmountRemaining: "0",
          testBasketExists: false,
          testsPass: false,
        };
      }
    },
    enabled: !!facilityAddress && !!moduleAddress,
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });

  // Format a number with commas
  const formatNumber = (value: string): string => {
    return parseInt(value, 10).toLocaleString();
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
                {facilityData.testBasketExists && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-500">Facility Tests</div>
                    <div
                      className={`text-sm font-medium flex items-center ${
                        facilityData.testsPass
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                          facilityData.testsPass ? "bg-green-500" : "bg-red-500"
                        }`}
                      ></span>
                      {facilityData.testsPass
                        ? "All Tests Passing"
                        : "Tests Failing"}
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
                  parseInt(facilityData.capitalCallRequestAmount) > 0 && (
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
                  parseInt(facilityData.recycleRequestAmount) > 0 && (
                    <div>
                      <div className="text-xs text-gray-500">
                        Pending Recycle Limit Request
                      </div>
                      <div className="text-sm font-medium text-purple-600">
                        {formatNumber(facilityData.recycleRequestAmount)}
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
                        {parseInt(facilityData.capitalCallTotalAmount) > 0
                          ? `${Math.round(
                              100 *
                                (1 -
                                  parseInt(
                                    facilityData.capitalCallAmountRemaining
                                  ) /
                                    parseInt(
                                      facilityData.capitalCallTotalAmount
                                    ))
                            )}%`
                          : "0%"}
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
