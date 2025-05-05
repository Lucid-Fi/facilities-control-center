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
  const whole = amount / divisor;
  const fractional = amount % divisor;
  
  // Convert fractional part to string and trim trailing zeros
  let fractionalStr = fractional.toString().padStart(decimals, "0");
  fractionalStr = fractionalStr.replace(/0+$/, "");
  
  // Return only whole part if fractional part is zero
  return fractionalStr ? `${whole}.${fractionalStr}` : `${whole}`;
};

export const parseTokenAmount = (
  amount: string,
  decimals: number = TOKEN_DECIMALS.default
): bigint => {
  if (!amount || amount.trim() === '') {
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
