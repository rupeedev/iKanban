import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagChipProps {
  name: string;
  color?: string | null;
  onRemove?: () => void;
  removable?: boolean;
  className?: string;
}

// Function to determine if text should be light or dark based on background color
function getContrastColor(hexColor: string): string {
  // Default to white text if no color
  if (!hexColor || hexColor.length < 7) return '#FFFFFF';

  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

export function TagChip({
  name,
  color,
  onRemove,
  removable = false,
  className,
}: TagChipProps) {
  const backgroundColor = color || '#6B7280';
  const textColor = getContrastColor(backgroundColor);

  return (
    <Badge
      className={cn(
        'gap-1 px-2 py-0.5 text-xs font-medium border-0',
        removable && 'pr-1',
        className
      )}
      style={{
        backgroundColor,
        color: textColor,
      }}
    >
      {name}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70 rounded-full focus:outline-none focus:ring-1 focus:ring-offset-1"
          aria-label={`Remove ${name} tag`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </Badge>
  );
}
