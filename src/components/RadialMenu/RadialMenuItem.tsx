import { motion } from 'framer-motion';

export interface RadialMenuSegmentProps {
  icon: string;
  label: string;
  startAngle: number;
  endAngle: number;
  outerRadius: number;
  isHovered: boolean;
  ringRadius: number;
  isCancel?: boolean;
  animationDelay: number;
  reducedMotion: boolean;
}

function polarToCartesian(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: radius * Math.cos(radians),
    y: radius * Math.sin(radians),
  };
}

function createHighlightArc(
  startAngle: number,
  endAngle: number,
  radius: number,
  thickness: number,
): string {
  const innerRadius = radius - thickness / 2;
  const outerRadius = radius + thickness / 2;
  const outerStart = polarToCartesian(startAngle, outerRadius);
  const outerEnd = polarToCartesian(endAngle, outerRadius);
  const innerStart = polarToCartesian(startAngle, innerRadius);
  const innerEnd = polarToCartesian(endAngle, innerRadius);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

const NODE_RADIUS = 20;

function estimateTextWidth(text: string): number {
  return text.length * 6.5;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function getRadialMenuLabelPosition(
  nodePosition: { x: number; y: number },
  outerRadius: number,
  labelWidth: number,
  labelHeight: number,
) {
  const labelHorizontalLimit = Math.max(0, outerRadius - labelWidth / 2);
  return {
    x: clamp(nodePosition.x, -labelHorizontalLimit, labelHorizontalLimit),
    y: Math.min(
      nodePosition.y + NODE_RADIUS + 8,
      outerRadius - labelHeight / 2,
    ),
  };
}

export function RadialMenuSegment({
  icon,
  label,
  startAngle,
  endAngle,
  outerRadius,
  isHovered,
  ringRadius,
  isCancel,
  animationDelay,
  reducedMotion,
}: RadialMenuSegmentProps) {
  const midAngle = (startAngle + endAngle) / 2;
  const nodePosition = polarToCartesian(midAngle, ringRadius);
  const textWidth = estimateTextWidth(label);
  const labelHeight = 22;
  const labelWidth = textWidth + 20;
  const labelPosition = getRadialMenuLabelPosition(
    nodePosition,
    outerRadius,
    labelWidth,
    labelHeight,
  );
  const highlightPath = createHighlightArc(startAngle, endAngle, ringRadius, 20);

  return (
    <motion.g
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={
        reducedMotion
          ? { duration: 0.1 }
          : {
              type: 'spring',
              stiffness: 390,
              damping: 29,
              delay: animationDelay,
            }
      }
      style={{ transformOrigin: '0px 0px' }}
    >
      <motion.path
        d={highlightPath}
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0.08 : 0.16 }}
        className={isCancel ? 'fill-danger/20' : 'fill-primary/20'}
      />

      <motion.circle
        cx={nodePosition.x}
        cy={nodePosition.y}
        initial={{ r: NODE_RADIUS - 3 }}
        animate={{ r: isHovered ? NODE_RADIUS + 3 : NODE_RADIUS }}
        transition={
          reducedMotion
            ? { duration: 0.08 }
            : { type: 'spring', stiffness: 520, damping: 31 }
        }
        className={
          isHovered
            ? isCancel
              ? 'fill-danger stroke-danger'
              : 'fill-primary stroke-primary'
            : isCancel
              ? 'fill-card stroke-danger'
              : 'fill-card stroke-border'
        }
        strokeWidth={1.5}
      />

      <motion.text
        x={nodePosition.x}
        y={nodePosition.y}
        textAnchor="middle"
        dominantBaseline="central"
        animate={{ scale: isHovered && !reducedMotion ? 1.08 : 1 }}
        transition={{ duration: 0.12 }}
        style={{
          transformOrigin: `${nodePosition.x}px ${nodePosition.y}px`,
        }}
        className={`text-sm font-bold ${
          isHovered
            ? isCancel
              ? 'fill-danger-foreground'
              : 'fill-primary-foreground'
            : isCancel
              ? 'fill-danger'
              : 'fill-foreground'
        }`}
      >
        {isCancel ? icon : label.charAt(0).toUpperCase()}
      </motion.text>

      <motion.rect
        x={labelPosition.x - labelWidth / 2}
        y={labelPosition.y - labelHeight / 2}
        width={labelWidth}
        height={labelHeight}
        rx={6}
        ry={6}
        animate={{ opacity: isHovered ? 1 : 0.88 }}
        transition={{ duration: reducedMotion ? 0.08 : 0.14 }}
        className="fill-card stroke-border"
        strokeWidth={1}
      />

      <motion.text
        x={labelPosition.x}
        y={labelPosition.y}
        textAnchor="middle"
        dominantBaseline="central"
        animate={{ opacity: 1 }}
        className={`text-xs font-semibold ${
          isHovered
            ? isCancel
              ? 'fill-danger'
              : 'fill-primary'
            : isCancel
              ? 'fill-danger/70'
              : 'fill-muted-foreground'
        }`}
      >
        {label}
      </motion.text>
    </motion.g>
  );
}
