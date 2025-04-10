import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle } from "lucide-react"

interface TransactionStatusProps {
  status: "idle" | "pending" | "success" | "error"
  message: string
  txHash?: string
}

export function TransactionStatus({ status, message, txHash }: TransactionStatusProps) {
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
      {status === "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
      {status === "success" && <CheckCircle className="h-4 w-4" />}
      {status === "error" && <XCircle className="h-4 w-4" />}

      <AlertTitle>
        {status === "pending" && "Transaction Pending"}
        {status === "success" && "Transaction Successful"}
        {status === "error" && "Transaction Failed"}
      </AlertTitle>

      <AlertDescription>
        {message}
        {txHash && status === "success" && (
          <div className="mt-2">
            <a
              href={`https://explorer.aptoslabs.com/txn/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View on Explorer
            </a>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
