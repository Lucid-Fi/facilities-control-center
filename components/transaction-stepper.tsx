"use client";

import { useState } from "react";
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
import { simulateTransaction, SimulationResult } from "@/lib/aptos-service";
import {
  InputEntryFunctionData,
  EntryFunctionArgumentTypes,
  Aptos,
  AptosConfig,
  Network,
  WriteSetChangeWriteResource,
  CallArgument,
} from "@aptos-labs/ts-sdk";
import { toast } from "sonner";
import { SimulationResults } from "@/components/simulation-results";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface TransactionStep {
  title: string;
  description: string;
  moduleAddress: string;
  moduleName: string;
  functionName: string;
  args: EntryFunctionArgumentTypes[];
}

interface AddressBook {
  [address: string]: string;
}

interface TransactionStepperProps {
  steps: TransactionStep[];
  onComplete: () => void;
  addressBook?: AddressBook;
}

export function TransactionStepper({
  steps,
  onComplete,
}: TransactionStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);

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
        network?.name
      );

      setSimulationResult(result);
      setShowConfirmation(true);
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

    try {
      const config = new AptosConfig({
        network: network?.name || Network.DEVNET,
      });
      const client = new Aptos(config);

      const transaction = await client.transaction.build.scriptComposer({
        sender: account.address,
        builder: async (builder) => {
          for (const step of steps) {
            await builder.addBatchedCalls({
              function: `${step.moduleAddress}::${step.moduleName}::${step.functionName}`,
              functionArguments: [CallArgument.newSigner(0), ...step.args],
              typeArguments: [],
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
      setShowConfirmation(true);
    } catch (error) {
      console.error("Error simulating batch transaction:", error);
      toast.error("Batch simulation failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsExecuting(false);
    }
  };

  const handleConfirm = async () => {
    if (!account) return;

    try {
      if (isBatchMode) {
        const config = new AptosConfig({
          network: network?.name || Network.DEVNET,
        });
        const client = new Aptos(config);

        const transaction = await client.transaction.build.scriptComposer({
          sender: account.address,
          builder: async (builder) => {
            for (const step of steps) {
              await builder.addBatchedCalls({
                function: `${step.moduleAddress}::${step.moduleName}::${step.functionName}`,
                functionArguments: [CallArgument.newSigner(0), ...step.args],
                typeArguments: [],
              });
            }
            return builder;
          },
        });

        await submitTransaction(transaction, {
          max_gas_amount: 100000,
        });
        onComplete();
      } else {
        const step = steps[currentStep];
        const payload: InputEntryFunctionData = {
          function:
            `${step.moduleAddress}::${step.moduleName}::${step.functionName}` as const,
          typeArguments: [],
          functionArguments: step.args,
        };

        await submitTransaction(payload, {
          max_gas_amount: 100000,
        });

        if (currentStep === steps.length - 1) {
          onComplete();
        } else {
          setCurrentStep(currentStep + 1);
        }
      }
    } catch (error) {
      console.error("Error executing transaction:", error);
    } finally {
      setIsExecuting(false);
      setShowConfirmation(false);
    }
  };

  console.log(simulationResult);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Steps</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 mb-4">
          <Switch
            id="batch-mode"
            checked={isBatchMode}
            onCheckedChange={setIsBatchMode}
          />
          <Label htmlFor="batch-mode">Batch Mode</Label>
        </div>
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
        <div className="mt-4">
          <Button
            onClick={() =>
              isBatchMode
                ? handleBatchSimulation()
                : handleStepClick(currentStep)
            }
            disabled={isExecuting}
          >
            {isExecuting
              ? "Simulating..."
              : isBatchMode
              ? "Simulate Batch"
              : currentStep === steps.length - 1
              ? "Complete"
              : "Execute Step"}
          </Button>
        </div>

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
                <SimulationResults
                  result={simulationResult}
                  isLoading={false}
                  error={null}
                />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
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
