"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenAmountInput } from "@/components/token-amount-input";
import { LoanOverview } from "@/components/loan-overview"; // Assuming this path is correct

const TOKEN_DECIMALS = 8; // Standard for many tokens, adjust if necessary

function RepayLoanContent() {
  const searchParams = useSearchParams();

  const [moduleAddress, setModuleAddress] = useState<string>("");
  const [loanAddress, setLoanAddress] = useState<string>("");
  const [repayAmount, setRepayAmount] = useState<bigint>(BigInt(0));

  const [isLoading, setIsLoading] = useState(true);
  const [showOverview, setShowOverview] = useState(false);

  useEffect(() => {
    const moduleParam = searchParams.get("module");
    if (moduleParam) {
      setModuleAddress(moduleParam);
    } else {
      console.warn("Module address not provided in query parameters.");
    }
    setIsLoading(false);
  }, [searchParams]);

  const handleLoanAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoanAddress(e.target.value);
    // Show overview only if there's a loan address
    setShowOverview(!!e.target.value.trim());
  };

  const transactionArgs = () => {
    if (!loanAddress || !moduleAddress) return [];
    // Ensure repayAmount is a string for the transaction
    return [
      loanAddress,
      repayAmount.toString(),
    ] as unknown as EntryFunctionArgumentTypes[];
  };

  const steps = [
    {
      title: "Repay Loan",
      description: `Repay loan at address: ${loanAddress}`,
      moduleAddress: moduleAddress,
      moduleName: "hybrid_loan_book",
      functionName: "repay_loan",
      args: transactionArgs(),
    },
  ];

  if (isLoading) {
    return <div>Loading page parameters...</div>;
  }

  if (!moduleAddress) {
    return (
      <div>
        Please provide a <code>module</code> address in the URL query
        parameters. Example: <code>?module=0x123...</code>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Repay Loan</h1>
        <WalletSelector />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repayment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="loanAddress">Loan Address</Label>
            <Input
              id="loanAddress"
              value={loanAddress}
              onChange={handleLoanAddressChange}
              placeholder="0x..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <TokenAmountInput
              label={`Amount to Repay (${TOKEN_DECIMALS} decimals)`}
              onChange={(newValue) => setRepayAmount(newValue)}
              decimals={TOKEN_DECIMALS}
              placeholder="e.g., 100.00000000"
            />
          </div>
          {showOverview && loanAddress && moduleAddress && (
            <div className="h-[2px] bg-muted rounded-full" />
          )}
          {showOverview && loanAddress && moduleAddress && (
            <LoanOverview
              loanAddress={loanAddress}
              moduleAddress={moduleAddress}
            />
          )}
        </CardContent>
        {/* CardFooter can be used for action buttons if needed outside TransactionStepper */}
      </Card>

      <TransactionStepper
        steps={steps.map((step) => ({ ...step, args: transactionArgs() }))} // Ensure args are fresh
        onComplete={() => {
          toast.success("Loan Repayment Process Complete", {
            description:
              "The loan repayment transaction has been executed successfully.",
          });
          // Optionally, reset form or redirect
          setLoanAddress("");
          setRepayAmount(BigInt(0));
          setShowOverview(false);
        }}
        // addressBook={{ ... }} // Add relevant addresses if needed by TransactionStepper
      />
    </div>
  );
}

export default function RepayLoanPage() {
  return (
    <Suspense fallback={<div>Loading repayment form...</div>}>
      <RepayLoanContent />
    </Suspense>
  );
}
