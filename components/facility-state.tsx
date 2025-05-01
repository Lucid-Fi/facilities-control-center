import { formatTokenAmount } from "@/lib/utils/token";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FacilityStateProps {
  outstandingPrincipal: bigint;
  principalCollectionBalance: bigint;
  interestCollectionBalance: bigint;
  borrowingBase: bigint;
  facilityTests: {
    name: string;
    passed: boolean;
  }[];
}

export function FacilityState({
  outstandingPrincipal,
  principalCollectionBalance,
  interestCollectionBalance,
  borrowingBase,
  facilityTests,
}: FacilityStateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Facility State</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Outstanding Principal
            </p>
            <p className="text-lg font-semibold">
              {formatTokenAmount(outstandingPrincipal, 6)} USDT
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Principal Collection
            </p>
            <p className="text-lg font-semibold">
              {formatTokenAmount(principalCollectionBalance, 6)} USDT
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Interest Collection
            </p>
            <p className="text-lg font-semibold">
              {formatTokenAmount(interestCollectionBalance, 6)} USDT
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Borrowing Base
            </p>
            <p className="text-lg font-semibold">
              {formatTokenAmount(borrowingBase, 6)} USDT
            </p>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">
            Facility Tests
          </p>
          <div className="space-y-2">
            {facilityTests.map((test) => (
              <div key={test.name} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    test.passed ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm">{test.name}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
