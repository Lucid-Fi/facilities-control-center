"use client";

import React from "react";
import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ContractFunction, ParamType } from "@/lib/contract-functions";
import {
  ChevronDown,
  ChevronUp,
  Info,
  PlayCircle,
  ExternalLink,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateTimeInput } from "./date-time-input";
import { SimulationResults } from "./simulation-results";
import type { SimulationResult } from "@/lib/aptos-service";
import {
  useSimulateContractFunction,
  useSubmitContractFunction,
} from "@/lib/use-contract-queries";
import { AccountInfo, useWallet } from "@aptos-labs/wallet-adapter-react";

interface FunctionCardProps {
  functionData: ContractFunction;
  onSubmit: (
    functionName: string,
    args: unknown[]
  ) => Promise<{ hash: string }>;
  onSimulate: (
    functionName: string,
    args: unknown[]
  ) => Promise<SimulationResult>;
  isWalletConnected: boolean;
  moduleAddress: string;
  facilityAddress?: string;
  walletAccount: AccountInfo | null | undefined;
}

export function FunctionCard({
  functionData,
  onSubmit,
  onSimulate,
  isWalletConnected,
  moduleAddress,
  facilityAddress = "",
  walletAccount,
}: FunctionCardProps) {
  const { network } = useWallet();
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Record<string, unknown>>({});

  // Set default values for facility_orchestrator parameters when facilityAddress changes
  useEffect(() => {
    if (facilityAddress) {
      const updatedParams = { ...params };
      let hasUpdates = false;

      functionData.params.forEach((param) => {
        if (param.name === "facility_orchestrator" && !params[param.name]) {
          updatedParams[param.name] = facilityAddress;
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        setParams(updatedParams);
      }
    }
  }, [facilityAddress, functionData.params, params]);

  const handleParamChange = useCallback(
    (name: string, value: unknown, type: ParamType) => {
      let parsedValue = value;

      if (type === "u64" || type === "u128") {
        parsedValue = value === "" ? "" : Number(value);
      } else if (type === "boolean") {
        parsedValue = Boolean(value);
      } else if (type === "address") {
        parsedValue = value;
      } else if (type === "vector<u8>") {
        parsedValue = value;
      }

      setParams((prevParams) => ({ ...prevParams, [name]: parsedValue }));
    },
    []
  );

  const getArgs = useCallback(() => {
    return functionData.params.map((param) => params[param.name] ?? "");
  }, [functionData.params, params]);

  const {
    data: simulationResult,
    isLoading: isSimulating,
    refetch: runSimulation,
    isError: isSimulationError,
  } = useSimulateContractFunction({
    moduleAddress,
    functionName: `${functionData.moduleName}::${functionData.functionName}`,
    args: getArgs(),
    account: walletAccount,
    enabled: false,
    onSimulate,
  });

  const {
    mutate: submitTransaction,
    isPending: isSubmitting,
    isSuccess,
    data,
  } = useSubmitContractFunction({
    moduleAddress,
    functionName: `${functionData.moduleName}::${functionData.functionName}`,
    args: getArgs(),
    account: walletAccount,
    submitFunction: onSubmit,
  });

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      submitTransaction();
    },
    [submitTransaction]
  );

  const handleSimulate = useCallback(() => {
    if (!isWalletConnected) return;
    runSimulation();
  }, [isWalletConnected, runSimulation]);

  const isTimeParam = useCallback((name: string): boolean => {
    return name.toLowerCase().includes("time");
  }, []);

  const isFacilityOrchestratorParam = useCallback((name: string): boolean => {
    return name === "facility_orchestrator";
  }, []);

  const explorerLink =
    data?.hash && network?.name
      ? `https://explorer.aptoslabs.com/txn/${
          data.hash
        }?network=${network.name.toLowerCase()}`
      : null;

  React.useEffect(() => {}, [moduleAddress]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{functionData.title}</CardTitle>
            <CardDescription>{functionData.description}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 w-8 p-0"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {functionData.params.map((param) => (
              <div key={param.name} className="space-y-2">
                {isTimeParam(param.name) ? (
                  <DateTimeInput
                    id={`${functionData.moduleName}::${functionData.functionName}-${param.name}`}
                    label={param.name}
                    value={params[param.name] ?? ""}
                    onChange={(value) =>
                      handleParamChange(param.name, value, param.type)
                    }
                    description={param.description}
                  />
                ) : param.type === "boolean" ? (
                  <div className="space-y-2">
                    <Label
                      htmlFor={`${functionData.moduleName}::${functionData.functionName}-${param.name}`}
                      className="text-sm flex items-center gap-2"
                    >
                      {param.name}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-gray-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Type: {param.type}</p>
                            {param.description && <p>{param.description}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`${functionData.moduleName}::${functionData.functionName}-${param.name}`}
                        checked={!!params[param.name]}
                        onCheckedChange={(checked) =>
                          handleParamChange(param.name, checked, param.type)
                        }
                      />
                      <label
                        htmlFor={`${functionData.moduleName}::${functionData.functionName}-${param.name}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {param.name}
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`${functionData.moduleName}::${functionData.functionName}-${param.name}`}
                        className="text-sm"
                      >
                        {param.name}
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-gray-400" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Type: {param.type}</p>
                            {param.description && <p>{param.description}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id={`${functionData.moduleName}::${functionData.functionName}-${param.name}`}
                      placeholder={
                        isFacilityOrchestratorParam(param.name) &&
                        facilityAddress
                          ? facilityAddress
                          : `Enter ${param.name}`
                      }
                      value={(params[param.name] as string) ?? ""}
                      onChange={(e) =>
                        handleParamChange(
                          param.name,
                          e.target.value,
                          param.type
                        )
                      }
                      className={
                        isFacilityOrchestratorParam(param.name) &&
                        facilityAddress
                          ? "w-full border-green-300 focus:ring-green-500"
                          : "w-full"
                      }
                    />
                    {isFacilityOrchestratorParam(param.name) &&
                      facilityAddress &&
                      !params[param.name] && (
                        <p className="text-xs text-green-600">
                          Using default facility address
                        </p>
                      )}
                  </div>
                )}
              </div>
            ))}
          </form>

          <SimulationResults
            result={simulationResult as SimulationResult | null}
            isLoading={isSimulating}
            error={isSimulationError ? new Error("Simulation failed") : null}
          />
        </CardContent>
      )}

      <CardFooter className={expanded ? "pt-2" : "pt-0"}>
        <div className="flex flex-col w-full gap-2">
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSimulate}
              disabled={!isWalletConnected || isSimulating}
              className="flex-1"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              {isSimulating ? "Simulating..." : "Simulate"}
            </Button>
            <Button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!isWalletConnected || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? "Executing..." : "Execute"}
            </Button>
          </div>
          {isSuccess && explorerLink && (
            <div className="mt-2 text-sm text-green-600 flex items-center justify-center">
              <span>Success! View on Explorer:</span>
              <a
                href={explorerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 underline inline-flex items-center gap-1"
              >
                {" "}
                Txn <ExternalLink className="h-3 w-3" />{" "}
              </a>
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
