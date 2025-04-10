"use client"

import type React from "react"

import { useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
}

export function TimePickerDemo({ value, onChange }: TimePickerProps) {
  const minuteRef = useRef<HTMLInputElement>(null)
  const secondRef = useRef<HTMLInputElement>(null)

  const [hours, minutes, seconds] = value.split(":").map(Number)

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHour = e.target.value === "" ? "00" : e.target.value.padStart(2, "0")
    const newValue = `${newHour}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    onChange(newValue)

    if (e.target.value.length >= 2) {
      minuteRef.current?.focus()
    }
  }

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMinute = e.target.value === "" ? "00" : e.target.value.padStart(2, "0")
    const newValue = `${String(hours).padStart(2, "0")}:${newMinute}:${String(seconds).padStart(2, "0")}`
    onChange(newValue)

    if (e.target.value.length >= 2) {
      secondRef.current?.focus()
    }
  }

  const handleSecondChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSecond = e.target.value === "" ? "00" : e.target.value.padStart(2, "0")
    const newValue = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${newSecond}`
    onChange(newValue)
  }

  return (
    <div className="flex items-center space-x-2">
      <div className="grid gap-1 text-center">
        <Label htmlFor="hours" className="text-xs">
          Hours
        </Label>
        <Input
          id="hours"
          className="w-12 text-center"
          value={String(hours).padStart(2, "0")}
          onChange={handleHourChange}
          max={23}
          min={0}
          type="number"
        />
      </div>
      <div className="grid gap-1 text-center">
        <Label htmlFor="minutes" className="text-xs">
          Minutes
        </Label>
        <Input
          id="minutes"
          className="w-12 text-center"
          value={String(minutes).padStart(2, "0")}
          onChange={handleMinuteChange}
          max={59}
          min={0}
          type="number"
          ref={minuteRef}
        />
      </div>
      <div className="grid gap-1 text-center">
        <Label htmlFor="seconds" className="text-xs">
          Seconds
        </Label>
        <Input
          id="seconds"
          className="w-12 text-center"
          value={String(seconds).padStart(2, "0")}
          onChange={handleSecondChange}
          max={59}
          min={0}
          type="number"
          ref={secondRef}
        />
      </div>
    </div>
  )
}
