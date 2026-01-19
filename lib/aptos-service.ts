"use client";

import {
  Aptos,
  AptosConfig,
  InputEntryFunctionData,
  MoveFunctionId,
  Network,
  UserTransactionResponse,
  WriteSetChangeWriteResource,
} from "@aptos-labs/ts-sdk";
import { AccountInfo } from "@aptos-labs/wallet-adapter-react";

// Define the simulation result interfaces
export interface SimulationEvent {
  type: string;
  data: Record<string, unknown>;
  key: string;
  sequenceNumber: string;
}

export interface SimulationChange {
  type: string;
  address?: string;
  resource?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SimulationResult {
  success: boolean;
  vmStatus: string;
  gasUsed: string;
  events: SimulationEvent[];
  changes: SimulationChange[];
}

const backupKeys: Record<Network, string> = {
  [Network.TESTNET]: "aptoslabs_aXLqtBTfEYA_BirLiL7RrdDfhY3SUStVrkxbpbWwGvRHV",
  [Network.MAINNET]: "aptoslabs_EvEyBavu4Vd_DGBMbzktvZ61VchxWvscDsoNG849HXm8g",
  [Network.DEVNET]: "aptoslabs_aXLqtBTfEYA_BirLiL7RrdDfhY3SUStVrkxbpbWwGvRHV",
  [Network.LOCAL]: "aptoslabs_aXLqtBTfEYA_BirLiL7RrdDfhY3SUStVrkxbpbWwGvRHV",
  [Network.CUSTOM]: "aptoslabs_aXLqtBTfEYA_BirLiL7RrdDfhY3SUStVrkxbpbWwGvRHV",
};

/**
 * Create an Aptos client for the specified network
 */
export const createAptosClient = (network: Network = Network.DEVNET) => {
  const apiKey =
    process.env[`NEXT_PUBLIC_APTOS_API_KEY_${network}`] ?? backupKeys[network];
  const config = new AptosConfig({
    network,
    clientConfig: {
      API_KEY: apiKey,
    },
  });

  return new Aptos(config);
};

/**
 * Get the network URL for the specified network
 */
export const getNetworkUrl = (networkName?: string): string => {
  if (!networkName) return "https://fullnode.devnet.aptoslabs.com/v1";

  switch (networkName.toLowerCase()) {
    case "mainnet":
      return "https://fullnode.mainnet.aptoslabs.com/v1";
    case "testnet":
      return "https://fullnode.testnet.aptoslabs.com/v1";
    default:
      return "https://fullnode.devnet.aptoslabs.com/v1";
  }
};

/**
 * Simulate a transaction and format the result
 */
export const simulateTransaction = async (
  account: AccountInfo,
  functionName: string,
  moduleAddress: string,
  args: unknown[],
  network: Network = Network.DEVNET,
  typeArguments: string[] = []
): Promise<SimulationResult> => {
  try {
    const client = createAptosClient(network);
    const payload: InputEntryFunctionData = createEntryFunctionPayload(
      moduleAddress,
      functionName,
      args,
      typeArguments
    );
    const transaction = await client.transaction.build.simple({
      sender: account.address.toString(),
      data: payload,
    });

    const response: UserTransactionResponse[] =
      await client.transaction.simulate.simple({
        transaction,
      });

    const simulationResponse = Array.isArray(response) ? response : [response];

    const result: SimulationResult = {
      success: simulationResponse[0].success,
      vmStatus: simulationResponse[0].vm_status,
      gasUsed: simulationResponse[0].gas_used.toString(),
      events: simulationResponse[0].events.map((event) => ({
        type: event.type,
        data: event.data as Record<string, unknown>,
        key:
          typeof event.guid === "object"
            ? event.guid.account_address + event.guid.creation_number
            : "unknown",
        sequenceNumber: event.sequence_number,
      })),
      changes: simulationResponse[0].changes
        .filter((change) => "data" in change && !!change.data)
        .map((_change) => {
          const change = _change as WriteSetChangeWriteResource;
          return {
            type: change.type,
            address: change.address,
            resource: change.data.type,
            data: change.data.data as Record<string, unknown>,
          };
        }),
    };

    return result;
  } catch (error) {
    console.error("Error simulating transaction:", error);
    throw error;
  }
};

/**
 * Build an entry function payload
 */
export const createEntryFunctionPayload = (
  moduleAddress: string,
  functionName: string,
  args: unknown[],
  typeArguments: string[] = []
) => {
  return {
    function: `${moduleAddress}::${functionName}` as MoveFunctionId,
    typeArguments,
    functionArguments: args,
  } as InputEntryFunctionData;
};
