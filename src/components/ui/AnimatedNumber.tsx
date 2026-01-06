import { animated, useSpring } from "@react-spring/web";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  className?: string;
  decimals?: number;
}

export function AnimatedNumber({
  value,
  prefix = "",
  className,
  decimals = 2,
}: AnimatedNumberProps) {
  const { number } = useSpring({
    number: value,
    config: { tension: 120, friction: 14 },
  });

  return (
    <animated.span className={className}>
      {number.to(
        (n) =>
          `${prefix}${n.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}`
      )}
    </animated.span>
  );
}
