"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLoanInfo } from "@/lib/hooks/use-loan-info"; // Assuming Interval is exported
import { Badge } from "@/components/ui/badge"; // For displaying statuses or tags

const DECIMAL_PLACES = process.env.NEXT_PUBLIC_TOKEN_DECIMALS
  ? parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS)
  : 6;

const adjustForDecimals = (value: string): string => {
  if (value === "Error" || value === "Unknown" || !value) {
    return value;
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    return value; // Return original if not a number after parsing attempt
  }
  return (num / Math.pow(10, DECIMAL_PLACES)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
};

const formatTimestamp = (timestampUs: string): string => {
  if (timestampUs === "Error" || !timestampUs || parseInt(timestampUs) === 0) {
    return "N/A";
  }
  const num = parseInt(timestampUs, 10);
  if (isNaN(num)) return "Invalid Date";
  return new Date(num / 1000).toLocaleString(); // Convert microseconds to milliseconds
};

const formatRemainingTime = (microseconds: string): string => {
  if (microseconds === "Error" || !microseconds) return "N/A";
  const us = parseInt(microseconds, 10);
  if (isNaN(us) || us === 0) return "N/A";

  if (us < 0) return "Past Due";

  const seconds = Math.floor(us / 1_000_000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day(s)`;
  if (hours > 0) return `${hours} hour(s)`;
  if (minutes > 0) return `${minutes} minute(s)`;
  return `${seconds} second(s)`;
};

export function LoanOverview({
  loanAddress,
  moduleAddress,
}: {
  loanAddress: string;
  moduleAddress: string;
}) {
  const { loanData, isLoading, error } = useLoanInfo({
    loanAddress,
    moduleAddress,
  });

  if (!loanAddress) {
    return (
      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle>Loan Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-500">
            Please provide a loan address to view details.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle>Loan Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <div className="animate-pulse">Loading loan data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-none shadow-none">
        <CardHeader>
          <CardTitle>Loan Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500">
            {error instanceof Error
              ? error.message
              : "Failed to load loan data"}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-none">
      <CardHeader>
        <CardTitle>Loan Details</CardTitle>
        <p className="text-xs text-gray-400 truncate">{loanAddress}</p>
      </CardHeader>
      <CardContent>
        {loanData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Column 1: Basic Info */}
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500">Loan Book Address</div>
                <div className="text-sm font-medium truncate">
                  {loanData.loanBookAddress}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Borrower Address</div>
                <div className="text-sm font-medium truncate">
                  {loanData.borrowerAddress}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Loan NFT Owner</div>
                <div className="text-sm font-medium truncate">
                  {loanData.ownerAddress}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">FA Metadata</div>
                <div className="text-sm font-medium truncate">
                  {loanData.faMetadataAddress}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">
                  Payment Order Bitmap
                </div>
                <div className="text-sm font-medium">
                  {loanData.paymentOrderBitmap}
                </div>
              </div>
            </div>

            {/* Column 2: Financial Status */}
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500">Starting Principal</div>
                <div className="text-sm font-medium">
                  {adjustForDecimals(loanData.startingPrincipal)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">
                  Total Debt Remaining
                </div>
                <div className="text-sm font-medium">
                  {adjustForDecimals(loanData.totalDebtRemaining)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Principal Remaining</div>
                <div className="text-sm font-medium">
                  {adjustForDecimals(loanData.totalPrincipalRemaining)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Interest Remaining</div>
                <div className="text-sm font-medium">
                  {adjustForDecimals(loanData.totalInterestRemaining)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Fees Remaining</div>
                <div className="text-sm font-medium">
                  {adjustForDecimals(loanData.totalFeesRemaining)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Late Fee Accrued</div>
                <div className="text-sm font-medium text-red-500">
                  {adjustForDecimals(loanData.lateFeeAccrued)}
                </div>
              </div>
            </div>

            {/* Column 3: Timeline & Contributions */}
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500">Start Time</div>
                <div className="text-sm font-medium">
                  {formatTimestamp(loanData.startTimeUs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Maturity Time</div>
                <div className="text-sm font-medium">
                  {formatTimestamp(loanData.maturityTimeUs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Tenor Remaining</div>
                <div className="text-sm font-medium">
                  {formatRemainingTime(loanData.tenorRemainingUs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Payment Count</div>
                <div className="text-sm font-medium">
                  {loanData.paymentCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">
                  Total Paid by Borrower
                </div>
                <div className="text-sm font-medium bg-green-50 p-1 rounded">
                  {adjustForDecimals(loanData.totalPaid)}
                </div>
              </div>
              <div className="pl-2 text-xs">
                <div>
                  Principal Paid: {adjustForDecimals(loanData.principalPaid)}
                </div>
                <div>
                  Interest Paid: {adjustForDecimals(loanData.interestPaid)}
                </div>
                <div>Fees Paid: {adjustForDecimals(loanData.feesPaid)}</div>
              </div>
            </div>

            {/* Current Installment Details - Spanning full width if needed or as a new section */}
            {loanData.currentPaymentInstallment && (
              <div className="md:col-span-2 lg:col-span-3 mt-4 pt-4 border-t">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Current Due Installment
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Due Date</div>
                    <div className="text-sm font-medium">
                      {formatTimestamp(
                        loanData.currentPaymentInstallment.time_due_us
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Principal</div>
                    <div className="text-sm font-medium">
                      {adjustForDecimals(
                        loanData.currentPaymentInstallment.principal
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Interest</div>
                    <div className="text-sm font-medium">
                      {adjustForDecimals(
                        loanData.currentPaymentInstallment.interest
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Fee</div>
                    <div className="text-sm font-medium">
                      {adjustForDecimals(
                        loanData.currentPaymentInstallment.fee
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Schedule Table - Spanning full width */}
            {loanData.paymentSchedule &&
              loanData.paymentSchedule.length > 0 && (
                <div className="md:col-span-2 lg:col-span-3 mt-4 pt-4 border-t">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Full Payment Schedule
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Due Date
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Principal
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Interest
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fee
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loanData.paymentSchedule.map((interval, index) => {
                          const isCurrent =
                            loanData.currentPaymentInstallment?.time_due_us ===
                              interval.time_due_us &&
                            loanData.currentPaymentInstallment?.principal ===
                              interval.principal &&
                            loanData.currentPaymentInstallment?.interest ===
                              interval.interest &&
                            loanData.currentPaymentInstallment?.fee ===
                              interval.fee;
                          const isPaid =
                            parseInt(interval.principal) === 0 &&
                            parseInt(interval.interest) === 0 &&
                            parseInt(interval.fee) === 0;
                          const isUpcoming =
                            !isPaid &&
                            !isCurrent &&
                            loanData.maturityTimeUs &&
                            parseInt(loanData.maturityTimeUs) > 0 &&
                            interval.time_due_us &&
                            parseInt(interval.time_due_us) * 1000 >
                              Date.now() &&
                            loanData.startTimeUs &&
                            parseInt(loanData.startTimeUs) > 0 &&
                            parseInt(interval.time_due_us) >
                              parseInt(loanData.startTimeUs);

                          return (
                            <tr
                              key={index}
                              className={`${
                                isCurrent
                                  ? "bg-blue-50"
                                  : isPaid
                                  ? "bg-green-50 line-through"
                                  : ""
                              }`}
                            >
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                {formatTimestamp(interval.time_due_us)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                {adjustForDecimals(interval.principal)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                {adjustForDecimals(interval.interest)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                {adjustForDecimals(interval.fee)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                {isCurrent && (
                                  <Badge
                                    variant="default"
                                    className="bg-blue-500"
                                  >
                                    Current
                                  </Badge>
                                )}
                                {isPaid && (
                                  <Badge
                                    variant="default"
                                    className="bg-green-500"
                                  >
                                    Paid
                                  </Badge>
                                )}
                                {!isCurrent &&
                                  !isPaid &&
                                  interval.time_due_us &&
                                  parseInt(interval.time_due_us) * 1000 <
                                    Date.now() &&
                                  (parseInt(interval.principal) > 0 ||
                                    parseInt(interval.interest) > 0 ||
                                    parseInt(interval.fee) > 0) && (
                                    <Badge variant="destructive">
                                      Past Due
                                    </Badge>
                                  )}
                                {isUpcoming && (
                                  <Badge variant="outline">Upcoming</Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="text-gray-500">No loan data available.</div>
        )}
      </CardContent>
    </Card>
  );
}
