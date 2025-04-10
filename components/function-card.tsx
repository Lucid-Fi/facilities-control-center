"use client"

import type React from "react"

import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import type { ContractFunction, ParamType } from "@/lib/contract-functions"
import { ChevronDown, ChevronUp, Info, PlayCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DateTimeInput } from "./date-time-input"
import { SimulationResults } from "./simulation-results"
import type { SimulationResult } from "@/lib/aptos-client"

interface FunctionCardProps {
  functionData: ContractFunction
  onSubmit: (functionName: string, args: any[]) => void
  onSimulate: (functionName: string, args: any[]) => Promise<SimulationResult>
  isWalletConnected: boolean
  facilityAddress?: string
}

export function FunctionCard({
  functionData,
  onSubmit,
  onSimulate,
  isWalletConnected,
  facilityAddress = "",
}: FunctionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [params, setParams] = useState<Record<string, any>>({})
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  // Set default values for facility_orchestrator parameters when facilityAddress changes
  useEffect(() => {
    if (facilityAddress) {
      const updatedParams = { ...params }
      let hasUpdates = false

      functionData.params.forEach((param) => {
        if (param.name === "facility_orchestrator" && !params[param.name]) {
          updatedParams[param.name] = facilityAddress
          hasUpdates = true
        }
      })

      if (hasUpdates) {
        setParams(updatedParams)
      }
    }
  }, [facilityAddress, functionData.params, params])

  const handleParamChange = useCallback((name: string, value: any, type: ParamType) => {
    let parsedValue = value

    // Parse the value based on its type
    if (type === "u64" || type === "u128") {
      parsedValue = value === "" ? "" : Number(value)
    } else if (type === "boolean") {
      parsedValue = Boolean(value)
    } else if (type === "address") {
      // Keep as string
      parsedValue = value
    } else if (type === "vector<u8>") {
      // For simplicity, we'll treat vector<u8> as a string
      parsedValue = value
    }

    setParams((prevParams) => ({ ...prevParams, [name]: parsedValue }))
  }, [])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault()

      // Convert params object to array in the order of functionData.params
      const args = functionData.params.map((param) => params[param.name] ?? "")

      onSubmit(functionData.name, args)
    },
    [functionData.name, functionData.params, onSubmit, params],
  )

  const handleSimulate = useCallback(async () => {
    if (!isWalletConnected) return

    setIsSimulating(true)
    setSimulationResult(null)

    try {
      // Convert params object to array in the order of functionData.params
      const args = functionData.params.map((param) => params[param.name] ?? "")

      const result = await onSimulate(functionData.name, args)
      setSimulationResult(result)
    } catch (error) {
      console.error("Simulation error:", error)
    } finally {
      setIsSimulating(false)
    }
  }, [functionData.name, functionData.params, isWalletConnected, onSimulate, params])

  // Check if this is a time-related parameter
  const isTimeParam = useCallback(
    (name: string): boolean => {
      return name.toLowerCase().includes("time") && functionData.name === "execute_interest_waterfall"
    },
    [functionData.name],
  )

  // Check if this is a facility orchestrator parameter
  const isFacilityOrchestratorParam = useCallback((name: string): boolean => {
    return name === "facility_orchestrator"
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{functionData.name}</CardTitle>
            <CardDescription>{functionData.description}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="h-8 w-8 p-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
                    id={`${functionData.name}-${param.name}`}
                    label={param.name}
                    value={params[param.name] ?? ""}
                    onChange={(value) => handleParamChange(param.name, value, param.type)}
                    description={param.description}
                  />
                ) : param.type === "boolean" ? (
                  <div className="space-y-2">
                    <Label htmlFor={`${functionData.name}-${param.name}`} className="text-sm flex items-center gap-2">
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
                        id={`${functionData.name}-${param.name}`}
                        checked={!!params[param.name]}
                        onCheckedChange={(checked) => handleParamChange(param.name, checked, param.type)}
                      />
                      <label
                        htmlFor={`${functionData.name}-${param.name}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {param.name}
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`${functionData.name}-${param.name}`} className="text-sm">
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
                      id={`${functionData.name}-${param.name}`}
                      placeholder={
                        isFacilityOrchestratorParam(param.name) && facilityAddress
                          ? facilityAddress
                          : `Enter ${param.name}`
                      }
                      value={params[param.name] ?? ""}
                      onChange={(e) => handleParamChange(param.name, e.target.value, param.type)}
                      className={
                        isFacilityOrchestratorParam(param.name) && facilityAddress
                          ? "w-full border-green-300 focus:ring-green-500"
                          : "w-full"
                      }
                    />
                    {isFacilityOrchestratorParam(param.name) && facilityAddress && !params[param.name] && (
                      <p className="text-xs text-green-600">Using default facility address</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </form>

          <SimulationResults result={simulationResult} isLoading={isSimulating} />
        </CardContent>
      )}

      <CardFooter className={expanded ? "pt-2" : "pt-0"}>
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
          <Button type="button" onClick={() => handleSubmit()} disabled={!isWalletConnected} className="flex-1">
            Execute
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
