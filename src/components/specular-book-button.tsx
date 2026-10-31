'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import SpecularButton, { type SpecularButtonSize } from '@/components/specular-button';

export function SpecularBookButton({
  children = 'Book now',
  size = 'sm',
  className = '',
  onNavigate
}: {
  children?: ReactNode;
  size?: SpecularButtonSize;
  className?: string;
  onNavigate?: () => void;
}) {
  return <SpecularButton
    href="/book"
    size={size}
    radius={0}
    tint="#d7ff38"
    tintOpacity={0.92}
    textColor="#111111"
    lineColor="#f4f0e8"
    baseColor="#111111"
    intensity={0.8}
    idleIntensity={0.16}
    shineSize={8}
    shineFade={28}
    thickness={1.15}
    glow={0.55}
    followMouse
    proximity={220}
    className={`specular-book-button ${className}`.trim()}
    style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}
    onClick={() => onNavigate?.()}
  >
    <span>{children}</span><ArrowUpRight size={14} />
  </SpecularButton>;
}
