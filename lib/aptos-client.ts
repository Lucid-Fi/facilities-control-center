import { AptosClient as NativeAptosClient, Types } from "aptos"
import type { WalletTransactionOptions } from "@/lib/use-wallet"

export interface AptosClientConfig {
  nodeUrl: string
  faucetUrl?: string
}

export interface SimulationResult {
  success: boolean
  vmStatus: string
  gasUsed: string
  events: SimulationEvent[]
  changes: Record<string, unknown>[]
}

export interface SimulationEvent {
  type: string
  data: Record<string, unknown>
  key: string
  sequenceNumber: string
}

export class AptosClient {
  private nodeUrl: string
  private faucetUrl?: string
  private client: NativeAptosClient
  private walletSubmit: ((payload: Types.TransactionPayload & { type: string }, options?: WalletTransactionOptions) => Promise<{ hash: string }>) | null = null

  constructor(config: AptosClientConfig) {
    this.nodeUrl = config.nodeUrl
    this.faucetUrl = config.faucetUrl
    
    // Initialize the official Aptos SDK client
    this.client = new NativeAptosClient(this.nodeUrl)
  }

  setWalletSubmit(submitFn: (payload: Types.TransactionPayload & { type: string }, options?: WalletTransactionOptions) => Promise<{ hash: string }>) {
    this.walletSubmit = submitFn
  }

  async getAccount(address: string): Promise<Record<string, unknown>> {
    try {
      return await this.client.getAccount(address)
    } catch (error) {
      console.error(`Error fetching account ${address}:`, error)
      throw error
    }
  }

  async submitTransaction(
    senderAddress: string, 
    payload: Types.TransactionPayload & { type: string }, 
    options?: WalletTransactionOptions
  ): Promise<{ hash: string }> {
    if (this.walletSubmit) {
      // Use the wallet adapter to submit transaction if available
      try {
        return await this.walletSubmit(payload, options)
      } catch (error) {
        console.error("Error submitting transaction via wallet:", error)
        throw error
      }
    } else {
      // If no wallet submit function is set, we can't submit transactions
      throw new Error("No wallet connected for transaction submission")
    }
  }

  async simulateTransaction(
    senderAddress: string, 
    payload: Types.TransactionPayload & { type: string }, 
    // options not used currently but kept for future gas estimation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: WalletTransactionOptions
  ): Promise<SimulationResult> {
    try {
      // Use the Aptos SDK to simulate the transaction
      const response = await this.client.simulateTransaction(
        senderAddress,
        payload,
        {
          estimateGasUnitPrice: true,
          estimateMaxGasAmount: true,
          estimatePrioritizedGasUnitPrice: true,
        }
      )
      
      // Process the response into our expected format
      const simulationResponse = Array.isArray(response) ? response[0] : response
      
      const result: SimulationResult = {
        success: simulationResponse?.success || false,
        vmStatus: simulationResponse?.vm_status || "Unknown error",
        gasUsed: simulationResponse?.gas_used?.toString() || "0",
        events: (simulationResponse?.events || []).map((event: Record<string, unknown>) => ({
          type: event.type as string,
          data: event.data as Record<string, unknown>,
          key: event.key as string,
          sequenceNumber: event.sequence_number?.toString() as string,
        })),
        changes: simulationResponse?.changes || [],
      }
      
      return result
    } catch (error) {
      console.error("Error simulating transaction:", error)
      throw error
    }
  }

  async waitForTransaction(txnHash: string): Promise<Record<string, unknown>> {
    try {
      // Use the Aptos SDK to wait for transaction
      return await this.client.waitForTransaction(txnHash)
    } catch (error) {
      console.error(`Error waiting for transaction ${txnHash}:`, error)
      throw error
    }
  }

  // Create transaction payload for entry function call
  createEntryFunctionPayload(
    module: string,
    func: string,
    typeArgs: string[] = [],
    args: unknown[] = []
  ): Omit<Types.EntryFunctionPayload, 'type'> {
    return {
      function: `${module}::${func}`,
      type_arguments: typeArgs,
      arguments: args,
    }
  }
}

export const createAptosClient = (config: AptosClientConfig): AptosClient => {
  return new AptosClient(config)
}
