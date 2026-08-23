import { useCallback, useMemo } from "react";
import { Picker } from "./Picker";

interface TimePickerProps {
  value: Date;
  onChange: (newDate: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, index) =>
  index.toString().padStart(2, "0")
);
const MINUTES = Array.from({ length: 60 }, (_, index) =>
  index.toString().padStart(2, "0")
);

type TimePickerValue = {
  hour: string;
  minute: string;
};

export function TimePicker({ value, onChange }: TimePickerProps) {
  const currentHour = value.getHours();
  const currentMinute = value.getMinutes();

  const pickerValue = useMemo<TimePickerValue>(
    () => ({
      hour: HOURS[currentHour],
      minute: MINUTES[currentMinute],
    }),
    [currentHour, currentMinute]
  );

  const setTime = useCallback(
    (hour: number, minute: number) => {
      const newDate = new Date(value);
      newDate.setHours(hour);
      newDate.setMinutes(minute);
      newDate.setSeconds(0);
      newDate.setMilliseconds(0);
      onChange(newDate);
    },
    [onChange, value]
  );

  const handlePickerChange = useCallback(
    (nextValue: TimePickerValue) => {
      const nextHour = Number(nextValue.hour);
      const nextMinute = Number(nextValue.minute);
      setTime(nextHour, nextMinute);
    },
    [setTime]
  );

  return (
    <Picker
      value={pickerValue}
      onChange={(nextValue) => handlePickerChange(nextValue)}
      height={168}
      itemHeight={32}
      wheelMode="natural"
      className="w-full rounded-2xl border border-border bg-card"
    >
      <Picker.Column name="hour" className="text-sm font-semibold">
        {HOURS.map((hour) => (
          <Picker.Item key={hour} value={hour}>
            {({ selected }) => (
              <span
                className={selected ? "text-primary" : "text-muted-foreground"}
              >
                {hour}
              </span>
            )}
          </Picker.Item>
        ))}
      </Picker.Column>
      <Picker.Column name="minute" className="text-sm font-semibold">
        {MINUTES.map((minute) => (
          <Picker.Item key={minute} value={minute}>
            {({ selected }) => (
              <span
                className={selected ? "text-primary" : "text-muted-foreground"}
              >
                {minute}
              </span>
            )}
          </Picker.Item>
        ))}
      </Picker.Column>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
        :
      </div>
    </Picker>
  );
}
