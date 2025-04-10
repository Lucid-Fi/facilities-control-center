"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Clock } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

interface DateTimeInputProps {
  id: string
  label: string
  value: number | string
  onChange: (value: number) => void
  description?: string
}

export function DateTimeInput({ id, label, value, onChange, description }: DateTimeInputProps) {
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState<string>("00:00:00")
  const [rawInput, setRawInput] = useState<string>("")
  const [inputMode, setInputMode] = useState<"picker" | "raw">("picker")

  // Initialize date and time when value changes from props
  useEffect(() => {
    if (typeof value === "number" && value > 0) {
      // Convert microseconds to milliseconds for JavaScript Date
      const dateObj = new Date(value / 1000)
      setDate(dateObj)
      setTime(
        `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}:${String(
          dateObj.getSeconds(),
        ).padStart(2, "0")}`,
      )
      setRawInput(String(value))
    } else if (typeof value === "string" && value !== "") {
      setRawInput(value)
      try {
        const numValue = Number(value)
        if (!isNaN(numValue) && numValue > 0) {
          const dateObj = new Date(numValue / 1000)
          setDate(dateObj)
          setTime(
            `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}:${String(
              dateObj.getSeconds(),
            ).padStart(2, "0")}`,
          )
        }
      } catch {
        // Invalid date, keep raw input
      }
    }
  }, [value])

  // Handle date change
  const handleDateChange = (newDate: Date | undefined) => {
    setDate(newDate)
    if (newDate) {
      const [hours, minutes, seconds] = time.split(":").map(Number)
      const dateWithTime = new Date(newDate)
      dateWithTime.setHours(hours || 0)
      dateWithTime.setMinutes(minutes || 0)
      dateWithTime.setSeconds(seconds || 0)

      // Convert to microseconds
      const microseconds = dateWithTime.getTime() * 1000
      setRawInput(String(microseconds))
      onChange(microseconds)
    }
  }

  // Handle time change
  const handleTimeChange = (newTime: string) => {
    setTime(newTime)

    if (date) {
      const [hours, minutes, seconds] = newTime.split(":").map(Number)
      const dateWithTime = new Date(date)
      dateWithTime.setHours(hours || 0)
      dateWithTime.setMinutes(minutes || 0)
      dateWithTime.setSeconds(seconds || 0)

      // Convert to microseconds
      const microseconds = dateWithTime.getTime() * 1000
      setRawInput(String(microseconds))
      onChange(microseconds)
    }
  }

  const handleRawInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setRawInput(newValue)

    if (newValue === "") {
      onChange(0)
      return
    }

    try {
      const numValue = Number(newValue)
      if (!isNaN(numValue)) {
        onChange(numValue)

        // Also update the date and time if it's a valid timestamp
        if (numValue > 0) {
          const dateObj = new Date(numValue / 1000)
          setDate(dateObj)
          setTime(
            `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}:${String(
              dateObj.getSeconds(),
            ).padStart(2, "0")}`,
          )
        }
      }
    } catch {
      // Invalid input, just update the raw input
    }
  }

  const toggleInputMode = () => {
    setInputMode(inputMode === "picker" ? "raw" : "picker")
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={toggleInputMode} className="h-7 px-2 text-xs">
          {inputMode === "picker" ? "Use Raw Value" : "Use Date Picker"}
        </Button>
      </div>

      {description && <p className="text-sm text-gray-500">{description}</p>}

      {inputMode === "picker" ? (
        <div className="flex flex-col space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={date} onSelect={handleDateChange} initialFocus />
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <Input
                type="time"
                step="1"
                value={time}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="w-full sm:w-auto"
              />
            </div>
          </div>

          <div className="text-sm text-gray-500">Current value: {rawInput} microseconds</div>
        </div>
      ) : (
        <Input
          id={id}
          value={rawInput}
          onChange={handleRawInputChange}
          placeholder="Enter value in microseconds"
          className="w-full"
        />
      )}
    </div>
  )
}
