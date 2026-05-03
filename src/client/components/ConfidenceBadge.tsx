interface ConfidenceBadgeProps {
  value: number;
}

export default function ConfidenceBadge({ value }: ConfidenceBadgeProps) {
  return (
    <span className="confidence-badge">
      {Math.round(Math.max(0, Math.min(1, value)) * 100)}%
    </span>
  );
}
