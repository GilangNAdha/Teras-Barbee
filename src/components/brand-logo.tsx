import Image from 'next/image';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  alt?: string;
  priority?: boolean;
  className?: string;
}

export function BrandLogo({ variant = 'light', alt = '', priority = false, className = '' }: BrandLogoProps) {
  const src = variant === 'light' ? '/images/teras-barber-logo-light.png' : '/images/teras-barber-logo-dark.png';
  return (
    <Image
      src={src}
      alt={alt}
      width={894}
      height={238}
      priority={priority}
      unoptimized
      draggable={false}
      className={`block select-none object-contain ${className}`.trim()}
    />
  );
}
