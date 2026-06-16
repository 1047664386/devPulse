import { cn } from '@/lib/utils';

interface AvatarProps {
  src: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'w-6 h-6 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-14 h-14 text-lg' };

export default function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-medium',
        sizes[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}
