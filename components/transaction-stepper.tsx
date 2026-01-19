"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWallet } from "@/lib/use-wallet";
import {
  createAptosClient,
  simulateTransaction,
  SimulationResult,
} from "@/lib/aptos-service";
import {
  InputEntryFunctionData,
  EntryFunctionArgumentTypes,
  Network,
  WriteSetChangeWriteResource,
  CallArgument,
} from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { SimulationResults } from "@/components/simulation-results";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ReactNode } from "react";

interface TransactionStep {
  title: string;
  description: string;
  moduleAddress: string;
  moduleName: string;
  functionName: string;
  args: EntryFunctionArgumentTypes[];
  typeArguments?: string[];
}

interface AddressBook {
  [address: string]: string;
}

interface TransactionStepperProps {
  steps: TransactionStep[];
  onComplete: () => void;
  addressBook?: AddressBook;
  renderCustomSimulationResults?: (
    simulationResult: SimulationResult
  ) => ReactNode;
  hideBatchMode?: boolean;
}

const BATCH_SIZE = 5;

export function TransactionStepper({
  steps,
  onComplete,
  renderCustomSimulationResults,
  hideBatchMode = false,
}: TransactionStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isAutoExecute, setIsAutoExecute] = useState(false);
  const pendingAutoExecuteRef = useRef(false);

  const batches = useMemo(() => {
    const result: typeof steps[] = [];
    for (let i = 0; i < steps.length; i += BATCH_SIZE) {
      result.push(steps.slice(i, i + BATCH_SIZE));
    }
    return result;
  }, [steps]);

  const handleComplete = useCallback(() => {
    onComplete();
    setIsExecuting(false);
    setCurrentStep(steps.length);
    setCurrentBatchIndex(0);
    pendingAutoExecuteRef.current = false;
  }, [onComplete, steps.length]);

  const { account, submitTransaction, network } = useWallet();


  const handleStepClick = async (stepIndex: number) => {
    if (stepIndex !== currentStep || isExecuting) return;

    const step = steps[stepIndex];
    setIsExecuting(true);

    try {
      const result = await simulateTransaction(
        account!,
        `${step.moduleName}::${step.functionName}`,
        step.moduleAddress,
        step.args,
        network?.name,
        step.typeArguments ?? []
      );

      setSimulationResult(result);

      if (isAutoExecute && result.success) {
        await executeConfirmedTransaction();
      } else {
        setShowConfirmation(true);
      }
    } catch (error) {
      console.error("Error simulating transaction:", error);
      toast.error("Simulation failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsExecuting(false);
    }
  };

  const handleBatchSimulation = async () => {
    if (!account) return;
    setIsExecuting(true);

    const currentBatch = batches[currentBatchIndex];
    if (!currentBatch || currentBatch.length === 0) {
      setIsExecuting(false);
      return;
    }

    try {
      const client = createAptosClient(network?.name || Network.DEVNET);

      const transaction = await client.transaction.build.scriptComposer({
        sender: account.address,
        builder: async (builder) => {
          for (const step of currentBatch) {
            await builder.addBatchedCalls({
              function: `${step.moduleAddress}::${step.moduleName}::${step.functionName}`,
              functionArguments: [CallArgument.newSigner(0), ...step.args],
              typeArguments: step.typeArguments ?? [],
            });
          }
          return builder;
        },
      });

      const response = await client.transaction.simulate.simple({
        signerPublicKey: account.publicKey,
        transaction,
      });

      const simulationResponse = Array.isArray(response)
        ? response[0]
        : response;
      const result: SimulationResult = {
        success: simulationResponse.success,
        vmStatus: simulationResponse.vm_status,
        gasUsed: simulationResponse.gas_used.toString(),
        events: simulationResponse.events.map((event) => ({
          type: event.type,
          data: event.data as Record<string, unknown>,
          key:
            typeof event.guid === "object"
              ? event.guid.account_address + event.guid.creation_number
              : "unknown",
          sequenceNumber: event.sequence_number,
        })),
        changes: simulationResponse.changes
          .filter(
            (change): change is WriteSetChangeWriteResource =>
              "data" in change && !!change.data
          )
          .map((change) => ({
            type: change.type,
            address: change.address,
            resource: change.data.type,
            data: change.data.data as Record<string, unknown>,
          })),
      };

      setSimulationResult(result);

      if (isAutoExecute && result.success) {
        await executeConfirmedTransaction();
      } else {
        setShowConfirmation(true);
      }
    } catch (error) {
      console.error("Error simulating batch transaction:", error);
      toast.error("Batch simulation failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsExecuting(false);
    }
  };

  const executeConfirmedTransaction = async () => {
    if (!account) return;

    try {
      let txnResult: { hash: string } | undefined;
      if (isBatchMode) {
        const currentBatch = batches[currentBatchIndex];
        if (!currentBatch || currentBatch.length === 0) {
          handleComplete();
          return;
        }

        const client = createAptosClient(network?.name || Network.DEVNET);

        const transaction = await client.transaction.build.scriptComposer({
          sender: account.address,
          builder: async (builder) => {
            for (const step of currentBatch) {
              await builder.addBatchedCalls({
                function: `${step.moduleAddress}::${step.moduleName}::${step.functionName}`,
                functionArguments: [CallArgument.newSigner(0), ...step.args],
                typeArguments: step.typeArguments ?? [],
              });
            }
            return builder;
          },
        });

        const { args, bytecode, type_args } =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (transaction.rawTransaction.payload as any).script;

        txnResult = await submitTransaction(
          {
            bytecode,
            typeArguments: type_args,
            functionArguments: args,
          },
          {
            max_gas_amount: 100000,
          }
        );

        const completedSteps = (currentBatchIndex + 1) * BATCH_SIZE;
        setCurrentStep(Math.min(completedSteps, steps.length));

        if (currentBatchIndex < batches.length - 1) {
          if (isAutoExecute) pendingAutoExecuteRef.current = true;
          setCurrentBatchIndex(currentBatchIndex + 1);
          toast.success(
            `Batch ${currentBatchIndex + 1}/${batches.length} complete`,
            {
              description: `${batches.length - currentBatchIndex - 1} batch(es) remaining`,
            }
          );
        } else {
          handleComplete();
        }
      } else {
        const step = steps[currentStep];
        const payload: InputEntryFunctionData = {
          function:
            `${step.moduleAddress}::${step.moduleName}::${step.functionName}` as const,
          typeArguments: step.typeArguments ?? [],
          functionArguments: step.args,
        };

        txnResult = await submitTransaction(payload, {
          max_gas_amount: 100000,
        });

        if (currentStep === steps.length - 1) {
          handleComplete();
        } else {
          if (isAutoExecute) pendingAutoExecuteRef.current = true;
          setCurrentStep(currentStep + 1);
        }
      }

      if (txnResult?.hash) {
        const explorerUrl = `https://explorer.aptoslabs.com/txn/${
          txnResult.hash
        }?network=${network?.name?.toLowerCase() || "devnet"}`;
        toast.success("Transaction submitted successfully!", {
          action: {
            label: "View on Explorer",
            onClick: () => window.open(explorerUrl, "_blank"),
          },
        });
      }
    } catch (error) {
      console.error("Error executing transaction:", error);
      toast.error("Transaction submission failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      pendingAutoExecuteRef.current = false;
    } finally {
      setIsExecuting(false);
      setShowConfirmation(false);
    }
  };

  const handleConfirm = async () => {
    await executeConfirmedTransaction();
  };

  useEffect(() => {
    if (!pendingAutoExecuteRef.current || !isAutoExecute) return;
    if (currentStep >= steps.length) return;
    if (isExecuting) return;

    pendingAutoExecuteRef.current = false;

    const timer = setTimeout(() => {
      if (isBatchMode) {
        handleBatchSimulation();
      } else {
        handleStepClick(currentStep);
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, currentBatchIndex, isAutoExecute, isExecuting, steps.length, isBatchMode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Steps</CardTitle>
      </CardHeader>
      <CardContent>
        {steps.length > 1 && steps.length > currentStep && (
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {!hideBatchMode && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="batch-mode"
                  checked={isBatchMode}
                  onCheckedChange={(checked) => {
                    setIsBatchMode(checked);
                    setCurrentBatchIndex(0);
                  }}
                />
                <Label htmlFor="batch-mode">
                  Batch Mode{batches.length > 1 && ` (${batches.length} batches of up to ${BATCH_SIZE})`}
                </Label>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-execute"
                checked={isAutoExecute}
                onCheckedChange={setIsAutoExecute}
              />
              <Label htmlFor="auto-execute">Auto Execute</Label>
            </div>
          </div>
        )}
        <Stepper
          steps={steps.map((step, index) => ({
            title: step.title,
            description: step.description,
            state:
              index < currentStep
                ? "completed"
                : index === currentStep
                ? "current"
                : "upcoming",
          }))}
          onStepClick={handleStepClick}
        />
        {currentStep < steps.length && (
          <div className="mt-4">
            <Button
              onClick={() =>
                isBatchMode
                  ? handleBatchSimulation()
                  : handleStepClick(currentStep)
              }
              disabled={isExecuting || currentStep === steps.length}
            >
              {isExecuting
                ? "Simulating..."
                : isBatchMode
                ? batches.length > 1
                  ? `Simulate Batch ${currentBatchIndex + 1}/${batches.length}`
                  : "Simulate Batch"
                : currentStep === steps.length - 1
                ? "Complete"
                : "Execute Step"}
            </Button>
          </div>
        )}

        <AlertDialog open={showConfirmation} onOpenChange={setShowConfirmation}>
          <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Transaction</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to execute this transaction? This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {simulationResult && (
              <div className="mt-4 overflow-x-auto">
                {renderCustomSimulationResults ? (
                  renderCustomSimulationResults(simulationResult)
                ) : (
                  <SimulationResults
                    result={simulationResult}
                    isLoading={false}
                    error={null}
                  />
                )}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsExecuting(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
