export const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6,
  default: 8,
};

export const formatTokenAmount = (
  amount: bigint,
  decimals: number = TOKEN_DECIMALS.default
): string => {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const fractional = amount % divisor;
  return `${whole}.${fractional.toString().padStart(decimals, "0")}`;
};

export const parseTokenAmount = (
  amount: string,
  decimals: number = TOKEN_DECIMALS.default
): bigint => {
  const [whole, fractional] = amount.split(".");
  const wholePart = BigInt(whole) * BigInt(10) ** BigInt(decimals);
  const fractionalPart = BigInt(
    (fractional || "0").padEnd(decimals, "0").slice(0, decimals)
  );
  return wholePart + fractionalPart;
};
