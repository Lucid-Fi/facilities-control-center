"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TransactionStepper } from "@/components/transaction-stepper";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimeInput } from "@/components/date-time-input";
import { TokenAmountInput } from "@/components/token-amount-input";
import { ConfigPrompt } from "@/components/config-prompt";
import { useLoanBookConfig } from "@/lib/hooks/use-loan-book-config";

const TOKEN_DECIMALS = 8;
const generateId = () => Math.random().toString(36).substr(2, 9);

interface PaymentInterval {
  id: string;
  time_due_us: number;
  principal: bigint;
  interest: bigint;
  fee: bigint;
}

function stringToHexBytes(str: string): string {
  const encoder = new TextEncoder();
  const byteArray = encoder.encode(str);
  return (
    "0x" +
    Array.from(byteArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

const paymentOrderOptions = [
  { label: "Principal, Interest, Fee", value: 9 },
  { label: "Interest, Fee, Principal", value: 36 },
  { label: "Fee, Interest, Principal", value: 24 },
];

function OfferLoanContent() {
  const searchParams = useSearchParams();

  const [loanBookAddress, setLoanBookAddress] = useState<string>("");
  const [seed, setSeed] = useState<string>("");
  const [borrowerAddress, setBorrowerAddress] = useState<string>("");
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentInterval[]>([]);
  const [paymentOrderBitmap, setPaymentOrderBitmap] = useState<number>(
    paymentOrderOptions[0].value
  ); // Default to PIF

  const [isLoading, setIsLoading] = useState(true);

  // Fetch the loan book config (owner and module address derived from loan book)
  const {
    loanBookConfig,
    isLoading: isLoadingConfig,
    error: configError,
  } = useLoanBookConfig({ loanBookAddress: loanBookAddress || undefined });

  useEffect(() => {
    const loanBookParam = searchParams.get("loan_book");

    if (loanBookParam) {
      setLoanBookAddress(loanBookParam);
    }
    setIsLoading(false);
  }, [searchParams]);

  const handleAddInterval = () => {
    const newId = generateId();
    setPaymentSchedule([
      ...paymentSchedule,
      {
        id: newId,
        time_due_us: 0,
        principal: BigInt(0),
        interest: BigInt(0),
        fee: BigInt(0),
      },
    ]);
  };

  const handleRemoveInterval = (id: string) => {
    setPaymentSchedule(
      paymentSchedule.filter((interval) => interval.id !== id)
    );
  };

  const handleIntervalChange = (
    id: string,
    field: keyof Omit<PaymentInterval, "id">,
    value: string | number | bigint
  ) => {
    console.log("handleIntervalChange", id, field, value);
    setPaymentSchedule(
      paymentSchedule.map((interval) => {
        if (interval.id === id) {
          let processedValue: string | number | bigint;
          if (field === "time_due_us") {
            processedValue = value as number;
          } else if (
            field === "principal" ||
            field === "interest" ||
            field === "fee"
          ) {
            processedValue = value as bigint;
          } else {
            processedValue = value as string;
          }
          return {
            ...interval,
            [field]: processedValue,
          };
        }
        return interval;
      })
    );
  };

  const transactionArgs = () => {
    if (!loanBookConfig?.configAddress) return [];
    return [
      loanBookConfig.configAddress,
      stringToHexBytes(seed),
      borrowerAddress,
      paymentSchedule.map((p) => p.time_due_us.toString()),
      paymentSchedule.map((p) => p.principal.toString()),
      paymentSchedule.map((p) => p.interest.toString()),
      paymentSchedule.map((p) => p.fee.toString()),
      paymentOrderBitmap.toString(),
      null, // fa_metadata
      null, // start_time_us
      null, // risk_score
    ] as unknown as EntryFunctionArgumentTypes[];
  };

  const steps = [
    {
      title: "Offer Loan",
      description: `Offer a new loan with seed: ${seed}`,
      moduleAddress: loanBookConfig?.moduleAddress || "",
      moduleName: "hybrid_loan_book",
      functionName: "offer_loan_simple",
      args: transactionArgs(),
    },
  ];

  if (isLoading) {
    return <div>Loading page parameters...</div>;
  }

  if (!loanBookAddress) {
    return (
      <ConfigPrompt
        missingFields={["loan_book"]}
        pageTitle="Offer Loan"
        onConfigured={(values) => {
          if (values.loan_book) {
            setLoanBookAddress(values.loan_book);
          }
        }}
      />
    );
  }

  if (isLoadingConfig) {
    return <div>Loading loan book configuration...</div>;
  }

  if (configError) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error Loading Loan Book</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to fetch loan book configuration: {configError.message}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Loan Book Address: {loanBookAddress}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Offer New Loan</h1>
        <WalletSelector />
      </div>

      {/* Loan Book Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Loan Book Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground">Loan Book:</span>
            <code className="text-xs bg-muted px-1 rounded">{loanBookAddress}</code>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground">Config Address (Owner):</span>
            <code className="text-xs bg-muted px-1 rounded">{loanBookConfig?.configAddress}</code>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground">Module Address:</span>
            <code className="text-xs bg-muted px-1 rounded">{loanBookConfig?.moduleAddress}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loan Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="seed">Loan Seed</Label>
            <Input
              id="seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g., my-unique-loan-123"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="borrowerAddress">Borrower Address</Label>
            <Input
              id="borrowerAddress"
              value={borrowerAddress}
              onChange={(e) => setBorrowerAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="paymentOrderBitmap">Payment Order</Label>
            <Select
              value={paymentOrderBitmap.toString()}
              onValueChange={(value: string) =>
                setPaymentOrderBitmap(parseInt(value, 10))
              }
            >
              <SelectTrigger id="paymentOrderBitmap">
                <SelectValue placeholder="Select payment order" />
              </SelectTrigger>
              <SelectContent>
                {paymentOrderOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value.toString()}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {paymentSchedule.map((interval, index) => (
            <div
              key={interval.id}
              className="p-4 border rounded-md space-y-3 relative"
            >
              <h4 className="font-semibold">Interval {index + 1}</h4>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRemoveInterval(interval.id)}
                className="absolute top-2 right-2"
              >
                Remove
              </Button>
              <div className="flex gap-6 flex-wrap">
                <div>
                  <DateTimeInput
                    id={`time_due_us_${interval.id}`}
                    label="Time Due"
                    value={interval.time_due_us}
                    onChange={(newMicrosecondValue) =>
                      handleIntervalChange(
                        interval.id,
                        "time_due_us",
                        newMicrosecondValue
                      )
                    }
                    description="Select the date and time when the payment is due."
                  />
                </div>
                <div className="flex flex-2 flex-col gap-4 flex-wrap">
                  <div>
                    <TokenAmountInput
                      label="Principal (8 decimals)"
                      onChange={(newValue) =>
                        handleIntervalChange(interval.id, "principal", newValue)
                      }
                      decimals={TOKEN_DECIMALS}
                      placeholder="e.g., 1000.00000000"
                    />
                  </div>
                  <div>
                    <TokenAmountInput
                      label="Interest (8 decimals)"
                      onChange={(newValue) =>
                        handleIntervalChange(interval.id, "interest", newValue)
                      }
                      decimals={TOKEN_DECIMALS}
                      placeholder="e.g., 50.00000000"
                    />
                  </div>
                  <div>
                    <TokenAmountInput
                      label="Fee (8 decimals)"
                      onChange={(newValue) =>
                        handleIntervalChange(interval.id, "fee", newValue)
                      }
                      decimals={TOKEN_DECIMALS}
                      placeholder="e.g., 10.00000000"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button onClick={handleAddInterval} size="sm">
            Add Payment Interval
          </Button>
        </CardFooter>
      </Card>

      <TransactionStepper
        steps={steps.map((step) => ({ ...step, args: transactionArgs() }))} // Ensure args are fresh
        onComplete={() => {
          toast.success("Loan Offer Process Complete", {
            description:
              "The loan offer transaction has been executed successfully.",
          });
        }}
        // addressBook={{ facilityAddress: "Roda Facility" }} // TODO: Add relevant addresses
      />
    </div>
  );
}

export default function OfferLoanPage() {
  return (
    <Suspense fallback={<div>Loading offer loan data...</div>}>
      <OfferLoanContent />
    </Suspense>
  );
}
