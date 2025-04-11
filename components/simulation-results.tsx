import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SimulationResult, SimulationChange } from "@/lib/aptos-service";
import { Check, X, Info, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";

interface SimulationResultsProps {
  result: SimulationResult | null;
  isLoading: boolean;
  error?: Error | null;
}

export function SimulationResults({
  result,
  isLoading,
  error,
}: SimulationResultsProps) {
  const [expandedEvents, setExpandedEvents] = useState<number[]>([]);
  const [expandedChanges, setExpandedChanges] = useState<number[]>([]);

  const toggleEventExpand = (index: number) => {
    setExpandedEvents((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleChangeExpand = (index: number) => {
    setExpandedChanges((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Simulating Transaction...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            Simulation Failed
            <Badge
              variant="outline"
              className="bg-red-50 text-red-700 border-red-200"
            >
              <X className="h-3 w-3 mr-1" /> Error
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-50 rounded text-red-700">
            {error.message || "An unknown error occurred during simulation"}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Simulation Results
          {result.success ? (
            <Badge
              variant="outline"
              className="bg-green-50 text-green-700 border-green-200"
            >
              <Check className="h-3 w-3 mr-1" /> Success
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-red-50 text-red-700 border-red-200"
            >
              <X className="h-3 w-3 mr-1" /> Failed
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="flex flex-col gap-1 pt-1">
          {renderVmStatus(result.vmStatus)}
          <div className="flex items-center gap-4 pt-2">
            <Badge
              variant="secondary"
              className="py-1 px-2 text-xs font-medium"
            >
              Gas Used: {parseInt(result.gasUsed).toLocaleString()} units
            </Badge>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="events">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="events">
              Events ({result.events.length})
            </TabsTrigger>
            <TabsTrigger value="changes">
              State Changes ({result.changes.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="events" className="p-2 max-h-80 overflow-y-auto">
            {result.events.length > 0 ? (
              <div className="space-y-4">
                {result.events.map((event, index) => {
                  const isExpanded = expandedEvents.includes(index);
                  const eventTypeFormatted = formatEventType(event.type);
                  // Use event type for tooltip display

                  return (
                    <div key={index} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-sm">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">
                                  {eventTypeFormatted}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-md">
                                <div className="font-mono text-xs">
                                  {event.type}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    copyToClipboard(
                                      JSON.stringify(event, null, 2)
                                    )
                                  }
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Copy event data</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleEventExpand(index)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                        <span>Sequence: {event.sequenceNumber}</span>
                        {event.key && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help flex items-center gap-1">
                                  <Info className="h-3 w-3" />
                                  Key: {shortenAddress(event.key)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="font-mono text-xs">{event.key}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          isExpanded ? "max-h-96" : "max-h-20"
                        }`}
                      >
                        <div className="bg-gray-50 p-2 rounded text-sm font-mono overflow-x-auto">
                          <pre
                            className={`${!isExpanded ? "line-clamp-3" : ""}`}
                          >
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        </div>
                      </div>
                      {!isExpanded && Object.keys(event.data).length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs mt-1 h-6 w-full text-gray-500"
                          onClick={() => toggleEventExpand(index)}
                        >
                          Show more <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                No events emitted
              </div>
            )}
          </TabsContent>
          <TabsContent value="changes" className="p-2 max-h-80 overflow-y-auto">
            {result.changes.length > 0 ? (
              <div className="space-y-4">
                {result.changes.map((change: SimulationChange, index) => {
                  const isExpanded = expandedChanges.includes(index);
                  const changeType = change.type || "State Change";
                  const addressStr =
                    typeof change.address === "string"
                      ? change.address
                      : typeof change.resource === "string"
                      ? change.resource
                      : typeof change.handle === "string"
                      ? change.handle
                      : "";

                  return (
                    <div key={index} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-sm">
                          {formatChangeType(changeType)}
                        </div>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    copyToClipboard(
                                      JSON.stringify(change, null, 2)
                                    )
                                  }
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Copy change data</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleChangeExpand(index)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {addressStr && (
                        <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help flex items-center gap-1">
                                  {change.resource ? "Resource:" : "Address:"}{" "}
                                  {shortenAddress(addressStr)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="font-mono text-xs">
                                  {addressStr}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          isExpanded ? "max-h-96" : "max-h-20"
                        }`}
                      >
                        <div className="bg-gray-50 p-2 rounded text-sm font-mono overflow-x-auto">
                          <pre
                            className={`${!isExpanded ? "line-clamp-3" : ""}`}
                          >
                            {JSON.stringify(change.data || change, null, 2)}
                          </pre>
                        </div>
                      </div>
                      {!isExpanded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs mt-1 h-6 w-full text-gray-500"
                          onClick={() => toggleChangeExpand(index)}
                        >
                          Show more <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                No state changes
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function formatEventType(type: string): string {
  // Format event type for better readability
  // Example: 0x1::coin::DepositEvent -> Deposit Event (coin)
  try {
    const parts = type.split("::");
    if (parts.length === 3) {
      // Use module name for display
      const moduleName = parts[1];
      let eventName = parts[2];

      // Remove "Event" suffix if present
      if (eventName.endsWith("Event")) {
        eventName = eventName.slice(0, -5);
      }

      // Add spaces before capital letters and capitalize first letter
      eventName = eventName
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());

      return `${eventName} (${moduleName})`;
    }
  } catch {
    // If parsing fails, return the original
  }
  return type;
}

function formatChangeType(type: string): string {
  // Format change type for better readability
  // Add spaces before capital letters and capitalize first letter
  try {
    return type
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return type;
  }
}

function shortenAddress(address: string): string {
  // Shorten a long hex address (0x...) to a more readable form
  if (!address || typeof address !== "string") return address;

  if (address.startsWith("0x") && address.length > 10) {
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  }

  return address;
}

interface ParsedVmStatus {
  isAbort: boolean;
  address?: string;
  module?: string;
  reason?: string;
  status?: string;
}

function parseVmStatus(vmStatus: string): ParsedVmStatus {
  const abortPrefix = "Move abort in ";
  if (vmStatus.startsWith(abortPrefix)) {
    const details = vmStatus.substring(abortPrefix.length);
    const parts = details.split("::");
    if (parts.length === 2) {
      const address = parts[0];
      const moduleAndReason = parts[1];
      const [module, reason = "unknown"] = moduleAndReason.split(":");
      return {
        isAbort: true,
        address: address,
        module: module.trim(),
        reason: reason.trim(),
      };
    }
  }
  return { isAbort: false, status: vmStatus };
}

function renderVmStatus(vmStatus: string) {
  const parsedStatus = parseVmStatus(vmStatus);

  if (parsedStatus.isAbort) {
    return (
      <div className="mt-1 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs space-y-1 font-mono">
        <p className="font-semibold text-amber-900 text-sm mb-1">
          Transaction Aborted
        </p>
        <div className="flex">
          <span className="w-16 font-medium text-amber-700 flex-shrink-0">
            Address:
          </span>
          <span className="break-all">
            {shortenAddress(parsedStatus.address || "")}
          </span>
        </div>
        <div className="flex">
          <span className="w-16 font-medium text-amber-700 flex-shrink-0">
            Module:
          </span>
          <span>{parsedStatus.module}</span>
        </div>
        <div className="flex">
          <span className="w-16 font-medium text-amber-700 flex-shrink-0">
            Reason:
          </span>
          <span>{parsedStatus.reason}</span>
        </div>
      </div>
    );
  } else {
    return (
      <span className="break-words flex-1 min-w-0">
        VM Status: {parsedStatus.status}
      </span>
    );
  }
}
