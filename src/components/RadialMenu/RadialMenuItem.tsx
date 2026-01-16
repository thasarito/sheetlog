import { motion } from 'framer-motion';

export interface RadialMenuSegmentProps {
  icon: string;
  label: string;
  shortcut?: string;
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  isHovered: boolean;
  ringRadius: number;
  isCancel?: boolean;
}

function polarToCartesian(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: radius * Math.cos(rad),
    y: radius * Math.sin(rad),
  };
}

// Create arc path for the highlight
function createHighlightArc(
  startAngle: number,
  endAngle: number,
  radius: number,
  thickness: number
): string {
  const innerR = radius - thickness / 2;
  const outerR = radius + thickness / 2;

  const outerStart = polarToCartesian(startAngle, outerR);
  const outerEnd = polarToCartesian(endAngle, outerR);
  const innerStart = polarToCartesian(startAngle, innerR);
  const innerEnd = polarToCartesian(endAngle, innerR);

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

const NODE_RADIUS = 18;

export function RadialMenuSegment({
  icon,
  label,
  startAngle,
  endAngle,
  isHovered,
  ringRadius,
  isCancel,
}: RadialMenuSegmentProps) {
  // Calculate node position at the center of the segment
  const midAngle = (startAngle + endAngle) / 2;
  const nodePos = polarToCartesian(midAngle, ringRadius);

  // Calculate label position (outside the ring)
  const labelRadius = ringRadius + 40;
  const labelPos = polarToCartesian(midAngle, labelRadius);

  const highlightPath = createHighlightArc(startAngle, endAngle, ringRadius, 16);

  return (
    <g>
      {/* Highlight arc for active segment */}
      {isHovered && (
        <motion.path
          d={highlightPath}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={isCancel ? 'fill-danger/20' : 'fill-primary/20'}
        />
      )}

      {/* Node circle */}
      <motion.circle
        cx={nodePos.x}
        cy={nodePos.y}
        r={NODE_RADIUS}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className={
          isHovered
            ? isCancel
              ? 'fill-danger stroke-danger'
              : 'fill-primary stroke-primary'
            : isCancel
              ? 'fill-card stroke-danger'
              : 'fill-card stroke-border'
        }
        strokeWidth={1}
      />

      {/* Initial as icon */}
      <motion.text
        x={nodePos.x}
        y={nodePos.y}
        textAnchor="middle"
        dominantBaseline="central"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
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

      {/* Label text */}
      <motion.text
        x={labelPos.x}
        y={labelPos.y}
        textAnchor="middle"
        dominantBaseline="middle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
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
    </g>
  );
}
