"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNavigation } from "@/lib/navigation-context";

type ConfigType = "facility" | "module" | "loan_book";

interface ConfigField {
  type: ConfigType;
  label: string;
  description: string;
  placeholder: string;
}

const CONFIG_FIELDS: Record<ConfigType, Omit<ConfigField, "type">> = {
  facility: {
    label: "Facility Address",
    description: "The address of the facility contract you want to interact with.",
    placeholder: "0x...",
  },
  module: {
    label: "Module Address",
    description: "The address of the deployed contract module.",
    placeholder: "0x...",
  },
  loan_book: {
    label: "Loan Book Address",
    description: "The address of the loan book you want to manage.",
    placeholder: "0x...",
  },
};

interface ConfigPromptProps {
  /** Which config fields are missing */
  missingFields: ConfigType[];
  /** Page title for context */
  pageTitle?: string;
  /** Optional callback when config is submitted */
  onConfigured?: (values: Record<ConfigType, string>) => void;
}

export function ConfigPrompt({
  missingFields,
  pageTitle,
  onConfigured,
}: ConfigPromptProps) {
  const router = useRouter();
  const {
    facilityAddress,
    moduleAddress,
    loanBookAddress,
    setFacilityAddress,
    setModuleAddress,
    setLoanBookAddress,
  } = useNavigation();

  // Initialize values from context
  const [values, setValues] = useState<Record<ConfigType, string>>({
    facility: facilityAddress,
    module: moduleAddress || "0x1",
    loan_book: loanBookAddress,
  });

  const [errors, setErrors] = useState<Record<ConfigType, string>>({
    facility: "",
    module: "",
    loan_book: "",
  });

  const handleChange = (type: ConfigType, value: string) => {
    setValues((prev) => ({ ...prev, [type]: value }));
    // Clear error when user starts typing
    if (errors[type]) {
      setErrors((prev) => ({ ...prev, [type]: "" }));
    }
  };

  const validateAddress = (value: string): boolean => {
    // Basic validation: should start with 0x and have reasonable length
    return value.startsWith("0x") && value.length >= 10;
  };

  const handleSubmit = () => {
    // Validate all missing fields
    const newErrors: Record<ConfigType, string> = {
      facility: "",
      module: "",
      loan_book: "",
    };
    let hasError = false;

    for (const field of missingFields) {
      if (!values[field]) {
        newErrors[field] = "This field is required";
        hasError = true;
      } else if (!validateAddress(values[field])) {
        newErrors[field] = "Please enter a valid address (starting with 0x)";
        hasError = true;
      }
    }

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    // Save to context
    if (missingFields.includes("facility") && values.facility) {
      setFacilityAddress(values.facility);
    }
    if (missingFields.includes("module") && values.module) {
      setModuleAddress(values.module);
    }
    if (missingFields.includes("loan_book") && values.loan_book) {
      setLoanBookAddress(values.loan_book);
    }

    // Update URL with new params
    const params = new URLSearchParams(window.location.search);
    for (const field of missingFields) {
      if (values[field]) {
        params.set(field === "loan_book" ? "loan_book" : field, values[field]);
      }
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    router.replace(newUrl);

    // Call callback if provided
    if (onConfigured) {
      onConfigured(values);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Settings className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Configuration Required</CardTitle>
          <CardDescription>
            {pageTitle
              ? `To use ${pageTitle}, please provide the following:`
              : "Please provide the required configuration to continue:"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingFields.map((field) => {
            const config = CONFIG_FIELDS[field];
            return (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{config.label}</Label>
                <Input
                  id={field}
                  value={values[field]}
                  onChange={(e) => handleChange(field, e.target.value)}
                  placeholder={config.placeholder}
                  className={errors[field] ? "border-destructive" : ""}
                />
                {errors[field] ? (
                  <p className="text-sm text-destructive">{errors[field]}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {config.description}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSubmit} className="w-full">
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
