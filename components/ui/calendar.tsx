"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, MonthChangeEventHandler } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

// Create a type for DayPicker props that we expect to use
type DayPickerProps = React.ComponentProps<typeof DayPicker>

export interface CalendarProps extends Omit<DayPickerProps, 'mode'> {
  mode?: "single" | "range" | "month" | "multiple" | "default"
  className?: string
  classNames?: Record<string, string>
  showOutsideDays?: boolean
  selected?: Date | undefined
  defaultMonth?: Date | undefined
  onSelect?: (date: Date | undefined) => void
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  mode,
  ...props
}: CalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState<Date | undefined>(props.defaultMonth || new Date());
  
  const handleMonthChange: MonthChangeEventHandler = (month: Date) => {
    setInternalMonth(month);
    if (mode === "month" && props.onSelect) {
      // When in month mode, selecting a month means selecting the first day of the month
      const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      props.onSelect(firstDayOfMonth);
    }
  };
  
  const renderMonthContent = (month: Date) => {
    if (mode !== "month") return undefined;
    
    return (
      <div
        className={cn(
          "w-full h-full flex items-center justify-center p-2 cursor-pointer rounded-md hover:bg-accent",
          internalMonth && 
          internalMonth.getMonth() === month.getMonth() && 
          internalMonth.getFullYear() === month.getFullYear() && 
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (props.onSelect) {
            const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
            props.onSelect(firstDayOfMonth);
          }
        }}
      >
        {month.toLocaleDateString(undefined, { month: 'short' })}
      </div>
    );
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-x-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-range-end)]:rounded-r-md",
          mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start:
          "day-range-start aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_range_end:
          "day-range-end aria-selected:bg-primary aria-selected:text-primary-foreground",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("size-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("size-4", className)} {...props} />
        ),
      }}
      onMonthChange={handleMonthChange}
      {...(mode === "month" ? { 
        hideHead: true,
        formatters: { 
          formatMonthCaption: (date: Date) => date.toLocaleDateString(undefined, { year: 'numeric' }),
          formatWeekdayName: () => "" 
        },
        renderDay: () => <></>,
        renderMonth: (month: Date) => renderMonthContent(month)
      } : {})}
      {...props}
    />
  )
}

export { Calendar }
