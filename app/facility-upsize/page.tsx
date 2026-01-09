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
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConfigPrompt } from "@/components/config-prompt";

const USDT_DECIMALS = 6;

function FacilityUpsizeContent() {
  const searchParams = useSearchParams();
  const { account } = useWallet();
  const [newSize, setNewSize] = useState<bigint>(BigInt(0));
  const [investorAddress, setInvestorAddress] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    newSize: "",
    investorAddress: "",
  });

  const facilityAddress = searchParams.get("facility");
  const moduleAddress = searchParams.get("module") || "0x1";

  useEffect(() => {
    const size = searchParams.get("size");
    const investor = searchParams.get("investor");

    if (size) setNewSize(parseTokenAmount(size, USDT_DECIMALS));
    if (investor) {
      setInvestorAddress(investor);
    } else if (account?.address) {
      setInvestorAddress(account.address.toString());
    }

    setIsLoading(false);
  }, [searchParams, account]);

  const steps = [
    {
      title: "Upsize Facility",
      description: `Upsize facility to ${formatTokenAmount(
        newSize,
        USDT_DECIMALS
      )} USDT`,
      moduleAddress: moduleAddress,
      moduleName: "basic_facility_harness",
      functionName: "upsize_facility",
      args: [
        investorAddress || account?.address.toString() || "",
        facilityAddress,
        newSize.toString(),
      ] as unknown as EntryFunctionArgumentTypes[],
    },
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!facilityAddress) {
    return (
      <ConfigPrompt
        missingFields={["facility"]}
        pageTitle="Facility Upsizing"
      />
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Facility Upsizing</h1>
        <div className="flex flex-col items-end gap-2">
          <WalletSelector />
          <UserRoleDisplay />
        </div>
      </div>

      <FacilityOverview
        facilityAddress={facilityAddress}
        moduleAddress={moduleAddress}
      />

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex">
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              <strong>Note:</strong> This operation requires that you are the
              sole investor in this facility. The facility size and your
              commitment will be updated to the new amount.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              New Facility Size (USDT)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={
                editingField === "newSize"
                  ? editValues.newSize
                  : formatTokenAmount(newSize, USDT_DECIMALS)
              }
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, "");
                setEditValues({ ...editValues, newSize: value });
                setNewSize(parseTokenAmount(value, USDT_DECIMALS));
              }}
              onFocus={() => {
                setEditingField("newSize");
                setEditValues({
                  ...editValues,
                  newSize:
                    newSize > 0
                      ? formatTokenAmount(newSize, USDT_DECIMALS)
                      : "",
                });
              }}
              onBlur={() => {
                setEditingField(null);
              }}
              placeholder="Enter new facility size (e.g., 500000)"
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter the new total facility size in USDT
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Investor Address
            </label>
            <input
              type="text"
              value={investorAddress}
              onChange={(e) => setInvestorAddress(e.target.value)}
              placeholder={
                account?.address
                  ? `Default: ${account.address.toString()}`
                  : "Enter investor address"
              }
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">
              The address of the investor (defaults to connected wallet)
            </p>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium mb-2">Summary</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">New Facility Size:</span>
              <span className="font-medium">
                {formatTokenAmount(newSize, USDT_DECIMALS)} USDT
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Investor:</span>
              <span className="font-mono text-xs">
                {investorAddress || account?.address.toString() || "Not connected"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <TransactionStepper
        steps={steps}
        onComplete={() => {
          toast.success("Facility Upsized", {
            description: `Facility has been successfully upsized to ${formatTokenAmount(
              newSize,
              USDT_DECIMALS
            )} USDT.`,
          });
        }}
        addressBook={{
          "0xa944c37b5ea1bda0d22cb1ead2e18a82ab8f577a7b6647b795225705a7a3a108":
            "Tiberia",
          "0x338235eb08a144f4a63966ba79be1fbc9acca5f268ac423700d63bdda48a77be":
            "Roda",
          facilityAddress: "Target Facility",
          [investorAddress || ""]: "Investor",
        }}
      />
    </div>
  );
}

export default function FacilityUpsizePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FacilityUpsizeContent />
    </Suspense>
  );
}