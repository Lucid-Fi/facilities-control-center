/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFacilityInfo } from "@/lib/hooks/use-facility-data";

const DECIMAL_PLACES = process.env.NEXT_PUBLIC_TOKEN_DECIMALS
  ? parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS)
  : 6;

const adjustForDecimals = (value: string): string => {
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    return value;
  }
  return (num / Math.pow(10, DECIMAL_PLACES)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
};

export function FacilityOverview({
  facilityAddress,
  moduleAddress,
}: {
  facilityAddress: string;
  moduleAddress: string;
}) {
  const { facilityData, isLoading, error } = useFacilityInfo({
    facilityAddress,
    moduleAddress,
  });

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
                      ? adjustForDecimals(facilityData.facilitySize)
                      : "Unknown"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Minimum Draw</div>
                  <div className="text-sm font-medium">
                    {facilityData.minDraw
                      ? adjustForDecimals(facilityData.minDraw)
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
                    {adjustForDecimals(facilityData.maxCapitalCallAmount)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/10">
                    Max Recycle:{" "}
                    {adjustForDecimals(facilityData.maxRecycleAmount)}
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
                    {adjustForDecimals(
                      facilityData.outstandingPrincipal || "0"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">
                    Principal Collection Balance
                  </div>
                  <div className="text-sm font-medium">
                    {adjustForDecimals(facilityData.principalCollectionBalance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">
                    Interest Collection Balance
                  </div>
                  <div className="text-sm font-medium">
                    {adjustForDecimals(facilityData.interestCollectionBalance)}
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
                        {adjustForDecimals(
                          facilityData.capitalCallRequestAmount
                        )}
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
                        {adjustForDecimals(facilityData.recycleRequestAmount)}
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
                        {adjustForDecimals(facilityData.borrowingBase)}
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
                        {adjustForDecimals(facilityData.capitalCallTotalAmount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">
                        Remaining Amount
                      </div>
                      <div className="text-sm font-medium">
                        {adjustForDecimals(
                          facilityData.capitalCallAmountRemaining
                        )}
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
