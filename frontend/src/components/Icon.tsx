import {
  BarChart3,
  Bell,
  Bolt,
  Calendar,
  Check,
  AtSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Database,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';

const ICONS = {
  connector: Plug,
  data: Database,
  summary: BarChart3,
  settings: Settings,
  bell: Bell,
  admin: Shield,
  logout: LogOut,
  user: UserRound,
  lock: Lock,
  eye: Eye,
  eyeOff: EyeOff,
  mail: Mail,
  atSign: AtSign,
  moon: Moon,
  sun: Sun,
  bolt: Bolt,
  search: Search,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronsUpDown: ChevronsUpDown,
  mapPin: MapPin,
  x: X,
  plus: Plus,
  sync: RefreshCw,
  edit: Pencil,
  trash: Trash2,
  check: Check,
  alert: TriangleAlert,
  calendar: Calendar,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
};

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 2,
}: IconProps) {
  const Component = ICONS[name];
  return (
    <Component size={size} className={className} strokeWidth={strokeWidth} />
  );
}
