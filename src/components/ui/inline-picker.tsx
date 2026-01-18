import { useCallback, useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Picker } from '../Picker';

type InlinePickerValue = {
  selection: string;
};

type InlinePickerProps = {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  stretch?: boolean;
  className?: string;
  pickerClassName?: string;
  columnClassName?: string;
  itemHeight?: number;
  visibleItems?: number;
  labelHidden?: boolean;
};

const INLINE_PICKER_ITEM_HEIGHT = 28;
const INLINE_PICKER_VISIBLE_ITEMS = 3;

export function InlinePicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
  stretch = true,
  className,
  pickerClassName,
  columnClassName,
  itemHeight,
  visibleItems,
  labelHidden = false,
}: InlinePickerProps) {
  const hasOptions = options.length > 0;
  const resolvedItemHeight = itemHeight ?? INLINE_PICKER_ITEM_HEIGHT;
  const resolvedVisibleItems = visibleItems ?? INLINE_PICKER_VISIBLE_ITEMS;
  const pickerValue = useMemo<InlinePickerValue>(() => ({ selection: value ?? '' }), [value]);

  const handlePickerChange = useCallback(
    (nextValue: InlinePickerValue) => {
      onChange(nextValue.selection);
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        stretch ? 'flex-1' : null,
        disabled ? 'pointer-events-none opacity-60' : null,
        className,
      )}
    >
      <span
        className={
          labelHidden
            ? 'sr-only'
            : 'shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground'
        }
      >
        {label}
      </span>
      {hasOptions ? (
        <Picker
          value={pickerValue}
          onChange={(nextValue) => handlePickerChange(nextValue as InlinePickerValue)}
          height={resolvedItemHeight * resolvedVisibleItems}
          itemHeight={resolvedItemHeight}
          wheelMode="natural"
          className={cn('min-w-0 flex-1', pickerClassName)}
          aria-label={label}
        >
          <Picker.Column name="selection" className={cn('text-sm font-semibold', columnClassName)}>
            {options.map((item) => (
              <Picker.Item key={item} value={item}>
                {({ selected }) => (
                  <span className={selected ? 'text-primary' : 'text-muted'}>{item}</span>
                )}
              </Picker.Item>
            ))}
          </Picker.Column>
        </Picker>
      ) : (
        <span className="text-xs text-muted-foreground">No options available yet.</span>
      )}
    </div>
  );
}
