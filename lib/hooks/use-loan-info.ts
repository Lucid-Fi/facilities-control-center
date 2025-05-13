/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { createAptosClient } from "../aptos-service";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Aptos } from "@aptos-labs/ts-sdk";

// Define the structure for a single payment interval
export interface Interval {
  time_due_us: string;
  principal: string;
  interest: string;
  fee: string;
}

// Define the main data structure for loan information
export interface LoanData {
  loanAddress: string;
  loanBookAddress: string;
  faMetadataAddress: string;
  borrowerAddress: string;
  ownerAddress: string; // Owner of the Loan NFT
  startingPrincipal: string;
  startTimeUs: string;
  paymentCount: string;
  paymentSchedule: Interval[];
  paymentOrderBitmap: string;
  currentPaymentInstallment?: Interval;
  currentInstallmentFee: string;
  currentInstallmentInterest: string;
  currentInstallmentPrincipal: string;
  totalPrincipalRemaining: string;
  totalInterestRemaining: string;
  totalFeesRemaining: string;
  totalDebtRemaining: string;
  lateFeeAccrued: string;
  tenorRemainingUs: string; // Remaining time until the last payment due date
  maturityTimeUs: string; // Timestamp of the last payment due date (expiration)
  totalPaid: string;
  principalPaid: string;
  interestPaid: string;
  feesPaid: string;
}

interface UseLoanInfoProps {
  loanAddress?: string;
  moduleAddress?: string; // Address of the loan_book module
}

async function getLoanDetails(
  client: Aptos,
  loanAddress: string,
  moduleAddress: string
): Promise<
  | {
      loan_book: {
        inner: string;
      };
      fa_metadata: {
        inner: string;
      };
      borrower: string;
      starting_principal: string;
      start_time_us: string;
      payment_count: string;
      payment_schedule: Interval[];
      payment_order_bitmap: string;
    }
  | undefined
> {
  try {
    const loanResource = await client.account.getAccountResource({
      accountAddress: loanAddress,
      resourceType: `${moduleAddress}::loan_book::Loan`,
    });

    return loanResource;
  } catch (e) {
    console.error("Error fetching loan resource:", e);
    return undefined;
  }
}

export const useLoanInfo = ({
  loanAddress,
  moduleAddress,
}: UseLoanInfoProps) => {
  const { network } = useWallet();
  const {
    data: loanData,
    isLoading,
    error,
  } = useQuery<LoanData, Error>({
    queryKey: ["loanData", loanAddress, moduleAddress, network?.chainId],
    queryFn: async (): Promise<LoanData> => {
      if (!loanAddress) {
        throw new Error("Loan address is required");
      }
      if (!moduleAddress) {
        throw new Error("Module address is required");
      }
      if (!network?.name) {
        throw new Error("Network is required");
      }

      const client = createAptosClient(network.name);

      // Helper to extract value or return default, similar to useFacilityInfo
      const getValueOrDefault = <T, U>(
        result: PromiseSettledResult<T>,
        defaultValue: U,
        index = 0 // Default to taking the first element if the result is an array
      ): (T extends (infer R)[] ? R : T) | U => {
        if (result.status === "fulfilled") {
          if (Array.isArray(result.value)) {
            return index == -1
              ? (result.value as T extends (infer R)[] ? R : T)
              : result.value.length > index
              ? result.value[index]
              : defaultValue;
          }
          return result.value as T extends (infer R)[] ? R : T;
        }
        return defaultValue;
      };

      // Default error string
      const ERROR_STRING = "Error";

      // Fetch Loan resource first to get basic details
      let loanResource: any;
      try {
        try {
          loanResource = await client.account.getAccountResource({
            accountAddress: loanAddress,
            resourceType: `${moduleAddress}::loan_book::Loan`,
          });
          console.log("DEBUG: loanResource:", loanResource);
        } catch (e) {
          console.error("Error fetching loan resource:", e);
          // Return a minimal error state or throw, depending on desired handling for non-existent/inaccessible loans.
          throw new Error(
            `Failed to fetch loan resource at ${loanAddress}. Ensure the loan exists and the module address is correct.`
          );
        }

        const loanDetails = await getLoanDetails(
          client,
          loanAddress,
          moduleAddress
        );

        console.log({
          loanDetails,
        });

        let loanContributionTrackerResource: any;
        try {
          loanContributionTrackerResource =
            await client.account.getAccountResource({
              accountAddress: loanAddress,
              resourceType: `${moduleAddress}::loan_book::LoanContributionTracker`,
            });
        } catch (e) {
          console.warn(
            "LoanContributionTracker not found or error fetching:",
            e
          );
          // It's possible this resource doesn't exist for all loans or at all stages.
          loanContributionTrackerResource = { data: {} }; // Provide empty data to avoid undefined errors
        }

        const contributionDetails =
          (loanContributionTrackerResource?.data as {
            total_paid: string;
            fees_paid: string;
            principal_paid: string;
            interest_paid: string;
          }) || {};

        const results = await Promise.allSettled([
          // 0: Get FA Metadata (already in loanDetails, but can be fetched for consistency if needed)
          // client.view({ payload: { function: `${moduleAddress}::loan_book::get_fa_metadata`, typeArguments: [], functionArguments: [loanAddress] } }),

          // 0: Get Owner (of the loan NFT)
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_owner`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 1: Get Current Payment Installment
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_current_payment_installment`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 2: Get Current Payment Installment Fee
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_current_payment_installment_fee`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 3: Get Current Payment Installment Interest
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_current_payment_installment_interest`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 4: Get Current Payment Installment Principal
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_current_payment_installment_principal`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 5: Get Payment Schedule Summary (principal, interest, fees remaining)
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_payment_schedule_summary`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 6: Get Remaining Debt
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_remaining_debt`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 7: Get Late Fee
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_late_fee`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 8: Get Tenor (from loan address)
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_tenor_from_loan_address`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),

          // 9: Get Expire Time (maturity)
          client.view({
            payload: {
              function: `${moduleAddress}::loan_book::get_expire_time_us_from_loan_address`,
              typeArguments: [],
              functionArguments: [loanAddress],
            },
          }),
        ]);

        const ownerAddressResult = results[0];
        const currentPaymentInstallmentResult = results[1];
        const currentInstallmentFeeResult = results[2];
        const currentInstallmentInterestResult = results[3];
        const currentInstallmentPrincipalResult = results[4];
        const paymentScheduleSummaryResult = results[5]; // Array: [principal, interest, fees]
        const totalDebtRemainingResult = results[6];
        const lateFeeAccruedResult = results[7];
        const tenorRemainingUsResult = results[8];
        const maturityTimeUsResult = results[9];

        const paymentSummaryArray = getValueOrDefault(
          paymentScheduleSummaryResult,
          [ERROR_STRING, ERROR_STRING, ERROR_STRING],
          -1
        ) as string[];

        return {
          loanAddress: loanAddress,
          loanBookAddress:
            loanDetails?.loan_book?.inner.toString() ?? ERROR_STRING,
          faMetadataAddress:
            loanDetails?.fa_metadata?.inner.toString() ?? ERROR_STRING,
          borrowerAddress: loanDetails?.borrower?.toString() ?? ERROR_STRING,
          ownerAddress:
            getValueOrDefault(ownerAddressResult, ERROR_STRING)?.toString() ??
            ERROR_STRING,
          startingPrincipal:
            loanDetails?.starting_principal?.toString() ?? ERROR_STRING,
          startTimeUs: loanDetails?.start_time_us?.toString() ?? ERROR_STRING,
          paymentCount: loanDetails?.payment_count?.toString() ?? ERROR_STRING,
          paymentSchedule: (loanDetails?.payment_schedule || []).map((ps) => ({
            time_due_us: ps.time_due_us?.toString() ?? ERROR_STRING,
            principal: ps.principal?.toString() ?? ERROR_STRING,
            interest: ps.interest?.toString() ?? ERROR_STRING,
            fee: ps.fee?.toString() ?? ERROR_STRING,
          })),
          paymentOrderBitmap:
            loanDetails?.payment_order_bitmap?.toString() ?? ERROR_STRING,
          currentPaymentInstallment: getValueOrDefault(
            currentPaymentInstallmentResult,
            undefined
          ) as Interval | undefined,
          currentInstallmentFee:
            getValueOrDefault(
              currentInstallmentFeeResult,
              ERROR_STRING
            )?.toString() ?? ERROR_STRING,
          currentInstallmentInterest:
            getValueOrDefault(
              currentInstallmentInterestResult,
              ERROR_STRING
            )?.toString() ?? ERROR_STRING,
          currentInstallmentPrincipal:
            getValueOrDefault(
              currentInstallmentPrincipalResult,
              ERROR_STRING
            )?.toString() ?? ERROR_STRING,
          totalPrincipalRemaining:
            paymentSummaryArray[0]?.toString() ?? ERROR_STRING,
          totalInterestRemaining:
            paymentSummaryArray[1]?.toString() ?? ERROR_STRING,
          totalFeesRemaining:
            paymentSummaryArray[2]?.toString() ?? ERROR_STRING,
          totalDebtRemaining:
            getValueOrDefault(
              totalDebtRemainingResult,
              ERROR_STRING
            )?.toString() ?? ERROR_STRING,
          lateFeeAccrued:
            getValueOrDefault(lateFeeAccruedResult, ERROR_STRING)?.toString() ??
            ERROR_STRING,
          tenorRemainingUs:
            getValueOrDefault(
              tenorRemainingUsResult,
              ERROR_STRING
            )?.toString() ?? ERROR_STRING,
          maturityTimeUs:
            getValueOrDefault(maturityTimeUsResult, ERROR_STRING)?.toString() ??
            ERROR_STRING,
          totalPaid: contributionDetails.total_paid?.toString() ?? "0", // Default to 0 if not found
          principalPaid: contributionDetails.principal_paid?.toString() ?? "0",
          interestPaid: contributionDetails.interest_paid?.toString() ?? "0",
          feesPaid: contributionDetails.fees_paid?.toString() ?? "0",
        };
      } catch (e: any) {
        console.error("Error fetching loan data:", e);
        // Fallback with error states
        const errorReturn: LoanData = {
          loanAddress: loanAddress || "Unknown",
          loanBookAddress: ERROR_STRING,
          faMetadataAddress: ERROR_STRING,
          borrowerAddress: ERROR_STRING,
          ownerAddress: ERROR_STRING,
          startingPrincipal: ERROR_STRING,
          startTimeUs: ERROR_STRING,
          paymentCount: ERROR_STRING,
          paymentSchedule: [],
          paymentOrderBitmap: ERROR_STRING,
          currentInstallmentFee: ERROR_STRING,
          currentInstallmentInterest: ERROR_STRING,
          currentInstallmentPrincipal: ERROR_STRING,
          totalPrincipalRemaining: ERROR_STRING,
          totalInterestRemaining: ERROR_STRING,
          totalFeesRemaining: ERROR_STRING,
          totalDebtRemaining: ERROR_STRING,
          lateFeeAccrued: ERROR_STRING,
          tenorRemainingUs: ERROR_STRING,
          maturityTimeUs: ERROR_STRING,
          totalPaid: ERROR_STRING,
          principalPaid: ERROR_STRING,
          interestPaid: ERROR_STRING,
          feesPaid: ERROR_STRING,
        };
        return errorReturn;
      }
    },
    enabled: !!loanAddress && !!moduleAddress && !!network?.name,
    refetchInterval: 30000, // Consider adjusting based on how frequently loan data changes
    staleTime: 15000, // Consider adjusting
  });

  return { loanData, isLoading, error };
};
