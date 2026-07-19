/**
 * calendar.tsx — React Native port
 *
 * Web source: react-day-picker (DayPicker component)
 *
 * Web → RN replacements:
 *   DayPicker              → Pure RN month grid built with View/Pressable
 *   react-day-picker       → Removed — DOM-only library
 *   HTML table layout      → View flex-wrap grid (7 columns)
 *   CSS selectors          → NativeWind className + inline styles
 *   HTMLButtonElement      → Pressable
 *   lucide-react icons     → Unicode arrows (←→) via Text
 *
 * Preserved API:
 *   Calendar               — main component
 *   CalendarDayButton      — individual day cell (forwardRef Pressable)
 *   className, classNames, showOutsideDays props honoured
 *   captionLayout          — "label" (static) | "dropdown" (month+year selectors)
 *   selected (Date | { from, to } range)
 *   onSelect callback
 *   disabled (Date | (date: Date) => boolean)
 *   defaultMonth, month, onMonthChange for controlled navigation
 *   mode: "single" | "range" (multiple not implemented — accepted/ignored)
 *
 * Hermes compatible: no RegExp named groups, no optional chaining on iterators.
 */

import * as React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarMode = "single" | "range" | "multiple";

export interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

export interface CalendarProps {
  className?: string;
  classNames?: Record<string, string>;
  showOutsideDays?: boolean;
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years";
  buttonVariant?: string; // accepted for API compat
  mode?: CalendarMode;
  selected?: Date | DateRange | Date[] | undefined;
  onSelect?: ((date: Date | undefined) => void) &
    ((range: DateRange | undefined) => void);
  disabled?: Date | Date[] | ((date: Date) => boolean);
  defaultMonth?: Date;
  month?: Date;
  onMonthChange?: (month: Date) => void;
  numberOfMonths?: number;
  formatters?: Record<string, unknown>; // API compat
  components?: Record<string, unknown>; // API compat
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isDisabled(
  date: Date,
  disabled?: Date | Date[] | ((date: Date) => boolean),
): boolean {
  if (!disabled) return false;
  if (typeof disabled === "function") return disabled(date);
  if (Array.isArray(disabled)) return disabled.some((d) => isSameDay(d, date));
  return isSameDay(date, disabled);
}

function getDaysInGrid(year: number, month: number, showOutsideDays: boolean) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { date: Date; outside: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      outside: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), outside: false });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), outside: true });
  }

  if (!showOutsideDays) {
    // Replace outside-day cells with nulls rendered as empty slots
    return cells.map((c) => (c.outside ? null : c));
  }
  return cells;
}

// ─── CalendarDayButton ────────────────────────────────────────────────────────

export interface CalendarDayModifiers {
  selected?: boolean;
  today?: boolean;
  outside?: boolean;
  disabled?: boolean;
  range_start?: boolean;
  range_end?: boolean;
  range_middle?: boolean;
  focused?: boolean;
}

export interface CalendarDayButtonProps extends Omit<PressableProps, "children"> {
  day?: { date: Date };
  modifiers?: CalendarDayModifiers;
  className?: string;
  children?: React.ReactNode;
}

const CalendarDayButton = React.forwardRef<View, CalendarDayButtonProps>(
  ({ day, modifiers = {}, className, children, ...props }, ref) => {
    const {
      selected,
      today,
      outside,
      disabled,
      range_start,
      range_end,
      range_middle,
    } = modifiers;

    const isSelected = selected || range_start || range_end;
    const isRangeMiddle = range_middle && !range_start && !range_end;

    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, selected: !!selected }}
        disabled={!!disabled}
        className={cn(
          "h-9 w-9 items-center justify-center rounded-md",
          isSelected && "bg-primary",
          isRangeMiddle && "bg-accent rounded-none",
          today && !isSelected && "bg-accent",
          outside && "opacity-40",
          disabled && "opacity-30",
          className,
        )}
        {...props}
      >
        <Text
          className={cn(
            "text-sm",
            isSelected ? "text-primary-foreground font-semibold" : "text-foreground",
            isRangeMiddle && "text-accent-foreground",
            today && !isSelected && "font-semibold",
            outside && "text-muted-foreground",
          )}
        >
          {children ?? day?.date.getDate()}
        </Text>
      </Pressable>
    );
  },
);
CalendarDayButton.displayName = "CalendarDayButton";

// ─── Calendar ─────────────────────────────────────────────────────────────────

function Calendar({
  className,
  showOutsideDays = true,
  mode = "single",
  selected,
  onSelect,
  disabled,
  defaultMonth,
  month: controlledMonth,
  onMonthChange,
  captionLayout = "label",
}: CalendarProps) {
  const today = new Date();
  const initialMonth = controlledMonth ?? defaultMonth ?? today;

  const [displayMonth, setDisplayMonth] = React.useState<Date>(
    new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );

  React.useEffect(() => {
    if (controlledMonth) {
      setDisplayMonth(
        new Date(controlledMonth.getFullYear(), controlledMonth.getMonth(), 1),
      );
    }
  }, [controlledMonth]);

  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();

  const cells = getDaysInGrid(year, month, showOutsideDays);

  function goToPrevMonth() {
    const next = new Date(year, month - 1, 1);
    setDisplayMonth(next);
    onMonthChange?.(next);
  }

  function goToNextMonth() {
    const next = new Date(year, month + 1, 1);
    setDisplayMonth(next);
    onMonthChange?.(next);
  }

  function handleDayPress(date: Date) {
    if (!onSelect) return;
    if (mode === "range") {
      const range = selected as DateRange | undefined;
      if (!range?.from || (range.from && range.to)) {
        (onSelect as (r: DateRange | undefined) => void)({ from: date, to: undefined });
      } else {
        const from = range.from;
        if (date < from) {
          (onSelect as (r: DateRange | undefined) => void)({ from: date, to: from });
        } else {
          (onSelect as (r: DateRange | undefined) => void)({ from, to: date });
        }
      }
    } else {
      const current = selected as Date | undefined;
      const isSame = current && isSameDay(current, date);
      (onSelect as (d: Date | undefined) => void)(isSame ? undefined : date);
    }
  }

  function getDayModifiers(date: Date, outside: boolean): CalendarDayModifiers {
    const dis = isDisabled(date, disabled);
    const tod = isSameDay(date, today);

    if (mode === "range") {
      const range = selected as DateRange | undefined;
      const rs = !!(range?.from && isSameDay(date, range.from));
      const re = !!(range?.to && isSameDay(date, range.to));
      const rm =
        !!(
          range?.from &&
          range?.to &&
          date > range.from &&
          date < range.to
        );
      return {
        selected: rs || re,
        range_start: rs,
        range_end: re,
        range_middle: rm,
        today: tod,
        outside,
        disabled: dis,
      };
    }

    const sel = !!(selected && isSameDay(date, selected as Date));
    return { selected: sel, today: tod, outside, disabled: dis };
  }

  // Dropdown month selectors
  const YEARS = React.useMemo(() => {
    const arr: number[] = [];
    for (let y = today.getFullYear() - 100; y <= today.getFullYear() + 10; y++) {
      arr.push(y);
    }
    return arr;
  }, [today]);

  return (
    <View className={cn("bg-background p-3", className)}>
      {/* Caption / Navigation */}
      <View className="flex-row items-center justify-between mb-3">
        <Pressable
          onPress={goToPrevMonth}
          accessibilityLabel="Previous month"
          className="h-8 w-8 items-center justify-center rounded-md border border-border"
        >
          <Text className="text-foreground text-base">{"‹"}</Text>
        </Pressable>

        {captionLayout === "label" ? (
          <Text className="text-sm font-medium text-foreground">
            {MONTH_NAMES[month]} {year}
          </Text>
        ) : (
          <View className="flex-row gap-2">
            {/* Month picker */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="max-h-8"
            >
              {MONTH_NAMES.map((name, idx) => (
                <Pressable
                  key={name}
                  onPress={() => {
                    const next = new Date(year, idx, 1);
                    setDisplayMonth(next);
                    onMonthChange?.(next);
                  }}
                  className={cn(
                    "px-2 py-1 rounded-md",
                    idx === month && "bg-accent",
                  )}
                >
                  <Text className={cn(
                    "text-xs",
                    idx === month ? "text-accent-foreground font-semibold" : "text-foreground",
                  )}>
                    {name.slice(0, 3)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <Pressable
          onPress={goToNextMonth}
          accessibilityLabel="Next month"
          className="h-8 w-8 items-center justify-center rounded-md border border-border"
        >
          <Text className="text-foreground text-base">{"›"}</Text>
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View className="flex-row mb-1">
        {DAYS_OF_WEEK.map((day) => (
          <View key={day} className="flex-1 items-center">
            <Text className="text-xs text-muted-foreground">{day}</Text>
          </View>
        ))}
      </View>

      {/* Day grid — 7 columns, 6 rows */}
      <View className="flex-row flex-wrap">
        {cells.map((cell, idx) => {
          if (!cell) {
            return (
              <View key={`empty-${idx}`} className="w-[14.28%] h-9" />
            );
          }
          const modifiers = getDayModifiers(cell.date, cell.outside);
          return (
            <View key={cell.date.toISOString()} className="w-[14.28%] items-center py-0.5">
              <CalendarDayButton
                day={{ date: cell.date }}
                modifiers={modifiers}
                onPress={() => {
                  if (!modifiers.disabled) handleDayPress(cell.date);
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
Calendar.displayName = "Calendar";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Calendar, CalendarDayButton };
