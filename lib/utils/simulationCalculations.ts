import {
  SimulationResultChange,
  SimBorrowingBaseNode,
} from "@/lib/types/simulation";

export function calculateEffectiveAdvanceRateString(
  changes: SimulationResultChange[],
  facilityAddress: string | null,
  fallbackAdvanceRateDecimal?: number // e.g., 0.85 for 85%
): string {
  let effectiveAdvanceRate = "0.00%";

  try {
    let attestedValue = BigInt(0);
    let advanceRateNumerator = BigInt(0);
    let advanceRateDenominator = BigInt(1); // Default to 1 to avoid division by zero
    let totalContributedCapital = BigInt(0);

    const facilityObjectAddress = facilityAddress || "0x0";

    changes.forEach((change: SimulationResultChange) => {
      if (
        change.address === facilityObjectAddress &&
        change.data?.type?.endsWith(
          "::borrowing_base_engine::BorrowingBaseTree"
        )
      ) {
        const borrowingBaseTree = change.data?.data;
        if (borrowingBaseTree?.nodes) {
          borrowingBaseTree.nodes.forEach((node: SimBorrowingBaseNode) => {
            if (
              node.__variant__ === "V1" &&
              node._0?.__variant__ === "Complex" &&
              node._0?.node?.__variant__ === "SimpleAdvanceRate"
            ) {
              advanceRateNumerator = BigInt(node._0?.node?._0?.numerator || 0);
              advanceRateDenominator = BigInt(
                node._0?.node?._0?.denominator || 1
              );
            } else if (
              node.__variant__ === "V1" &&
              node._0?.__variant__ === "Value" &&
              node._0?._0?.__variant__ === "AttestedValue"
            ) {
              attestedValue = BigInt(node._0?._0?._0?.value || 0);
            }
          });
        }
      } else if (
        change.data?.type?.endsWith("::share_class::VersionedShareDetails")
      ) {
        if (change.data?.data?._0?.facility === facilityObjectAddress) {
          totalContributedCapital += BigInt(
            change.data?.data?._0?.current_contributed || 0
          );
        }
      }
    });

    if (
      totalContributedCapital > BigInt(0) &&
      advanceRateDenominator > BigInt(0)
    ) {
      const scaledAttestedValue = attestedValue * advanceRateNumerator;
      const advanceableAmount = scaledAttestedValue / advanceRateDenominator;
      const rate =
        (Number(advanceableAmount) / Number(totalContributedCapital)) * 100;
      effectiveAdvanceRate = rate.toFixed(2) + "%";
    } else if (totalContributedCapital === BigInt(0)) {
      effectiveAdvanceRate = "N/A (No contributed capital)";
    } else {
      effectiveAdvanceRate = "N/A (Data missing)";
    }
  } catch (e) {
    console.error("Error calculating effective advance rate:", e);
    effectiveAdvanceRate = "Error";
  }

  // Fallback logic
  if (
    (effectiveAdvanceRate.startsWith("N/A") ||
      effectiveAdvanceRate === "Error") &&
    fallbackAdvanceRateDecimal &&
    fallbackAdvanceRateDecimal > 0
  ) {
    return (fallbackAdvanceRateDecimal * 100).toFixed(2) + "%";
  }

  return effectiveAdvanceRate;
}
