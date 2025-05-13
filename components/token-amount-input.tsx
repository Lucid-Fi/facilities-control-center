"use client";

import { useState, ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseTokenAmount, formatTokenAmount } from "@/lib/utils/token";

interface TokenAmountInputProps {
  label: string;
  initialValue?: bigint;
  onChange: (value: bigint) => void;
  decimals: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TokenAmountInput({
  label,
  initialValue,
  onChange,
  decimals,
  placeholder,
  className,
  disabled = false,
}: TokenAmountInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(
    initialValue ? formatTokenAmount(initialValue, decimals) : ""
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const userInput = event.target.value;

    if (userInput.trim() === "") {
      setDisplayValue("");
      onChange(BigInt(0));
      return;
    }

    let numericStr = userInput.replace(/,/g, "");
    numericStr = numericStr.replace(/[^0-9.]/g, "");

    const parts = numericStr.split(".");
    if (parts.length > 2) {
      numericStr = parts[0] + "." + parts.slice(1).join("");
    }

    const [integerPartRaw, fractionalPartRaw] = numericStr.split(".");
    if (fractionalPartRaw && fractionalPartRaw.length > decimals) {
      numericStr =
        (integerPartRaw || "") + "." + fractionalPartRaw.slice(0, decimals);
    }

    console.log({
      integerPartRaw,
      fractionalPartRaw,
    });
    if (fractionalPartRaw) {
      setDisplayValue(
        `${parseInt(integerPartRaw).toLocaleString(
          "en-US"
        )}.${fractionalPartRaw.slice(0, decimals)}`
      );
    } else {
      setDisplayValue(`${parseInt(integerPartRaw).toLocaleString("en-US")}`);
    }

    let valueForParsing = numericStr;
    if (
      numericStr.endsWith(".") &&
      numericStr.indexOf(".") === numericStr.length - 1
    ) {
      valueForParsing = numericStr.slice(0, -1);
    }

    if (valueForParsing === "" && numericStr === ".") {
      onChange(BigInt(0));
    } else if (valueForParsing.trim() === "") {
      onChange(BigInt(0));
    } else {
      try {
        const parsedBigIntValue = parseTokenAmount(valueForParsing, decimals);
        onChange(parsedBigIntValue);
      } catch {
        onChange(BigInt(0));
      }
    }

    const hasTrailingDecimal =
      numericStr.endsWith(".") &&
      numericStr.indexOf(".") === numericStr.length - 1;

    if (numericStr === ".") {
      setDisplayValue(".");
      return;
    }

    const valueToLocaleFormat = hasTrailingDecimal
      ? numericStr.slice(0, -1)
      : numericStr;

    if (valueToLocaleFormat === "") {
      setDisplayValue(hasTrailingDecimal ? "." : "");
      return;
    }

    try {
      const numForDisplay = parseFloat(valueToLocaleFormat);
      if (isNaN(numForDisplay)) {
        setDisplayValue(numericStr);
        return;
      }

      const [, typedFractionalPart] = numericStr.split(".");

      let displayString = numForDisplay.toLocaleString("en-US", {
        minimumFractionDigits: typedFractionalPart?.length ?? 0,
        maximumFractionDigits: decimals,
        useGrouping: true,
      });

      if (hasTrailingDecimal) {
        displayString += ".";
      }
      setDisplayValue(displayString);
    } catch {
      setDisplayValue(numericStr);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={label}>{label}</Label>
      <Input
        id={label}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        inputMode="decimal"
      />
    </div>
  );
}
