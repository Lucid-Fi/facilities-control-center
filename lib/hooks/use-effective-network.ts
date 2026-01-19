"use client";

import { Network } from "@aptos-labs/ts-sdk";
import { useWallet } from "@/lib/use-wallet";
import { useNavigation } from "@/lib/navigation-context";

export interface EffectiveNetwork {
  name: Network;
  chainId: number;
  isFromWallet: boolean;
}

/**
 * Converts a network name string to the Network enum
 */
function toNetworkEnum(networkName: string | undefined): Network {
  switch (networkName?.toLowerCase()) {
    case "mainnet":
      return Network.MAINNET;
    case "testnet":
      return Network.TESTNET;
    case "devnet":
      return Network.DEVNET;
    default:
      return Network.MAINNET;
  }
}

/**
 * Returns the effective network to use for data fetching.
 * - When wallet is connected: uses the wallet's network
 * - When wallet is disconnected: uses the toggled network from navigation context
 */
export function useEffectiveNetwork(): EffectiveNetwork {
  const { connected, network: walletNetwork } = useWallet();
  const { network: toggledNetwork } = useNavigation();

  // If wallet is connected, use wallet's network
  if (connected && walletNetwork) {
    return {
      name: toNetworkEnum(walletNetwork.name),
      chainId: typeof walletNetwork.chainId === "number" ? walletNetwork.chainId : 1,
      isFromWallet: true,
    };
  }

  // Otherwise use the toggled network from navigation context
  return {
    name: toNetworkEnum(toggledNetwork),
    chainId: toggledNetwork === "mainnet" ? 1 : 2,
    isFromWallet: false,
  };
}
