"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes, Network } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { UserRoleDisplay } from "@/components/user-role-display";
import { createAptosClient } from "@/lib/aptos-service";
import { useEffectiveNetwork } from "@/lib/hooks/use-effective-network";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

function BulkTransferContent() {
  const network = useEffectiveNetwork();
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(
    null
  );
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [recipientsText, setRecipientsText] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [editingAmount, setEditingAmount] = useState(false);

  const validAddresses = useMemo(() => {
    if (!recipientsText.trim()) return [];
    return recipientsText
      .split(/[,\n]+/)
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0 && addr.startsWith("0x"));
  }, [recipientsText]);

  const rawAmount = useMemo(() => {
    if (!tokenMetadata || !amountInput) return BigInt(0);
    return parseTokenAmount(amountInput, tokenMetadata.decimals);
  }, [amountInput, tokenMetadata]);

  useEffect(() => {
    const fetchTokenMetadata = async () => {
      if (!tokenAddress || !tokenAddress.startsWith("0x")) {
        setTokenMetadata(null);
        setMetadataError(null);
        return;
      }

      setIsLoadingMetadata(true);
      setMetadataError(null);

      try {
        const client = createAptosClient(network.name);

        const resource = await client.getAccountResource<{
          name: string;
          symbol: string;
          decimals: number;
        }>({
          accountAddress: tokenAddress,
          resourceType: "0x1::fungible_asset::Metadata",
        });

        setTokenMetadata({
          name: resource.name,
          symbol: resource.symbol,
          decimals: resource.decimals,
        });
      } catch (error) {
        console.error("Error fetching token metadata:", error);
        setMetadataError("Failed to fetch token metadata. Please check the address.");
        setTokenMetadata(null);
      } finally {
        setIsLoadingMetadata(false);
      }
    };

    const debounceTimer = setTimeout(fetchTokenMetadata, 500);
    return () => clearTimeout(debounceTimer);
  }, [tokenAddress, network.name]);

  const isMainnet = network.name === Network.MAINNET;

  const steps = useMemo(() => {
    if (!tokenMetadata || validAddresses.length === 0 || rawAmount === BigInt(0)) {
      return [];
    }

    return validAddresses.map((recipient) => ({
      title: `Transfer to ${recipient.slice(0, 8)}...${recipient.slice(-6)}`,
      description: `Send ${formatTokenAmount(rawAmount, tokenMetadata.decimals)} ${tokenMetadata.symbol}`,
      moduleAddress: "0x1",
      moduleName: "primary_fungible_store",
      functionName: "transfer",
      typeArguments: isMainnet ? [] : ["0x1::fungible_asset::Metadata"],
      args: isMainnet
        ? [recipient, rawAmount.toString()]
        : [tokenAddress, recipient, rawAmount.toString()],
    })) as {
      title: string;
      description: string;
      moduleAddress: string;
      moduleName: string;
      functionName: string;
      typeArguments: string[];
      args: EntryFunctionArgumentTypes[];
    }[];
  }, [tokenMetadata, validAddresses, rawAmount, tokenAddress, isMainnet]);

  const totalAmount = useMemo(() => {
    if (!tokenMetadata || validAddresses.length === 0 || rawAmount === BigInt(0)) {
      return BigInt(0);
    }
    return rawAmount * BigInt(validAddresses.length);
  }, [rawAmount, validAddresses.length, tokenMetadata]);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Bulk Token Transfer</h1>
        <div className="flex flex-col items-end gap-2">
          <WalletSelector />
          <UserRoleDisplay />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Token Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token-address">Token Address</Label>
            <Input
              id="token-address"
              type="text"
              placeholder="0x..."
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
          </div>

          {isLoadingMetadata && (
            <div className="text-sm text-muted-foreground">
              Loading token metadata...
            </div>
          )}

          {metadataError && (
            <div className="text-sm text-destructive">{metadataError}</div>
          )}

          {tokenMetadata && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <span className="font-medium">{tokenMetadata.name}</span>
              <Badge variant="secondary">{tokenMetadata.symbol}</Badge>
              <span className="text-sm text-muted-foreground">
                ({tokenMetadata.decimals} decimals)
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipients">
              Recipient Addresses (comma or newline separated)
            </Label>
            <textarea
              id="recipients"
              className="w-full min-h-[120px] p-3 border rounded-md bg-transparent text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={"0x123...\n0x456...\n0x789..."}
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Valid addresses:
            </span>
            <Badge variant={validAddresses.length > 0 ? "default" : "secondary"}>
              {validAddresses.length}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount per recipient
              {tokenMetadata && ` (${tokenMetadata.symbol})`}
            </Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              disabled={!tokenMetadata}
              value={
                editingAmount
                  ? amountInput
                  : amountInput && tokenMetadata
                  ? formatTokenAmount(rawAmount, tokenMetadata.decimals)
                  : amountInput
              }
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9.]/g, "");
                setAmountInput(value);
              }}
              onFocus={() => setEditingAmount(true)}
              onBlur={() => setEditingAmount(false)}
            />
          </div>

          {tokenMetadata && validAddresses.length > 0 && rawAmount > BigInt(0) && (
            <div className="p-3 bg-muted rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Per recipient:</span>
                <span className="font-medium">
                  {formatTokenAmount(rawAmount, tokenMetadata.decimals)}{" "}
                  {tokenMetadata.symbol}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipients:</span>
                <span className="font-medium">{validAddresses.length}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-1 mt-1">
                <span>Total:</span>
                <span>
                  {formatTokenAmount(totalAmount, tokenMetadata.decimals)}{" "}
                  {tokenMetadata.symbol}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {steps.length > 0 && (
        <TransactionStepper
          steps={steps}
          hideBatchMode={true}
          onComplete={() => {
            toast.success("Bulk Transfer Complete", {
              description: `Successfully transferred ${formatTokenAmount(
                totalAmount,
                tokenMetadata!.decimals
              )} ${tokenMetadata!.symbol} to ${validAddresses.length} recipients.`,
            });
          }}
        />
      )}

      {steps.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {!tokenMetadata
              ? "Enter a valid token address to get started"
              : validAddresses.length === 0
              ? "Add recipient addresses to continue"
              : "Enter an amount to transfer"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BulkTransferPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BulkTransferContent />
    </Suspense>
  );
}
