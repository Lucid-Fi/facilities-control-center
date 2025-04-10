"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Wallet, LogOut } from "lucide-react"

interface WalletSelectorProps {
  onConnect: (account: string) => void
  connectedAccount: string | null
}

export function WalletSelector({ onConnect, connectedAccount }: WalletSelectorProps) {
  const [isConnecting, setIsConnecting] = useState(false)

  const connectWallet = async (walletName: string) => {
    setIsConnecting(true)
    try {
      // This would be replaced with actual wallet connection logic
      // using the Aptos SDK or wallet adapters
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Generate a mock account address
      const mockAccount = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`

      onConnect(mockAccount)
    } catch (error) {
      console.error("Failed to connect wallet:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectWallet = () => {
    onConnect(null)
  }

  if (connectedAccount) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center">
          <Wallet className="w-4 h-4 mr-1" />
          <span>Connected</span>
        </div>
        <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={disconnectWallet}>
          <span className="truncate max-w-[120px]">
            {connectedAccount.slice(0, 6)}...{connectedAccount.slice(-4)}
          </span>
          <LogOut className="w-3 h-3 ml-1" />
        </Button>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isConnecting}>{isConnecting ? "Connecting..." : "Connect Wallet"}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => connectWallet("Petra")}>Petra Wallet</DropdownMenuItem>
        <DropdownMenuItem onClick={() => connectWallet("Martian")}>Martian Wallet</DropdownMenuItem>
        <DropdownMenuItem onClick={() => connectWallet("Pontem")}>Pontem Wallet</DropdownMenuItem>
        <DropdownMenuItem onClick={() => connectWallet("Rise")}>Rise Wallet</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
