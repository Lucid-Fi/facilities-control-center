import { useQuery } from "@tanstack/react-query";
import { createAptosClient } from "../aptos-service";
import { useEffectiveNetwork } from "./use-effective-network";

interface UseLoanBookConfigProps {
  loanBookAddress?: string;
}

export interface LoanBookConfig {
  loanBookAddress: string;
  configAddress: string; // The owner of the loan book object
  moduleAddress: string; // The module address extracted from resource types
}

/**
 * Hook to fetch the loan book config address (owner of the loan book object)
 * and the module address (extracted from resource type namespace).
 *
 * This allows the user to only provide the loan_book address, and we derive:
 * - configAddress: owner of the loan book object (needed for offer_loan_simple)
 * - moduleAddress: the deployed module address (from resource type like "0x123::loan_book::X")
 */
export const useLoanBookConfig = ({ loanBookAddress }: UseLoanBookConfigProps) => {
  const network = useEffectiveNetwork();

  const {
    data: loanBookConfig,
    isLoading,
    error,
  } = useQuery<LoanBookConfig, Error>({
    queryKey: ["loanBookConfig", loanBookAddress, network.chainId],
    queryFn: async (): Promise<LoanBookConfig> => {
      if (!loanBookAddress) {
        throw new Error("Loan book address is required");
      }

      const client = createAptosClient(network.name);

      // Fetch all resources on the loan book account
      const resources = await client.account.getAccountResources({
        accountAddress: loanBookAddress,
      });

      // Find the ObjectCore resource which contains the owner
      const objectCore = resources.find((r) =>
        r.type.includes("0x1::object::ObjectCore")
      ) as {
        type: string;
        data: {
          owner: string;
        };
      } | undefined;

      if (!objectCore?.data?.owner) {
        throw new Error("Could not find owner of loan book object");
      }

      // Extract module address from a loan_book resource type
      // Resource types are formatted as: "{module_address}::loan_book::ResourceName"
      const loanBookResource = resources.find((r) =>
        r.type.includes("::loan_book::")
      );

      if (!loanBookResource) {
        throw new Error("Could not find loan_book resource to extract module address");
      }

      // Parse the module address from the type string
      // e.g., "0x123abc::loan_book::LoanBook" -> "0x123abc"
      const moduleAddress = loanBookResource.type.split("::")[0];

      if (!moduleAddress || !moduleAddress.startsWith("0x")) {
        throw new Error("Could not parse module address from resource type");
      }

      return {
        loanBookAddress,
        configAddress: objectCore.data.owner,
        moduleAddress,
      };
    },
    enabled: !!loanBookAddress,
    staleTime: 60000, // Config address doesn't change often
  });

  return { loanBookConfig, isLoading, error };
};
