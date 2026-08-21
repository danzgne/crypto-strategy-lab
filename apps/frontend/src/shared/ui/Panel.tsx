import type { ComponentPropsWithoutRef } from 'react';

export function Panel({
  className = '',
  ...properties
}: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={`rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_60px_-36px_rgba(15,23,42,0.28)] ${className}`}
      {...properties}
    />
  );
}
