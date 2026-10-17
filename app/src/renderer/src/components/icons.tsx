// Small stroke icons (24x24 grid, currentColor), so the UI needs no icon font.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const Logo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.8-4.8" />
    <path d="M8.5 9a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2" />
    <path d="M10.5 14h.01" />
  </Icon>
)
export const ScanIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </Icon>
)
export const CropIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </Icon>
)
export const CardsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="14" height="14" rx="2" />
    <path d="M7 3h12a2 2 0 0 1 2 2v12" />
  </Icon>
)
export const ShrinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)
export const ExpandIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </Icon>
)
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)
export const PowerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2v10" />
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
  </Icon>
)
export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
  </Icon>
)
export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)
export const BulbIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2Z" />
  </Icon>
)
export const NextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18l6-6-6-6" />
  </Icon>
)
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
)
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 22V4M4 4h12l-2 4 2 4H4" />
  </Icon>
)
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const RetryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
)
export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
)
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </Icon>
)
export const DropIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.7s6 6.4 6 11.3a6 6 0 0 1-12 0c0-4.9 6-11.3 6-11.3Z" />
  </Icon>
)

export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </Icon>
)

export const SpeakerOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="m16 9 5 6" />
    <path d="m21 9-5 6" />
  </Icon>
)

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5v14" />
    <path d="M15 5v14" />
  </Icon>
)

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m7 4 13 8-13 8z" />
  </Icon>
)

export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Icon>
)
