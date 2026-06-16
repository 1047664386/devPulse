import { cn } from '@/lib/utils';

interface TagBadgeProps {
  name: string;
  color?: string | null;
  slug?: string;
  onClick?: () => void;
  className?: string;
}

export default function TagBadge({ name, color, onClick, className }: TagBadgeProps) {
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors',
        onClick && 'cursor-pointer hover:opacity-80',
        className,
      )}
      style={{
        backgroundColor: color ? `${color}20` : '#e5e7eb',
        color: color || '#374151',
      }}
    >
      {name}
    </span>
  );
}
