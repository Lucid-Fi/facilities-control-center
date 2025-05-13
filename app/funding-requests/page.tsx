"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { FacilityOverview } from "@/components/facility-overview";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { TokenAmountInput } from "@/components/token-amount-input";
import { UserRoleDisplay } from "@/components/user-role-display";

function FundingRequestsContent() {
  const searchParams = useSearchParams();

  const [requestedCapitalCallAmount, setRequestedCapitalCallAmount] =
    useState<bigint>(BigInt(0));
  const [requestedRecycleAmount, setRequestedRecycleAmount] = useState<bigint>(
    BigInt(0)
  );
  const [isLoading, setIsLoading] = useState(true);

  // State to track which input is being edited (for raw value display)
  // const [editingField, setEditingField] = useState<string | null>(null);
  // const [editValues, setEditValues] = useState({
  //   capitalCall: "",
  //   recycle: ""
  // });

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  useEffect(() => {
    const capitalCall = searchParams.get("capital_call");
    const recycle = searchParams.get("recycle");

    if (capitalCall)
      setRequestedCapitalCallAmount(parseTokenAmount(capitalCall, 6));
    if (recycle) setRequestedRecycleAmount(parseTokenAmount(recycle, 6));

    setIsLoading(false);
  }, [searchParams]);

  // Create steps for the transaction stepper based on the values
  const steps = [];

  // Step 1: Add Capital Call Request if needed
  if (requestedCapitalCallAmount > BigInt(0)) {
    steps.push({
      title: "Initiate Capital Call Request",
      description: `Request capital call of ${formatTokenAmount(
        requestedCapitalCallAmount,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "facility_core",
      functionName: "create_capital_call_request",
      args: [
        facilityAddress,
        requestedCapitalCallAmount.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    });
  }

  // Step 2: Add Recycle Request if needed
  if (requestedRecycleAmount > BigInt(0)) {
    steps.push({
      title: "Initiate Recycle Request",
      description: `Request recycle of ${formatTokenAmount(
        requestedRecycleAmount,
        6
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "facility_core",
      functionName: "create_recycle_request",
      args: [
        facilityAddress,
        requestedRecycleAmount.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    });
  }

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
        <h1 className="text-3xl font-bold">Funding Requests</h1>
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
            {/* <label className="block text-sm font-medium mb-2">
              Capital Call Request Amount (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={editingField === 'capitalCall' 
                ? editValues.capitalCall 
                : formatTokenAmount(requestedCapitalCallAmount, 6)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setEditValues({...editValues, capitalCall: value});
                setRequestedCapitalCallAmount(parseTokenAmount(value, 6));
              }}
              onFocus={() => {
                setEditingField('capitalCall');
                setEditValues({
                  ...editValues, 
                  capitalCall: requestedCapitalCallAmount > 0 
                    ? formatTokenAmount(requestedCapitalCallAmount, 6) 
                    : ""
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              className="w-full p-2 border rounded"
            /> */}
            <TokenAmountInput
              label="Capital Call Request Amount (USDT)"
              initialValue={requestedCapitalCallAmount}
              onChange={setRequestedCapitalCallAmount}
              decimals={6}
              placeholder="0.00"
            />
          </div>
          <div>
            {/* <label className="block text-sm font-medium mb-2">
              Recycle Request Amount (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={editingField === 'recycle' 
                ? editValues.recycle 
                : formatTokenAmount(requestedRecycleAmount, 6)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setEditValues({...editValues, recycle: value});
                setRequestedRecycleAmount(parseTokenAmount(value, 6));
              }}
              onFocus={() => {
                setEditingField('recycle');
                setEditValues({
                  ...editValues, 
                  recycle: requestedRecycleAmount > 0 
                    ? formatTokenAmount(requestedRecycleAmount, 6) 
                    : ""
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              className="w-full p-2 border rounded"
            /> */}
            <TokenAmountInput
              label="Recycle Request Amount (USDT)"
              initialValue={requestedRecycleAmount}
              onChange={setRequestedRecycleAmount}
              decimals={6}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {steps.length > 0 && (
        <TransactionStepper
          steps={steps}
          onComplete={() => {
            toast.success("Funding Requests Submitted", {
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
      )}
      {steps.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-blue-700">
          <p className="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                clipRule="evenodd"
              />
            </svg>
            Enter the requested amount for Capital Call or Recycle to initiate a
            funding request.
          </p>
        </div>
      )}
    </div>
  );
}

export default function FundingRequestsPage() {
  return (
    <Suspense fallback={<div>Loading funding requests data...</div>}>
      <FundingRequestsContent />
    </Suspense>
  );
}
