import { useQuery } from "@tanstack/react-query";
import { SimulationResult } from "@/lib/aptos-service";
import { generateTransactionDescription } from "@/lib/utils/llm";

interface AddressBook {
  [address: string]: string;
}

export function useLlmDescription(
  result: SimulationResult | null,
  addressBook: AddressBook
) {
  return useQuery({
    queryKey: [
      "llm-description",
      result?.vmStatus,
      result?.events,
      result?.changes,
    ],
    queryFn: () => {
      if (!result) return null;
      return generateTransactionDescription(result, addressBook);
    },
    enabled: !!result,
  });
}
