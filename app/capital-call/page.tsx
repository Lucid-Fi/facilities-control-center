"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { FacilityOverview } from "@/components/facility-overview";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { SimulationResult } from "@/lib/aptos-service";
import { SimulationResults } from "@/components/simulation-results";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimulationResultChange } from "@/lib/types/simulation"; // Import shared types
import { calculateEffectiveAdvanceRateString } from "@/lib/utils/simulationCalculations"; // Import utility function
import { useFacilityInfo } from "@/lib/hooks/use-facility-data";
import { Badge } from "@/components/ui/badge";
import { TokenAmountInput } from "@/components/token-amount-input";
import { UserRoleDisplay } from "@/components/user-role-display";
import { ConfigPrompt } from "@/components/config-prompt";

// Removed local interface definitions

function CapitalCallContent() {
  const searchParams = useSearchParams();

  const [requestedCapitalCall, setRequestedCapitalCall] = useState<bigint>(
    BigInt(0)
  );
  const [requestedRecycle, setRequestedRecycle] = useState<bigint>(BigInt(0));
  const [adjustedCollateral, setBorrowingBase] = useState<bigint>(BigInt(0));
  const [fillCapitalCall, setFillCapitalCall] = useState(true);
  const [advanceRate, setAdvanceRate] = useState<number>(0);
  const [underlyingToken, setUnderlyingToken] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // State to track which input is being edited (for raw value display)
  // const [editingField, setEditingField] = useState<string | null>(null);
  // const [editValues, setEditValues] = useState({
  // capitalCall: "",
  // recycle: "",
  // adjustedCollateral: "",
  // });

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  const {
    facilityData,
    isLoading: facilityLoading,
    error: facilityError,
  } = useFacilityInfo({
    facilityAddress: facilityAddress || undefined,
    moduleAddress: moduleAddress || undefined,
  });

  useEffect(() => {
    const capitalCall = searchParams.get("capital_call");
    const recycle = searchParams.get("recycle");
    const base = searchParams.get("adjusted_collateral");
    const advanceRateParam = searchParams.get("advance_rate");
    const underlyingToken = searchParams.get("underlying_token");

    if (capitalCall) setRequestedCapitalCall(parseTokenAmount(capitalCall, 6));
    if (recycle) setRequestedRecycle(parseTokenAmount(recycle, 6));
    if (base) setBorrowingBase(parseTokenAmount(base, 6));
    if (advanceRateParam) setAdvanceRate(parseFloat(advanceRateParam));
    if (underlyingToken) setUnderlyingToken(underlyingToken);
    setIsLoading(false);
  }, [searchParams]);

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
      title: "Attest Adjusted Collateral",
      description: `Attest adjusted collateral value of ${formatTokenAmount(
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
      title: "Forward Funds to Originator",
      description: "Triggers the escrow forward to the originator",
      moduleAddress: moduleAddress,
      moduleName: "escrow",
      functionName: "forward",
      args: [
        facilityData?.originator,
        underlyingToken,
        null,
      ] as unknown as EntryFunctionArgumentTypes[],
    },
  ].filter((step) => {
    if (step.title === "Approve Capital Call")
      return requestedCapitalCall > BigInt(0);
    if (step.title === "Approve Recycle") return requestedRecycle > BigInt(0);
    return true;
  });

  const renderCapitalCallSimulationDetails = (
    simulationResult: SimulationResult
  ) => {
    const effectiveAdvanceRate = calculateEffectiveAdvanceRateString(
      simulationResult.changes as SimulationResultChange[],
      facilityAddress,
      advanceRate // Pass the advanceRate state as fallback
    );

    const requiredAdvanceRateDisplay =
      advanceRate > 0
        ? (advanceRate * 100).toFixed(2) + "%"
        : "N/A (Not provided in URL)";

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
              <strong>Required Advance Rate (from URL):</strong>{" "}
              {requiredAdvanceRateDisplay}
            </div>
            <div>
              <strong>Effective Post-Funding Advance Rate:</strong>{" "}
              {effectiveAdvanceRate}
            </div>
            {/* You can add more custom details here based on simulationResult */}
          </div>
        </TabsContent>
      </Tabs>
    );
  };

  if (isLoading || facilityLoading) {
    return <div>Loading...</div>;
  }

  if (!facilityAddress) {
    return (
      <ConfigPrompt
        missingFields={["facility"]}
        pageTitle="Capital Call & Recycle"
      />
    );
  }

  if (facilityError) {
    return <div>Error loading facility data: {facilityError.message}</div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Capital Call & Recycle</h1>
        <div className="flex flex-col items-end gap-2">
          <WalletSelector />
          <UserRoleDisplay />
        </div>
      </div>

      <FacilityOverview
        facilityAddress={facilityAddress}
        moduleAddress={moduleAddress}
      />

      <div className="grid gap-4">
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
              label="Adjusted Collateral (USDT)"
              initialValue={adjustedCollateral}
              onChange={setBorrowingBase}
              decimals={6}
              placeholder="0.00"
            />
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
        <Badge variant="destructive">
          Borrowing Base:{" "}
          {(
            parseFloat(formatTokenAmount(adjustedCollateral, 6)) * advanceRate
          ).toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}
          USDT
        </Badge>
      </div>

      <TransactionStepper
        hideBatchMode={true}
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
        renderCustomSimulationResults={renderCapitalCallSimulationDetails}
      />
    </div>
  );
}

export default function CapitalCallPage() {
  return (
    <Suspense fallback={<div>Loading capital call data...</div>}>
      <CapitalCallContent />
    </Suspense>
  );
}
