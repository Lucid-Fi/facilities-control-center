"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface MonthPickerProps {
  month?: Date
  setMonth: (month: Date | undefined) => void
  className?: string
  disabled?: boolean
  placeholder?: string
}

export function MonthPicker({ 
  month, 
  setMonth, 
  className,
  disabled = false,
  placeholder = "Select month" 
}: MonthPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !month && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {month ? format(month, "MMMM yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="month"
          defaultMonth={month}
          selected={month}
          onSelect={setMonth}
          initialFocus={true}
        />
      </PopoverContent>
    </Popover>
  )
}