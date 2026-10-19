// Line icons drawn for this store (1.5px strokes on a 24px grid). Decorative by default;
// pass aria-label (and role="img") when an icon carries meaning on its own.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>;
export const BagIcon = (p: IconProps) => <Svg {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></Svg>;
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></Svg>
);
export const UserIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></Svg>;
export const MenuIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const CloseIcon = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="m15 6-6 6 6 6" /></Svg>;
export const PlusIcon = (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const MinusIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const ArrowRight = (p: IconProps) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const TruckIcon = (p: IconProps) => <Svg {...p}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></Svg>;
export const ReturnIcon = (p: IconProps) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Svg>;
export const ShareIcon = (p: IconProps) => <Svg {...p}><path d="M12 4v11M8 8l4-4 4 4" /><path d="M5 13v6h14v-6" /></Svg>;
export const ZoomIcon = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" /></Svg>;
export const RulerIcon = (p: IconProps) => <Svg {...p}><path d="M3 16 16 3l5 5L8 21z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" /></Svg>;
export const ShieldIcon = (p: IconProps) => <Svg {...p}><path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></Svg>;
export const FilterIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>;
export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></Svg>
);
export const MapPinIcon = (p: IconProps) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10" r="2.3" /></Svg>;
export const LockIcon = (p: IconProps) => <Svg {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></Svg>;
export const AlertIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V13M12 16.2v.3" /></Svg>;
export const InfoIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.3" /></Svg>;
export const LogoutIcon = (p: IconProps) => <Svg {...p}><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></Svg>;
export const UploadIcon = (p: IconProps) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></Svg>;
export const DownloadIcon = (p: IconProps) => <Svg {...p}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></Svg>;
export const TrashIcon = (p: IconProps) => <Svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>;
export const CopyIcon = (p: IconProps) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></Svg>;
export const EyeIcon = (p: IconProps) => <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const GripIcon = (p: IconProps) => <Svg {...p}><circle cx="9" cy="6" r=".8" /><circle cx="15" cy="6" r=".8" /><circle cx="9" cy="12" r=".8" /><circle cx="15" cy="12" r=".8" /><circle cx="9" cy="18" r=".8" /><circle cx="15" cy="18" r=".8" /></Svg>;
export const ExternalIcon = (p: IconProps) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></Svg>;
export const PrintIcon = (p: IconProps) => <Svg {...p}><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1" /><path d="M7 14h10v6H7z" /></Svg>;
export const HomeIcon = (p: IconProps) => <Svg {...p}><path d="m4 11 8-7 8 7v9h-5v-6H9v6H4z" /></Svg>;
export const BoxIcon = (p: IconProps) => <Svg {...p}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></Svg>;
export const TagIcon = (p: IconProps) => <Svg {...p}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8" r="1.3" /></Svg>;
export const LayersIcon = (p: IconProps) => <Svg {...p}><path d="m12 4 9 5-9 5-9-5z" /><path d="m3 14 9 5 9-5" /></Svg>;
export const ClipboardIcon = (p: IconProps) => <Svg {...p}><rect x="5" y="5" width="14" height="16" rx="1.5" /><path d="M9 5V3.5h6V5M8.5 10h7M8.5 14h7M8.5 18h4" /></Svg>;
export const CardIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="M3 10h18M7 15h4" /></Svg>;
export const PercentIcon = (p: IconProps) => <Svg {...p}><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.2" /><circle cx="17" cy="17" r="2.2" /></Svg>;
export const UsersIcon = (p: IconProps) => <Svg {...p}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.5c1.6.6 2.7 2.2 3 4.5" /></Svg>;
export const SettingsIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" /></Svg>;
export const ChartIcon = (p: IconProps) => <Svg {...p}><path d="M4 20V4M4 20h16" /><path d="m8 15 3.5-4 3 2.5L20 7" /></Svg>;
export const ImageIcon = (p: IconProps) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="10" r="1.8" /><path d="m4 18 5-5 4 4 2.5-2.5L20 19" /></Svg>;
export const MailIcon = (p: IconProps) => <Svg {...p}><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="m4 7 8 6 8-6" /></Svg>;
export const StarOutlineIcon = (p: IconProps) => <StarIcon {...p} />;
export const HistoryIcon = (p: IconProps) => <Svg {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4.5l3 2" /></Svg>;
export const ReceiptIcon = (p: IconProps) => <Svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Svg>;
