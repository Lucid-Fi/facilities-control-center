import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SimulationResult } from "@/lib/aptos-client"
import { Check, X } from "lucide-react"

interface SimulationResultsProps {
  result: SimulationResult | null
  isLoading: boolean
}

export function SimulationResults({ result, isLoading }: SimulationResultsProps) {
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
    )
  }

  if (!result) return null

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Simulation Results
          {result.success ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Check className="h-3 w-3 mr-1" /> Success
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <X className="h-3 w-3 mr-1" /> Failed
            </Badge>
          )}
        </CardTitle>
        <CardDescription>VM Status: {result.vmStatus}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="events">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="events">Events ({result.events.length})</TabsTrigger>
            <TabsTrigger value="changes">State Changes ({result.changes.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="events" className="p-2">
            {result.events.length > 0 ? (
              <div className="space-y-4">
                {result.events.map((event, index) => (
                  <div key={index} className="border rounded-md p-3">
                    <div className="font-medium text-sm mb-1">{formatEventType(event.type)}</div>
                    <div className="text-xs text-gray-500 mb-2">Sequence: {event.sequenceNumber}</div>
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">No events emitted</div>
            )}
          </TabsContent>
          <TabsContent value="changes" className="p-2">
            {result.changes.length > 0 ? (
              <div className="space-y-4">
                {result.changes.map((change, index) => (
                  <div key={index} className="border rounded-md p-3">
                    <div className="font-medium text-sm mb-1">{change.type}</div>
                    <div className="text-xs text-gray-500 mb-2">Resource: {change.resource}</div>
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono overflow-x-auto">
                      {JSON.stringify(change.data, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">No state changes</div>
            )}
          </TabsContent>
        </Tabs>
        <div className="mt-4 text-sm text-gray-500">
          <div>Gas Used: {result.gasUsed}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatEventType(type: string): string {
  // Format event type for better readability
  // Example: 0x1::coin::DepositEvent -> Deposit Event (coin)
  try {
    const parts = type.split("::")
    if (parts.length === 3) {
      const module = parts[1]
      let eventName = parts[2]

      // Remove "_event" suffix if present
      if (eventName.toLowerCase().endsWith("_event")) {
        eventName = eventName.slice(0, -6)
      }

      // Add spaces before capital letters and capitalize first letter
      eventName = eventName
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase())

      return `${eventName} (${module})`
    }
  } catch (e) {
    // If parsing fails, return the original
  }
  return type
}
