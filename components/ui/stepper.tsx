import { cn } from "@/lib/utils";

interface Step {
  title: string;
  description: string;
  state: "completed" | "current" | "upcoming";
}

interface StepperProps {
  steps: Step[];
  onStepClick?: (index: number) => void;
}

export function Stepper({ steps, onStepClick }: StepperProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div
          key={index}
          className={cn(
            "flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-colors",
            step.state === "current" && "bg-muted",
            step.state === "completed" && "opacity-50",
            onStepClick && "hover:bg-muted/50"
          )}
          onClick={() => onStepClick?.(index)}
        >
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
              step.state === "completed" && "bg-green-500 text-white",
              step.state === "current" && "bg-primary text-primary-foreground",
              step.state === "upcoming" &&
                "bg-muted-foreground/20 text-muted-foreground"
            )}
          >
            {step.state === "completed" ? "✓" : index + 1}
          </div>
          <div>
            <h3 className="font-medium">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
