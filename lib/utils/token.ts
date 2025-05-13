export const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6,
  default: 8,
};

export const formatTokenAmount = (
  amount: bigint,
  decimals: number = TOKEN_DECIMALS.default
): string => {
  if (amount === BigInt(0)) {
    return "0";
  }

  const divisor = BigInt(10) ** BigInt(decimals);
  let whole = amount / divisor;
  const fractional = amount % divisor;

  // Format whole part with thousand separators
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (decimals === 0) {
    return wholeStr;
  }

  // Convert fractional part to string, pad with leading zeros to match decimals length
  let fractionalStr = fractional.toString().padStart(decimals, "0");

  // Trim trailing zeros from the fractional part *only if* there's a fractional part
  const tempFractionalStr = fractionalStr.replace(/0+$/, "");
  if (tempFractionalStr === "") {
    // If all zeros, display as .0 or .00 depending on what's desired.
    // To always show decimals as requested, we'll keep the padded string.
    // If an exact number of decimal places like two is always wanted e.g. for currency: fractionalStr = fractional.toString().padStart(decimals, "0").slice(0, decimals);
    // For now, formatTokenAmount's original intent was to be minimal, so "0" for BigInt(0)
    // and trimming trailing zeros. Let's slightly adjust to keep the decimal point if there was one.
    return `${wholeStr}${decimals > 0 ? "." + "0".repeat(decimals) : ""}`
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, ".0"); // shows 10.0
  }
  fractionalStr = tempFractionalStr;

  return fractionalStr ? `${wholeStr}.${fractionalStr}` : wholeStr;
};

export const parseTokenAmount = (
  amount: string,
  decimals: number = TOKEN_DECIMALS.default
): bigint => {
  if (!amount || amount.trim() === "") {
    return BigInt(0);
  }

  try {
    const [whole, fractional] = amount.split(".");
    const wholePart = BigInt(whole || 0) * BigInt(10) ** BigInt(decimals);
    const fractionalPart = fractional
      ? BigInt(fractional.padEnd(decimals, "0").slice(0, decimals))
      : BigInt(0);
    return wholePart + fractionalPart;
  } catch (error) {
    console.error("Error parsing token amount:", error);
    return BigInt(0);
  }
};
