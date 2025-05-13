"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { FacilityOverview } from "@/components/facility-overview";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { MonthPicker } from "@/components/ui/month-picker";
import { format } from "date-fns";
import { SimulationResult } from "@/lib/aptos-service";
import { SimulationResults } from "@/components/simulation-results";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimulationResultChange } from "@/lib/types/simulation";
import { calculateEffectiveAdvanceRateString } from "@/lib/utils/simulationCalculations";
import { TokenAmountInput } from "@/components/token-amount-input";
import { UserRoleDisplay } from "@/components/user-role-display";
import { useFacilityInfo } from "@/lib/hooks/use-facility-data";

function WaterfallContent() {
  const searchParams = useSearchParams();

  const [requestedCapitalCall, setRequestedCapitalCall] = useState<bigint>(
    BigInt(0)
  );
  const [requestedRecycle, setRequestedRecycle] = useState<bigint>(BigInt(0));
  const [adjustedCollateral, setBorrowingBase] = useState<bigint>(BigInt(0));
  const [fillCapitalCall, setFillCapitalCall] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() - 1, 1);
  });

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  // Calculate start and end timestamps for the selected month
  const getMonthTimestamps = (date: Date): [bigint, bigint] => {
    // Start timestamp: beginning of selected month
    const startDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const startTimestamp =
      BigInt(Math.floor(startDate.getTime() / 1000)) * BigInt(1000000);

    // End timestamp: beginning of next month
    const endDate = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );
    const endTimestamp =
      BigInt(Math.floor(endDate.getTime() / 1000)) * BigInt(1000000);

    return [startTimestamp, endTimestamp];
  };

  const [startTimestamp, endTimestamp] = getMonthTimestamps(selectedMonth);

  useEffect(() => {
    const capitalCall = searchParams.get("capital_call");
    const recycle = searchParams.get("recycle");
    const base = searchParams.get("adjusted_collateral");
    const month = searchParams.get("month"); // Format: YYYY-MM (e.g., 2025-05)

    if (capitalCall) setRequestedCapitalCall(parseTokenAmount(capitalCall, 6));
    if (recycle) setRequestedRecycle(parseTokenAmount(recycle, 6));
    if (base) setBorrowingBase(parseTokenAmount(base, 6));

    if (month) {
      try {
        const [year, monthIndex] = month.split("-").map(Number);
        if (
          !isNaN(year) &&
          !isNaN(monthIndex) &&
          monthIndex >= 1 &&
          monthIndex <= 12
        ) {
          // Month indexes are 0-based in JavaScript Date
          setSelectedMonth(new Date(year, monthIndex - 1, 1));
        }
      } catch (error) {
        console.error("Error parsing month from query params:", error);
      }
    }

    setIsLoading(false);
  }, [searchParams]);

  const { facilityData } = useFacilityInfo({
    facilityAddress: facilityAddress || undefined,
    moduleAddress: moduleAddress || undefined,
  });

  const steps = [
    {
      title: "Approve Capital Call",
      description: `Approve capital call of ${formatTokenAmount(
        requestedCapitalCall,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "facility_core",
      functionName: "respond_to_capital_call_request",
      args: [
        facilityAddress,
        requestedCapitalCall.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
    {
      title: "Approve Recycle",
      description: `Approve recycle of ${formatTokenAmount(
        requestedRecycle,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "facility_core",
      functionName: "respond_to_recycle_request",
      args: [
        facilityAddress,
        requestedRecycle.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
    {
      title: "Attest Collateral Value",
      description: `Attest collateral value of ${formatTokenAmount(
        adjustedCollateral,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "roda_test_harness",
      functionName: "update_attested_borrowing_base_value",
      args: [
        facilityAddress,
        adjustedCollateral.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
    {
      title: "Execute Principal Waterfall",
      description: `Execute principal waterfall (requested: ${formatTokenAmount(
        requestedCapitalCall + requestedRecycle,
        6
      )} USDT, available: ${
        facilityData?.principalCollectionBalance
          ? formatTokenAmount(
              BigInt(facilityData.principalCollectionBalance),
              6
            )
          : "..."
      } USDT)`,
      moduleAddress: moduleAddress,
      moduleName: "roda_test_harness",
      functionName: "run_principal_waterfall",
      args: [
        adjustedCollateral.toString(),
        facilityAddress,
        (requestedCapitalCall + requestedRecycle).toString(),
        fillCapitalCall,
      ] as unknown as EntryFunctionArgumentTypes[],
    },
    {
      title: "Execute Interest Waterfall",
      description: `Execute interest waterfall for ${format(
        selectedMonth,
        "MMMM yyyy"
      )}`,
      moduleAddress: moduleAddress,
      moduleName: "roda_test_harness",
      functionName: "execute_interest_waterfall",
      args: [
        facilityAddress,
        startTimestamp.toString(),
        endTimestamp.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
  ].filter((step) => {
    if (step.title === "Approve Capital Call")
      return requestedCapitalCall > BigInt(0);
    if (step.title === "Approve Recycle") return requestedRecycle > BigInt(0);
    return true;
  });

  const renderWaterfallSimulationDetails = (
    simulationResult: SimulationResult
  ) => {
    const effectiveAdvanceRate = calculateEffectiveAdvanceRateString(
      simulationResult.changes as SimulationResultChange[],
      facilityAddress,
      undefined // No specific URL param for fallback advance rate here
    );

    return (
      <Tabs defaultValue="standard" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="standard">Standard Results</TabsTrigger>
          <TabsTrigger value="custom">Advance Rate Details</TabsTrigger>
        </TabsList>
        <TabsContent value="standard">
          <SimulationResults
            result={simulationResult}
            isLoading={false}
            error={null}
          />
        </TabsContent>
        <TabsContent value="custom">
          <div className="p-4 space-y-2">
            <h3 className="text-lg font-semibold mb-2">Post-Funding Details</h3>
            <div>
              <strong>Effective Post-Funding Advance Rate:</strong>{" "}
              {effectiveAdvanceRate}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!facilityAddress) {
    return (
      <div>Please provide a facility address in the URL query parameters.</div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Waterfall Management</h1>
        <div className="flex flex-col items-end gap-2">
          <WalletSelector />
          <UserRoleDisplay />
        </div>
      </div>

      <FacilityOverview
        facilityAddress={facilityAddress}
        moduleAddress={moduleAddress}
      />

      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <TokenAmountInput
              label="Capital Call Amount (USDT)"
              initialValue={requestedCapitalCall}
              onChange={setRequestedCapitalCall}
              decimals={6}
              placeholder="0.00"
            />
          </div>
          <div>
            <TokenAmountInput
              label="Recycle Amount (USDT)"
              initialValue={requestedRecycle}
              onChange={setRequestedRecycle}
              decimals={6}
              placeholder="0.00"
            />
          </div>
          <div>
            <TokenAmountInput
              label="Collateral Value (USDT)"
              initialValue={adjustedCollateral}
              onChange={setBorrowingBase}
              decimals={6}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Month for Interest Waterfall
              </label>
              <MonthPicker
                month={selectedMonth}
                setMonth={(date) => date && setSelectedMonth(date)}
              />
              <div className="mt-2 text-xs text-gray-500">
                <div>
                  Start:{" "}
                  {format(
                    new Date(Number(startTimestamp / BigInt(1000000)) * 1000),
                    "yyyy-MM-dd HH:mm:ss"
                  )}
                </div>
                <div>
                  End:{" "}
                  {format(
                    new Date(Number(endTimestamp / BigInt(1000000)) * 1000),
                    "yyyy-MM-dd HH:mm:ss"
                  )}
                </div>
              </div>
            </div>
            {requestedCapitalCall > 0 && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={fillCapitalCall}
                  onChange={(e) => setFillCapitalCall(e.target.checked)}
                  className="mr-2"
                />
                <label className="text-sm font-medium">Fill Capital Call</label>
              </div>
            )}
          </div>
        </div>
      </div>

      <TransactionStepper
        steps={steps}
        onComplete={() => {
          toast.success("Process Complete", {
            description: "All transactions have been executed successfully.",
          });
        }}
        addressBook={{
          "0xa944c37b5ea1bda0d22cb1ead2e18a82ab8f577a7b6647b795225705a7a3a108":
            "Tiberia",
          "0x338235eb08a144f4a63966ba79be1fbc9acca5f268ac423700d63bdda48a77be":
            "Roda",
          facilityAddress: "Roda Facility",
        }}
        renderCustomSimulationResults={renderWaterfallSimulationDetails}
      />
    </div>
  );
}

export default function WaterfallPage() {
  return (
    <Suspense fallback={<div>Loading waterfall data...</div>}>
      <WaterfallContent />
    </Suspense>
  );
}
