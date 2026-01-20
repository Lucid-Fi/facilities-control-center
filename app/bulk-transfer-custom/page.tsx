"use client";

import { useState, useEffect, useMemo, Suspense, useCallback } from "react";
import { TransactionStepper } from "@/components/transaction-stepper";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";
import { WalletSelector } from "@/components/wallet-selector";
import { EntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { UserRoleDisplay } from "@/components/user-role-display";
import { createAptosClient } from "@/lib/aptos-service";
import { useEffectiveNetwork } from "@/lib/hooks/use-effective-network";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, Upload } from "lucide-react";

const BULK_TRANSFER_MODULE =
  "0x4d099259771bd0ec259353e06b0d2bd5f5e03141a56adb066a71ec64bd2b50c9";

interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

interface TransferEntry {
  id: string;
  wallet: string;
  amount: string;
}

function CustomBulkTransferContent() {
  const network = useEffectiveNetwork();
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const [csvText, setCsvText] = useState("");
  const [manualWallet, setManualWallet] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [transfers, setTransfers] = useState<TransferEntry[]>([]);

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

  const parseCsvEntries = useCallback((text: string): TransferEntry[] => {
    if (!text.trim()) return [];
    
    const lines = text.split(/[\n]+/).filter(line => line.trim());
    const entries: TransferEntry[] = [];
    
    for (const line of lines) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length >= 2) {
        const wallet = parts[0];
        const amount = parts[1];
        if (wallet.startsWith("0x") && amount && !isNaN(parseFloat(amount))) {
          entries.push({
            id: `csv-${wallet}-${amount}-${Math.random().toString(36).slice(2)}`,
            wallet,
            amount,
          });
        }
      }
    }
    
    return entries;
  }, []);

  const handleImportCsv = useCallback(() => {
    const newEntries = parseCsvEntries(csvText);
    if (newEntries.length === 0) {
      toast.error("No valid entries found", {
        description: "Format: wallet,amount (one per line)",
      });
      return;
    }
    
    setTransfers(prev => [...prev, ...newEntries]);
    setCsvText("");
    toast.success(`Imported ${newEntries.length} entries`);
  }, [csvText, parseCsvEntries]);

  const handleAddManual = useCallback(() => {
    if (!manualWallet.startsWith("0x")) {
      toast.error("Invalid wallet address");
      return;
    }
    if (!manualAmount || isNaN(parseFloat(manualAmount))) {
      toast.error("Invalid amount");
      return;
    }

    setTransfers(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        wallet: manualWallet,
        amount: manualAmount,
      },
    ]);
    setManualWallet("");
    setManualAmount("");
  }, [manualWallet, manualAmount]);

  const handleRemoveTransfer = useCallback((id: string) => {
    setTransfers(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setTransfers([]);
  }, []);

  const totalAmount = useMemo(() => {
    if (!tokenMetadata || transfers.length === 0) return BigInt(0);
    
    return transfers.reduce((sum, t) => {
      const raw = parseTokenAmount(t.amount, tokenMetadata.decimals);
      return sum + raw;
    }, BigInt(0));
  }, [transfers, tokenMetadata]);

  const steps = useMemo(() => {
    if (!tokenMetadata || transfers.length === 0) return [];

    const recipients = transfers.map(t => t.wallet);
    const fas = transfers.map(() => tokenAddress);
    const amounts = transfers.map(t =>
      parseTokenAmount(t.amount, tokenMetadata.decimals).toString()
    );

    return [
      {
        title: `Custom Bulk Transfer to ${transfers.length} recipients`,
        description: `Total: ${formatTokenAmount(totalAmount, tokenMetadata.decimals)} ${tokenMetadata.symbol}`,
        moduleAddress: BULK_TRANSFER_MODULE,
        moduleName: "bulk_transfers",
        functionName: "custom_bulk_transfer",
        typeArguments: [] as string[],
        args: [fas, recipients, amounts] as unknown as EntryFunctionArgumentTypes[],
      },
    ];
  }, [tokenMetadata, transfers, tokenAddress, totalAmount]);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Custom Bulk Transfer</h1>
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
          <CardTitle>Import from CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-input">
              Paste CSV data (wallet,amount per line)
            </Label>
            <textarea
              id="csv-input"
              className="w-full min-h-[120px] p-3 border rounded-md bg-transparent text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder={"0x123...,100.5\n0x456...,200\n0x789...,50.25"}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>
          <Button
            onClick={handleImportCsv}
            disabled={!csvText.trim()}
            variant="secondary"
          >
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="manual-wallet">Wallet Address</Label>
              <Input
                id="manual-wallet"
                type="text"
                placeholder="0x..."
                value={manualWallet}
                onChange={(e) => setManualWallet(e.target.value)}
              />
            </div>
            <div className="w-40 space-y-2">
              <Label htmlFor="manual-amount">
                Amount{tokenMetadata && ` (${tokenMetadata.symbol})`}
              </Label>
              <Input
                id="manual-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={manualAmount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, "");
                  setManualAmount(value);
                }}
              />
            </div>
            <Button onClick={handleAddManual} disabled={!manualWallet || !manualAmount}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Transfer List</CardTitle>
          {transfers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              Clear All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No transfers added yet. Import from CSV or add manually.
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {transfers.map((transfer, index) => (
                <div
                  key={transfer.id}
                  className="flex items-center gap-4 p-3 bg-muted rounded-md"
                >
                  <span className="text-sm text-muted-foreground w-8">
                    {index + 1}.
                  </span>
                  <span className="font-mono text-sm flex-1 truncate">
                    {transfer.wallet}
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {transfer.amount}
                    {tokenMetadata && (
                      <span className="text-muted-foreground ml-1">
                        {tokenMetadata.symbol}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveTransfer(transfer.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {transfers.length > 0 && tokenMetadata && (
            <div className="mt-4 p-3 bg-muted rounded-md space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipients:</span>
                <span className="font-medium">{transfers.length}</span>
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
            toast.success("Custom Bulk Transfer Complete", {
              description: `Successfully transferred ${formatTokenAmount(
                totalAmount,
                tokenMetadata!.decimals
              )} ${tokenMetadata!.symbol} to ${transfers.length} recipients.`,
            });
            setTransfers([]);
          }}
        />
      )}

      {steps.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {!tokenMetadata
              ? "Enter a valid token address to get started"
              : "Add transfers via CSV or manual entry to continue"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CustomBulkTransferPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CustomBulkTransferContent />
    </Suspense>
  );
}
