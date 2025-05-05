"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { FacilityOverview } from "@/components/facility-overview";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/month-picker";
import { format } from "date-fns";

function WaterfallContent() {
  const searchParams = useSearchParams();

  const [requestedCapitalCall, setRequestedCapitalCall] = useState<bigint>(
    BigInt(0)
  );
  const [requestedRecycle, setRequestedRecycle] = useState<bigint>(BigInt(0));
  const [borrowingBase, setBorrowingBase] = useState<bigint>(BigInt(0));
  const [fillCapitalCall, setFillCapitalCall] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  
  // State to track which input is being edited (for raw value display)
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    capitalCall: "",
    recycle: "",
    borrowingBase: "",
    waterfallAmount: ""
  });

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  // Calculate start and end timestamps for the selected month
  const getMonthTimestamps = (date: Date): [bigint, bigint] => {
    // Start timestamp: beginning of selected month
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    const startTimestamp = BigInt(Math.floor(startDate.getTime() / 1000)) * BigInt(1000000);
    
    // End timestamp: beginning of next month
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
    const endTimestamp = BigInt(Math.floor(endDate.getTime() / 1000)) * BigInt(1000000);
    
    return [startTimestamp, endTimestamp];
  };

  const [startTimestamp, endTimestamp] = getMonthTimestamps(selectedMonth);

  useEffect(() => {
    const capitalCall = searchParams.get("capital_call");
    const recycle = searchParams.get("recycle");
    const base = searchParams.get("borrowing_base");
    const month = searchParams.get("month"); // Format: YYYY-MM (e.g., 2025-05)

    if (capitalCall) setRequestedCapitalCall(parseTokenAmount(capitalCall, 6));
    if (recycle) setRequestedRecycle(parseTokenAmount(recycle, 6));
    if (base) setBorrowingBase(parseTokenAmount(base, 6));
    
    if (month) {
      try {
        const [year, monthIndex] = month.split("-").map(Number);
        if (!isNaN(year) && !isNaN(monthIndex) && monthIndex >= 1 && monthIndex <= 12) {
          // Month indexes are 0-based in JavaScript Date
          setSelectedMonth(new Date(year, monthIndex - 1, 1));
        }
      } catch (error) {
        console.error("Error parsing month from query params:", error);
      }
    }

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
    {
      title: "Execute Interest Waterfall",
      description: `Execute interest waterfall for ${format(selectedMonth, 'MMMM yyyy')}`,
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
        <WalletSelector />
      </div>

      <FacilityOverview
        facilityAddress={facilityAddress}
        moduleAddress={moduleAddress}
      />

      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Capital Call Amount (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={editingField === 'capitalCall' 
                ? editValues.capitalCall 
                : formatTokenAmount(requestedCapitalCall, 6)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setEditValues({...editValues, capitalCall: value});
                setRequestedCapitalCall(parseTokenAmount(value, 6));
              }}
              onFocus={() => {
                setEditingField('capitalCall');
                setEditValues({
                  ...editValues, 
                  capitalCall: requestedCapitalCall > 0 
                    ? formatTokenAmount(requestedCapitalCall, 6) 
                    : ""
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Recycle Amount (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={editingField === 'recycle' 
                ? editValues.recycle 
                : formatTokenAmount(requestedRecycle, 6)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setEditValues({...editValues, recycle: value});
                setRequestedRecycle(parseTokenAmount(value, 6));
              }}
              onFocus={() => {
                setEditingField('recycle');
                setEditValues({
                  ...editValues, 
                  recycle: requestedRecycle > 0 
                    ? formatTokenAmount(requestedRecycle, 6) 
                    : ""
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              Borrowing Base (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={editingField === 'borrowingBase' 
                ? editValues.borrowingBase 
                : formatTokenAmount(borrowingBase, 6)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setEditValues({...editValues, borrowingBase: value});
                setBorrowingBase(parseTokenAmount(value, 6));
              }}
              onFocus={() => {
                setEditingField('borrowingBase');
                setEditValues({
                  ...editValues, 
                  borrowingBase: borrowingBase > 0 
                    ? formatTokenAmount(borrowingBase, 6) 
                    : ""
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="fill-capital-call"
                checked={fillCapitalCall}
                onCheckedChange={setFillCapitalCall}
              />
              <Label htmlFor="fill-capital-call">Fill Capital Call</Label>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Month for Interest Waterfall
              </label>
              <MonthPicker
                month={selectedMonth}
                setMonth={(date) => date && setSelectedMonth(date)}
              />
              <div className="mt-2 text-xs text-gray-500">
                <div>Start: {format(new Date(Number(startTimestamp / BigInt(1000000)) * 1000), 'yyyy-MM-dd HH:mm:ss')}</div>
                <div>End: {format(new Date(Number(endTimestamp / BigInt(1000000)) * 1000), 'yyyy-MM-dd HH:mm:ss')}</div>
              </div>
            </div>
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