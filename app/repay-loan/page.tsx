"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { TransactionStepper } from "@/components/transaction-stepper";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenAmountInput } from "@/components/token-amount-input";
import { LoanOverview } from "@/components/loan-overview"; // Assuming this path is correct
import { ConfigPrompt } from "@/components/config-prompt";

const TOKEN_DECIMALS = 8; // Standard for many tokens, adjust if necessary

// Animation variants for the card
const cardVariants = {
  hidden: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    overflow: "hidden",
  },
  visible: {
    opacity: 1,
    height: "auto",
    marginTop: "1rem",
    marginBottom: "1rem",
    overflow: "visible",
  },
};

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
    const newLoanAddress = e.target.value;
    setLoanAddress(newLoanAddress);
    // Show overview only if there's a loan address and it's different from the previous one or if it was previously hidden
    setShowOverview(!!newLoanAddress.trim());
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
      <ConfigPrompt
        missingFields={["module"]}
        pageTitle="Repay Loan"
        onConfigured={(values) => {
          if (values.module) {
            setModuleAddress(values.module);
          }
        }}
      />
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
          {/* Animated section for LoanOverview */}
          <motion.div
            initial="hidden"
            animate={
              showOverview && loanAddress && moduleAddress
                ? "visible"
                : "hidden"
            }
            variants={cardVariants}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ overflow: "hidden" }} // Keep overflow hidden during animation
          >
            {showOverview && loanAddress && moduleAddress && (
              <div className="mt-4">
                {" "}
                {/* Added margin top for spacing when visible */}
                <div className="h-[2px] bg-muted rounded-full mb-4" />
                <LoanOverview
                  loanAddress={loanAddress}
                  moduleAddress={moduleAddress}
                />
              </div>
            )}
          </motion.div>
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
