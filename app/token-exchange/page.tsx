"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { FacilityOverview } from "@/components/facility-overview";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { UserRoleDisplay } from "@/components/user-role-display";

// Constants for decimal places
const ZVT_DECIMALS = 8;
const USDT_DECIMALS = 6;

function TokenExchangeContent() {
  const searchParams = useSearchParams();
  const [amountTarget, setAmountTarget] = useState<bigint>(BigInt(0));
  const [interestAmountTarget, setInterestAmountTarget] = useState<bigint>(
    BigInt(0)
  );
  const [conversionRate, setConversionRate] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // State to track which input is being edited (for raw value display)
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    amountTarget: "",
    interestAmountTarget: "",
    conversionRate: "",
  });

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  useEffect(() => {
    const amount = searchParams.get("amount");
    const rate = searchParams.get("rate");

    if (amount) setAmountTarget(parseTokenAmount(amount, USDT_DECIMALS));
    if (rate) setConversionRate(rate);

    setIsLoading(false);
  }, [searchParams]);

  // Convert decimal rate to numerator/denominator
  const getConversionRateParts = (rate: string): [bigint, bigint] => {
    if (!rate) return [BigInt(0), BigInt(1)];

    const [whole, decimal] = rate.split(".");
    const decimalPlaces = decimal?.length || 0;
    // Adjust for ZVT's 8 decimals vs USDT's 6 decimals
    const adjustedDecimalPlaces =
      decimalPlaces + (ZVT_DECIMALS - USDT_DECIMALS);
    const denominator = BigInt(10) ** BigInt(adjustedDecimalPlaces);
    const numerator =
      BigInt(whole + (decimal || "0")) *
      BigInt(10) ** BigInt(ZVT_DECIMALS - USDT_DECIMALS);

    return [numerator, denominator];
  };

  const [rateNumerator, rateDenominator] =
    getConversionRateParts(conversionRate);

  const steps = [
    {
      title: "Exchange Tokens",
      description: `Exchange ${formatTokenAmount(
        amountTarget,
        USDT_DECIMALS
      )} USDT Principal and ${formatTokenAmount(
        interestAmountTarget,
        USDT_DECIMALS
      )} USDT Interest using rate ${conversionRate}`,
      moduleAddress: moduleAddress,
      moduleName: "roda_test_harness",
      functionName: "exchange_tokens_by_rate",
      args: [
        facilityAddress,
        amountTarget.toString(),
        interestAmountTarget.toString(),
        rateNumerator.toString(),
        rateDenominator.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
  ];

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
        <h1 className="text-3xl font-bold">Token Exchange</h1>
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
            <label className="block text-sm font-medium mb-2">
              Principal Amount (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={
                editingField === "amountTarget"
                  ? editValues.amountTarget
                  : formatTokenAmount(amountTarget, USDT_DECIMALS)
              }
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, "");
                setEditValues({ ...editValues, amountTarget: value });
                setAmountTarget(parseTokenAmount(value, USDT_DECIMALS));
              }}
              onFocus={() => {
                setEditingField("amountTarget");
                setEditValues({
                  ...editValues,
                  amountTarget:
                    amountTarget > 0
                      ? formatTokenAmount(amountTarget, USDT_DECIMALS)
                      : "",
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
              Interest Amount (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={
                editingField === "interestAmountTarget"
                  ? editValues.interestAmountTarget
                  : formatTokenAmount(interestAmountTarget, USDT_DECIMALS)
              }
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, "");
                setEditValues({ ...editValues, interestAmountTarget: value });
                setInterestAmountTarget(parseTokenAmount(value, USDT_DECIMALS));
              }}
              onFocus={() => {
                setEditingField("interestAmountTarget");
                setEditValues({
                  ...editValues,
                  interestAmountTarget:
                    interestAmountTarget > 0
                      ? formatTokenAmount(interestAmountTarget, USDT_DECIMALS)
                      : "",
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
              Conversion Rate (COP / USD)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={
                editingField === "conversionRate"
                  ? editValues.conversionRate
                  : conversionRate
              }
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, "");
                setEditValues({ ...editValues, conversionRate: value });
                setConversionRate(value);
              }}
              onFocus={() => {
                setEditingField("conversionRate");
                setEditValues({
                  ...editValues,
                  conversionRate: conversionRate || "",
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
      </div>

      <TransactionStepper
        steps={steps}
        onComplete={() => {
          toast.success("Exchange Complete", {
            description: "Token exchange has been executed successfully.",
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

export default function TokenExchangePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TokenExchangeContent />
    </Suspense>
  );
}
