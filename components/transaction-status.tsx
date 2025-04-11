import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle, ExternalLink, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useEffect, useState } from "react"
import { useWallet } from "@/lib/use-wallet"

interface TransactionStatusProps {
  status: "idle" | "pending" | "success" | "error"
  message: string
  txHash?: string
  network?: string
}

export function TransactionStatus({ status, message, txHash, network }: TransactionStatusProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { wallet } = useWallet()
  const [copied, setCopied] = useState(false)
  const [currentNetwork, setCurrentNetwork] = useState<string>(network || 'Devnet')

  useEffect(() => {
    // Update network from context if available
    if (network) {
      setCurrentNetwork(network)
    }
  }, [network])

  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timeout)
    }
  }, [copied])

  const copyTxHash = () => {
    if (txHash) {
      navigator.clipboard.writeText(txHash)
      setCopied(true)
    }
  }

  const getExplorerUrl = () => {
    const baseUrl = 
      currentNetwork === 'Mainnet' ? 'https://explorer.aptoslabs.com/txn/' :
      currentNetwork === 'Testnet' ? 'https://explorer.aptoslabs.com/txn/' :
      'https://explorer.devnet.aptoslabs.com/txn/'
    
    return `${baseUrl}${txHash}?network=${currentNetwork.toLowerCase()}`
  }

  if (status === "idle") return null

  return (
    <Alert
      variant={status === "pending" ? "default" : status === "success" ? "default" : "destructive"}
      className={
        status === "pending"
          ? "border-yellow-500 text-yellow-800 bg-yellow-50"
          : status === "success"
            ? "border-green-500 text-green-800 bg-green-50"
            : undefined
      }
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          {status === "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "success" && <CheckCircle className="h-4 w-4" />}
          {status === "error" && <XCircle className="h-4 w-4" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <AlertTitle>
              {status === "pending" && "Transaction Pending"}
              {status === "success" && "Transaction Successful"}
              {status === "error" && "Transaction Failed"}
            </AlertTitle>
            
            {currentNetwork && status !== "error" && (
              <Badge 
                variant="outline" 
                className={
                  currentNetwork === "Mainnet" 
                    ? "bg-purple-50 text-purple-700 border-purple-200" 
                    : currentNetwork === "Testnet"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-green-50 text-green-700 border-green-200"
                }
              >
                {currentNetwork}
              </Badge>
            )}
          </div>

          <AlertDescription className="mt-1">
            {message}
            
            {txHash && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono break-all">
                  <span className="text-gray-500">TX Hash:</span>
                  <span className="font-medium">{txHash}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6" 
                    onClick={copyTxHash} 
                    title="Copy transaction hash"
                  >
                    {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                
                {status === "pending" && (
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs text-yellow-600">Waiting for transaction confirmation...</span>
                  </div>
                )}
                
                {txHash && (
                  <a
                    href={getExplorerUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                  >
                    View on Aptos Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </AlertDescription>
        </div>
      </div>
    </Alert>
  )
}
