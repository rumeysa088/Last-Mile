// Organic blob shapes from the design canvas. Decorative only: always aria-hidden.
import type { ReactNode } from 'react'

const SHAPES = [
  'M30 2C46 0 58 12 57 29C56 46 44 58 27 57C11 56 1 44 2 28C3 13 15 4 30 2Z',
  'M28 2C45 1 59 14 57 31C55 47 42 58 26 56C10 54 1 42 3 26C5 12 14 3 28 2Z',
  'M31 3C47 3 58 15 56 31C54 47 41 57 26 55C11 53 2 41 4 26C6 12 17 3 31 3Z',
]
export const BLOB_FILL = { coral: '#F28B82', yellow: '#FFD84D', mist: '#B5DCE3', sage: '#9DB59A', white: '#FFFFFF' } as const
export type BlobColor = keyof typeof BLOB_FILL

/** An icon sitting on a soft blob, used for list rows and step headers. */
export function BlobIcon({ color, shape = 0, size = 48, children }: { color: BlobColor; shape?: number; size?: number; children: ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center text-ink" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 60 60" width={size} height={size} className="absolute inset-0"><path d={SHAPES[shape % SHAPES.length]} fill={BLOB_FILL[color]} /></svg>
      <span className="relative">{children}</span>
    </span>
  )
}

/** Big coral corner blob for the top of a screen. Mirrors itself in RTL via the `start` side. */
export function CornerBlob({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 190" aria-hidden="true" className={`pointer-events-none absolute top-0 start-0 w-[260px] h-[165px] rtl:-scale-x-100 ${className}`}>
      <path d="M0 0H300C282 52 232 74 170 72C108 70 78 112 40 140C24 152 10 158 0 160Z" fill={BLOB_FILL.coral} />
    </svg>
  )
}

/** Soft shape placed behind a heading. */
export function HeadingBlob({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 130" aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
      <path d="M60 5C110-5 150 30 140 75C130 120 80 130 45 115C10 100-5 60 10 30C20 12 40 8 60 5Z" fill={BLOB_FILL.mist} />
    </svg>
  )
}
