"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { toast } from "sonner";
import { FacilityOverview } from "@/components/facility-overview";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";

export default function CapitalCallPage() {
  const searchParams = useSearchParams();

  const [requestedCapitalCall, setRequestedCapitalCall] = useState<bigint>(
    BigInt(0)
  );
  const [requestedRecycle, setRequestedRecycle] = useState<bigint>(BigInt(0));
  const [borrowingBase, setBorrowingBase] = useState<bigint>(BigInt(0));
  const [fillCapitalCall, setFillCapitalCall] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  useEffect(() => {
    const capitalCall = searchParams.get("capital_call");
    const recycle = searchParams.get("recycle");
    const base = searchParams.get("borrowing_base");

    if (capitalCall) setRequestedCapitalCall(parseTokenAmount(capitalCall, 6));
    if (recycle) setRequestedRecycle(parseTokenAmount(recycle, 6));
    if (base) setBorrowingBase(parseTokenAmount(base, 6));

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
      title: "Attest Borrowing Base",
      description: `Attest borrowing base of ${formatTokenAmount(
        borrowingBase,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "roda_test_harness",
      functionName: "update_attested_borrowing_base_value",
      args: [
        facilityAddress,
        borrowingBase.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
    {
      title: "Execute Principal Waterfall",
      description: `Execute waterfall with ${formatTokenAmount(
        requestedCapitalCall + requestedRecycle,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "roda_test_harness",
      functionName: "run_principal_waterfall",
      args: [
        borrowingBase.toString(),
        facilityAddress,
        (requestedCapitalCall + requestedRecycle).toString(),
        fillCapitalCall,
      ] as unknown as EntryFunctionArgumentTypes[],
    },
  ].filter((step) => {
    if (step.title === "Approve Capital Call")
      return requestedCapitalCall > BigInt(0);
    if (step.title === "Approve Recycle") return requestedRecycle > BigInt(0);
    return true;
  });

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
        <h1 className="text-3xl font-bold">Capital Call & Recycle</h1>
        <WalletSelector />
      </div>

      <FacilityOverview
        facilityAddress={facilityAddress}
        moduleAddress={moduleAddress}
      />

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Capital Call Amount (USDT)
            </label>
            <input
              type="number"
              value={formatTokenAmount(requestedCapitalCall, 6)}
              onChange={(e) =>
                setRequestedCapitalCall(parseTokenAmount(e.target.value, 6))
              }
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Recycle Amount (USDT)
            </label>
            <input
              type="number"
              value={formatTokenAmount(requestedRecycle, 6)}
              onChange={(e) =>
                setRequestedRecycle(parseTokenAmount(e.target.value, 6))
              }
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Borrowing Base (USDT)
            </label>
            <input
              type="number"
              value={formatTokenAmount(borrowingBase, 6)}
              onChange={(e) =>
                setBorrowingBase(parseTokenAmount(e.target.value, 6))
              }
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={fillCapitalCall}
              onChange={(e) => setFillCapitalCall(e.target.checked)}
              className="mr-2"
            />
            <label className="text-sm font-medium">Fill Capital Call</label>
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
      />
    </div>
  );
}
