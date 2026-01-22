import type React from "react";
import {type 
  CSSProperties,type 
  HTMLProps,type 
  MutableRefObject,type 
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"

interface Option {
  value: string | number;
  element: MutableRefObject<HTMLElement | null>;
}

interface PickerValue {
  [key: string]: string | number;
}

interface PickerRootProps<TType extends PickerValue>
  extends Omit<HTMLProps<HTMLDivElement>, "value" | "onChange"> {
  value: TType;
  onChange: (value: TType, key: string) => void;
  height?: number;
  itemHeight?: number;
  wheelMode?: "off" | "natural" | "normal";
}

const DEFAULT_HEIGHT = 168;
const DEFAULT_ITEM_HEIGHT = 32;
const DEFAULT_WHEEL_MODE = "off";

const PickerDataContext = createContext<{
  height: number;
  itemHeight: number;
  wheelMode: "off" | "natural" | "normal";
  value: PickerValue;
  optionGroups: { [key: string]: Option[] };
} | null>(null);
PickerDataContext.displayName = "PickerDataContext";

type ErrorWithCaptureStackTrace = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: unknown) => void;
};

const ErrorCapture = Error as unknown as ErrorWithCaptureStackTrace;

function usePickerData(componentName: string) {
  const context = useContext(PickerDataContext);
  if (context === null) {
    const error = new Error(
      `<${componentName} /> is missing a parent <Picker /> component.`
    );
    if (ErrorCapture.captureStackTrace) {
      ErrorCapture.captureStackTrace(error, usePickerData);
    }
    throw error;
  }
  return context;
}

const PickerActionsContext = createContext<{
  registerOption(key: string, option: Option): () => void;
  change(key: string, value: string | number): boolean;
} | null>(null);
PickerActionsContext.displayName = "PickerActionsContext";

function usePickerActions(componentName: string) {
  const context = useContext(PickerActionsContext);
  if (context === null) {
    const error = new Error(
      `<${componentName} /> is missing a parent <Picker /> component.`
    );
    if (ErrorCapture.captureStackTrace) {
      ErrorCapture.captureStackTrace(error, usePickerActions);
    }
    throw error;
  }
  return context;
}

function sortByDomNode<T>(
  nodes: T[],
  resolveKey: (item: T) => HTMLElement | null = (i) =>
    i as unknown as HTMLElement | null
): T[] {
  return nodes.slice().sort((aItem, zItem) => {
    const a = resolveKey(aItem);
    const z = resolveKey(zItem);

    if (a === null || z === null) return 0;

    const position = a.compareDocumentPosition(z);

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

function pickerReducer(
  optionGroups: { [key: string]: Option[] },
  action: {
    type: "REGISTER_OPTION" | "UNREGISTER_OPTION";
    key: string;
    option: Option;
  }
) {
  switch (action.type) {
    case "REGISTER_OPTION": {
      const { key, option } = action;
      let nextOptionsForKey = [...(optionGroups[key] || []), option];
      nextOptionsForKey = sortByDomNode(
        nextOptionsForKey,
        (optionItem) => optionItem.element.current
      );
      return {
        ...optionGroups,
        [key]: nextOptionsForKey,
      };
    }
    case "UNREGISTER_OPTION": {
      const { key, option } = action;
      return {
        ...optionGroups,
        [key]: (optionGroups[key] || []).filter(
          (optionItem) => optionItem !== option
        ),
      };
    }
    default: {
      throw Error(`Unknown action: ${action.type as string}`);
    }
  }
}

function PickerRoot<TType extends PickerValue>(props: PickerRootProps<TType>) {
  const {
    style,
    children,
    value,
    onChange,
    height = DEFAULT_HEIGHT,
    itemHeight = DEFAULT_ITEM_HEIGHT,
    wheelMode = DEFAULT_WHEEL_MODE,
    ...restProps
  } = props;

  const highlightStyle = useMemo<CSSProperties>(
    () => ({
      height: itemHeight,
      marginTop: -(itemHeight / 2),
      position: "absolute",
      top: "50%",
      left: 0,
      width: "100%",
      pointerEvents: "none",
    }),
    [itemHeight]
  );
  const containerStyle = useMemo<CSSProperties>(
    () => ({
      height: `${height}px`,
      position: "relative",
      display: "flex",
      justifyContent: "center",
      overflow: "hidden",
      maskImage:
        "linear-gradient(to top, transparent, transparent 5%, white 20%, white 80%, transparent 95%, transparent)",
      WebkitMaskImage:
        "linear-gradient(to top, transparent, transparent 5%, white 20%, white 80%, transparent 95%, transparent)",
    }),
    [height]
  );

  const [optionGroups, dispatch] = useReducer(pickerReducer, {});

  const pickerData = useMemo(
    () => ({ height, itemHeight, wheelMode, value, optionGroups }),
    [height, itemHeight, value, optionGroups, wheelMode]
  );

  const triggerChange = useCallback(
    (key: string, nextValue: string | number) => {
      if (value[key] === nextValue) return false;
      const nextPickerValue = { ...value, [key]: nextValue };
      onChange(nextPickerValue, key);
      return true;
    },
    [onChange, value]
  );
  const registerOption = useCallback((key: string, option: Option) => {
    dispatch({ type: "REGISTER_OPTION", key, option });
    return () => dispatch({ type: "UNREGISTER_OPTION", key, option });
  }, []);
  const pickerActions = useMemo(
    () => ({ registerOption, change: triggerChange }),
    [registerOption, triggerChange]
  );

  return (
    <div
      style={{
        ...containerStyle,
        ...style,
      }}
      data-vaul-no-drag
      {...restProps}
    >
      <PickerActionsContext.Provider value={pickerActions}>
        <PickerDataContext.Provider value={pickerData}>
          {children}
        </PickerDataContext.Provider>
      </PickerActionsContext.Provider>
      <div style={highlightStyle}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: "auto",
            left: 0,
            right: "auto",
            width: "100%",
            height: "1px",
            background: "rgba(255, 255, 255, 0.2)",
            transform: "scaleY(0.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "auto",
            bottom: 0,
            left: 0,
            right: "auto",
            width: "100%",
            height: "1px",
            background: "rgba(255, 255, 255, 0.2)",
            transform: "scaleY(0.5)",
          }}
        />
      </div>
    </div>
  );
}

interface PickerColumnProps extends HTMLProps<HTMLDivElement> {
  name: string;
}

const PickerColumnDataContext = createContext<{
  key: string;
} | null>(null);
PickerColumnDataContext.displayName = "PickerColumnDataContext";

function useColumnData(componentName: string) {
  const context = useContext(PickerColumnDataContext);
  if (context === null) {
    const error = new Error(
      `<${componentName} /> is missing a parent <Picker.Column /> component.`
    );
    if (ErrorCapture.captureStackTrace) {
      ErrorCapture.captureStackTrace(error, useColumnData);
    }
    throw error;
  }
  return context;
}

function PickerColumn({
  style,
  children,
  name: key,
  ...restProps
}: PickerColumnProps) {
  const {
    height,
    itemHeight,
    wheelMode,
    value: groupValue,
    optionGroups,
  } = usePickerData("Picker.Column");

  const value = useMemo(() => groupValue[key], [groupValue, key]);
  const options = useMemo(() => optionGroups[key] || [], [key, optionGroups]);
  const selectedIndex = useMemo(() => {
    let index = options.findIndex((optionItem) => optionItem.value === value);
    if (index < 0) {
      index = 0;
    }
    return index;
  }, [options, value]);

  const minTranslate = useMemo(
    () => height / 2 - itemHeight * options.length + itemHeight / 2,
    [height, itemHeight, options]
  );
  const maxTranslate = useMemo(
    () => height / 2 - itemHeight / 2,
    [height, itemHeight]
  );
  const [scrollerTranslate, setScrollerTranslate] = useState<number>(0);
  useEffect(() => {
    setScrollerTranslate(
      height / 2 - itemHeight / 2 - selectedIndex * itemHeight
    );
  }, [height, itemHeight, selectedIndex]);

  const pickerActions = usePickerActions("Picker.Column");
  const translateRef = useRef<number>(scrollerTranslate);
  translateRef.current = scrollerTranslate;
  const handleScrollerTranslateSettled = useCallback(() => {
    if (options.length === 0) {
      return;
    }

    let nextActiveIndex = 0;
    const currentTrans = translateRef.current;
    if (currentTrans >= maxTranslate) {
      nextActiveIndex = 0;
    } else if (currentTrans <= minTranslate) {
      nextActiveIndex = options.length - 1;
    } else {
      nextActiveIndex = -Math.round((currentTrans - maxTranslate) / itemHeight);
    }

    const changed = pickerActions.change(key, options[nextActiveIndex].value);
    if (!changed) {
      setScrollerTranslate(
        height / 2 - itemHeight / 2 - nextActiveIndex * itemHeight
      );
    }
  }, [
    pickerActions,
    height,
    itemHeight,
    key,
    maxTranslate,
    minTranslate,
    options,
  ]);

  const [startScrollerTranslate, setStartScrollerTranslate] =
    useState<number>(0);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [isMomentum, setIsMomentum] = useState<boolean>(false);
  const [startTouchY, setStartTouchY] = useState<number>(0);
  const lastTouchYRef = useRef<number>(0);
  const lastTouchTimeRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const momentumRafRef = useRef<number | null>(null);

  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
    setIsMomentum(false);
  }, []);

  const updateScrollerWhileMoving = useCallback(
    (nextScrollerTranslate: number) => {
      if (nextScrollerTranslate < minTranslate) {
        nextScrollerTranslate =
          minTranslate - (minTranslate - nextScrollerTranslate) ** 0.8;
      } else if (nextScrollerTranslate > maxTranslate) {
        nextScrollerTranslate =
          maxTranslate + (nextScrollerTranslate - maxTranslate) ** 0.8;
      }
      setScrollerTranslate(nextScrollerTranslate);
    },
    [maxTranslate, minTranslate]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      stopMomentum();
      setStartTouchY(event.targetTouches[0].pageY);
      setStartScrollerTranslate(scrollerTranslate);
      lastTouchYRef.current = event.targetTouches[0].pageY;
      lastTouchTimeRef.current = performance.now();
      velocityRef.current = 0;
    },
    [scrollerTranslate, stopMomentum]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }

      if (!isMoving) {
        setIsMoving(true);
      }

      const currentY = event.targetTouches[0].pageY;
      const now = performance.now();
      const dt = now - lastTouchTimeRef.current;
      if (dt > 0) {
        const delta = currentY - lastTouchYRef.current;
        const instantVelocity = delta / dt;
        velocityRef.current = velocityRef.current * 0.8 + instantVelocity * 0.2;
        lastTouchYRef.current = currentY;
        lastTouchTimeRef.current = now;
      }

      const nextScrollerTranslate =
        startScrollerTranslate + currentY - startTouchY;
      updateScrollerWhileMoving(nextScrollerTranslate);
    },
    [isMoving, startScrollerTranslate, startTouchY, updateScrollerWhileMoving]
  );

  const startMomentum = useCallback(() => {
    stopMomentum();
    setIsMomentum(true);
    let lastTime = performance.now();
    const decay = 0.95;
    const minVelocity = 0.02;

    const step = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;

      const velocity = velocityRef.current;
      const nextScrollerTranslate = translateRef.current + velocity * dt;
      updateScrollerWhileMoving(nextScrollerTranslate);

      let nextVelocity = velocity * decay ** (dt / 16);
      if (
        nextScrollerTranslate < minTranslate ||
        nextScrollerTranslate > maxTranslate
      ) {
        nextVelocity *= 0.6;
      }
      velocityRef.current = nextVelocity;

      if (Math.abs(nextVelocity) < minVelocity) {
        stopMomentum();
        handleScrollerTranslateSettled();
        return;
      }

      momentumRafRef.current = requestAnimationFrame(step);
    };

    momentumRafRef.current = requestAnimationFrame(step);
  }, [
    handleScrollerTranslateSettled,
    maxTranslate,
    minTranslate,
    stopMomentum,
    updateScrollerWhileMoving,
  ]);

  const handleTouchEnd = useCallback(() => {
    if (!isMoving) {
      return;
    }
    setIsMoving(false);
    setStartTouchY(0);
    setStartScrollerTranslate(0);

    if (Math.abs(velocityRef.current) > 0.02) {
      startMomentum();
      return;
    }

    handleScrollerTranslateSettled();
  }, [handleScrollerTranslateSettled, isMoving, startMomentum]);

  const handleTouchCancel = useCallback(() => {
    if (!isMoving) {
      return;
    }
    stopMomentum();
    setIsMoving(false);
    setStartTouchY(0);
    setScrollerTranslate(startScrollerTranslate);
    setStartScrollerTranslate(0);
  }, [isMoving, startScrollerTranslate, stopMomentum]);

  const wheelingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWheeling = useCallback(
    (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }
      let delta = event.deltaY * 0.1;
      if (Math.abs(delta) < itemHeight) {
        delta = itemHeight * Math.sign(delta);
      }
      if (wheelMode === "normal") {
        delta = -delta;
      }

      const nextScrollerTranslate = scrollerTranslate + delta;
      updateScrollerWhileMoving(nextScrollerTranslate);
    },
    [itemHeight, scrollerTranslate, updateScrollerWhileMoving, wheelMode]
  );

  const handleWheelEnd = useCallback(() => {
    handleScrollerTranslateSettled();
  }, [handleScrollerTranslateSettled]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (wheelMode === "off") {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      handleWheeling(event);

      if (wheelingTimer.current) {
        clearTimeout(wheelingTimer.current);
      }

      wheelingTimer.current = setTimeout(() => {
        handleWheelEnd();
      }, 200);
    },
    [handleWheelEnd, handleWheeling, wheelMode]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      container.addEventListener("wheel", handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener("touchmove", handleTouchMove);
        container.removeEventListener("wheel", handleWheel);
      }
    };
  }, [handleTouchMove, handleWheel]);

  useEffect(() => {
    return () => {
      stopMomentum();
    };
  }, [stopMomentum]);

  const columnStyle = useMemo<CSSProperties>(
    () => ({
      flex: "1 1 0%",
      maxHeight: "100%",
      transitionProperty: "transform",
      transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
      transitionDuration: isMoving || isMomentum ? "0ms" : "300ms",
      transform: `translate3d(0, ${scrollerTranslate}px, 0)`,
    }),
    [scrollerTranslate, isMomentum, isMoving]
  );

  const columnData = useMemo(() => ({ key }), [key]);

  return (
    <div
      style={{
        ...columnStyle,
        ...style,
      }}
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      {...restProps}
    >
      <PickerColumnDataContext.Provider value={columnData}>
        {children}
      </PickerColumnDataContext.Provider>
    </div>
  );
}

interface PickerItemRenderProps {
  selected: boolean;
}

interface PickerItemProps
  extends Omit<HTMLProps<HTMLButtonElement>, "value" | "children" | "type"> {
  children: ReactNode | ((renderProps: PickerItemRenderProps) => ReactNode);
  value: string | number;
}

function isFunction(
  functionToCheck: PickerItemProps["children"]
): functionToCheck is (renderProps: PickerItemRenderProps) => ReactNode {
  return typeof functionToCheck === "function";
}

function PickerItem({ style, children, value, ...restProps }: PickerItemProps) {
  const optionRef = useRef<HTMLButtonElement | null>(null);
  const { itemHeight, value: pickerValue } = usePickerData("Picker.Item");
  const pickerActions = usePickerActions("Picker.Item");
  const { key } = useColumnData("Picker.Item");

  useEffect(
    () => pickerActions.registerOption(key, { value, element: optionRef }),
    [key, pickerActions, value]
  );

  const itemStyle = useMemo(
    () => ({
      height: `${itemHeight}px`,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "none",
      border: "none",
      padding: 0,
      width: "100%",
      font: "inherit",
      color: "inherit",
    }),
    [itemHeight]
  );

  const handleClick = useCallback(() => {
    pickerActions.change(key, value);
  }, [pickerActions, key, value]);

  return (
    <button
      type="button"
      style={{
        ...itemStyle,
        ...style,
      }}
      ref={optionRef}
      onClick={handleClick}
      {...restProps}
    >
      {isFunction(children)
        ? children({ selected: pickerValue[key] === value })
        : children}
    </button>
  );
}

export const Picker = PickerRoot as typeof PickerRoot & {
  Column: typeof PickerColumn;
  Item: typeof PickerItem;
};
Picker.Column = PickerColumn;
Picker.Item = PickerItem;
