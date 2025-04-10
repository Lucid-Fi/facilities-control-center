"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wallet, LogOut, AlertCircle } from "lucide-react";
import { useWallet } from "@/lib/use-wallet";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WalletSelectorProps {
  onConnect: (account: string | null) => void;
  connectedAccount: string | null;
}

export function WalletSelector({
  onConnect,
  connectedAccount,
}: WalletSelectorProps) {
  const {
    connectWallet,
    disconnectWallet,
    account,
    network,
    connected,
    wallets,
    isWalletConnecting,
    connectionError,
  } = useWallet();

  // Update parent component when wallet connection changes
  useEffect(() => {
    if (connected && account) {
      onConnect(account.address.toString());
    } else if (!connected && connectedAccount) {
      onConnect(null);
    }
  }, [connected, account, onConnect, connectedAccount]);

  const handleConnectWallet = async (walletName: string) => {
    try {
      await connectWallet(walletName);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  const handleDisconnectWallet = async () => {
    try {
      await disconnectWallet();
      onConnect(null);
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
    }
  };

  if (connectedAccount) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center">
          <Wallet className="w-4 h-4 mr-1" />
          <span>Connected{network ? ` (${network.name})` : ""}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
          onClick={handleDisconnectWallet}
        >
          <span className="truncate max-w-[120px]">
            {connectedAccount.slice(0, 6)}...{connectedAccount.slice(-4)}
          </span>
          <LogOut className="w-3 h-3 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {connectionError && (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{connectionError}</AlertDescription>
        </Alert>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={isWalletConnecting}>
            {isWalletConnecting ? "Connecting..." : "Connect Wallet"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {wallets.map((wallet) => (
            <DropdownMenuItem
              key={wallet.name}
              onClick={() => handleConnectWallet(wallet.name)}
              disabled={!wallet.readyState}
              className="flex items-center gap-2"
            >
              {wallet.icon && (
                // Next Image can't be used with dynamic image URLs from wallets
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wallet.icon}
                  alt={`${wallet.name} icon`}
                  className="w-4 h-4"
                  onError={(e) => {
                    // Handle case where icon fails to load
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              {wallet.name}
              {wallet.readyState !== "Installed" && (
                <span className="text-xs text-gray-500 ml-1">
                  {wallet.readyState === "NotDetected"
                    ? "(Not installed)"
                    : "(Loading...)"}
                </span>
              )}
            </DropdownMenuItem>
          ))}

          {wallets.length === 0 && (
            <DropdownMenuItem disabled>No wallets detected</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
