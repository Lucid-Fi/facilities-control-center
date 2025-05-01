import {
  Aptos,
  AptosConfig,
  Network,
  InputEntryFunctionData,
  EntryFunctionArgumentTypes,
} from "@aptos-labs/ts-sdk";
import { AccountInfo } from "@aptos-labs/wallet-adapter-react";

export async function simulateTransaction(
  account: AccountInfo,
  functionName: string,
  moduleName: string,
  moduleAddress: string,
  args: EntryFunctionArgumentTypes[],
  network: Network = Network.MAINNET
) {
  try {
    const config = new AptosConfig({ network });
    const client = new Aptos(config);
    const payload: InputEntryFunctionData = {
      function: `${moduleAddress}::${moduleName}::${functionName}`,
      typeArguments: [],
      functionArguments: args,
    };
    const transaction = await client.transaction.build.simple({
      sender: account.address,
      data: payload,
    });
    const response = await client.transaction.simulate.simple({
      signerPublicKey: account.publicKey,
      transaction,
    });
    return Array.isArray(response) ? response[0] : response;
  } catch (error) {
    console.error("Error simulating transaction:", error);
    throw error;
  }
}

export async function submitTransaction(
  payload: InputEntryFunctionData,
  signAndSubmitTransaction: (
    transaction: InputEntryFunctionData
  ) => Promise<{ hash: string }>
) {
  try {
    const result = await signAndSubmitTransaction(payload);
    return result;
  } catch (error) {
    console.error("Error submitting transaction:", error);
    throw error;
  }
}

export function createScriptBuilder() {
  return {
    module: (moduleName: string) => ({
      function: (functionName: string) => ({
        args: (args: EntryFunctionArgumentTypes[]) => ({
          build: () =>
            ({
              function: `${moduleName}::${functionName}::${functionName}`,
              typeArguments: [],
              functionArguments: args,
            } as InputEntryFunctionData),
        }),
      }),
    }),
  };
}
