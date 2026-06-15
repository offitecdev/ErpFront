import type { HTMLAttributes } from 'react';

export type IconProps = HTMLAttributes<HTMLOrSVGElement> & {
    size?: number | string;
    strokeWidth?: number | string;
    color?: string;
};

const makeIcon = (iconName: string) => {
    const WrappedIcon = ({ size, strokeWidth: _strokeWidth, color, style, className, ...props }: IconProps) => (
        <i 
            className={`f7-icons ${className || ''}`} 
            style={{ fontSize: size || 16, color, ...style }} 
            {...props}
        >
            {iconName}
        </i>
    );

    WrappedIcon.displayName = `F7Icon(${iconName})`;
    return WrappedIcon;
};

export const Activity = makeIcon('bolt');
export const AlertCircle = makeIcon('exclamationmark_circle');
export const AlertTriangle = makeIcon('exclamationmark_triangle');
export const ArrowDown = makeIcon('arrow_down');
export const ArrowLeft = makeIcon('arrow_left');
export const ArrowRight = makeIcon('arrow_right');
export const ArrowUp = makeIcon('arrow_up');
export const BarChart03 = makeIcon('chart_bar');
export const Bell01 = makeIcon('bell');
export const BookOpen01 = makeIcon('book');
export const Box = makeIcon('cube');
export const Briefcase01 = makeIcon('briefcase');
export const Building02 = makeIcon('building_2_fill');
export const Building05 = makeIcon('person_2');
export const Calculator = makeIcon('keyboard');
export const Calendar = makeIcon('calendar');
export const CalendarCheck01 = makeIcon('calendar_badge_plus');
export const CalendarDate = makeIcon('calendar');
export const CalendarPlus01 = makeIcon('calendar_badge_plus');
export const Camera01 = makeIcon('camera');
export const Check = makeIcon('checkmark');
export const CheckCircle = makeIcon('checkmark_circle');
export const ChevronDown = makeIcon('chevron_down');
export const ChevronLeft = makeIcon('chevron_left');
export const ChevronLeftDouble = makeIcon('chevron_left_2');
export const ChevronRight = makeIcon('chevron_right');
export const ChevronRightDouble = makeIcon('chevron_right_2');
export const ChevronSelectorVertical = makeIcon('chevron_up_chevron_down');
export const ChevronUp = makeIcon('chevron_up');
export const Clipboard = makeIcon('doc_text');
export const Clock = makeIcon('clock');
export const ClockRewind = makeIcon('arrow_counterclockwise');
export const ClockSnooze = makeIcon('clock');
export const Coins01 = makeIcon('money_dollar_circle');
export const Container = makeIcon('archivebox');
export const Copy01 = makeIcon('doc_on_doc');
export const CurrencyDollar = makeIcon('money_dollar');
export const CurrencyDollarCircle = makeIcon('money_dollar_circle');
export const DotsVertical = makeIcon('ellipsis_vertical');
export const DownloadCloud02 = makeIcon('cloud_download');
export const Edit01 = makeIcon('pencil');
export const Eye = makeIcon('eye');
export const EyeOff = makeIcon('eye_slash');
export const File02 = makeIcon('doc_text');
export const File05 = makeIcon('doc');
export const FileCheck02 = makeIcon('doc_checkmark');
export const FileDownload02 = makeIcon('arrow_down_doc');
export const FilterLines = makeIcon('line_horizontal_3_decrease');
export const GitBranch01 = makeIcon('tuningfork');
export const Hash01 = makeIcon('number');
export const HelpCircle = makeIcon('questionmark_circle');
export const Image01 = makeIcon('photo');
export const InfoCircle = makeIcon('info_circle');
export const LayersThree01 = makeIcon('layers_alt');
export const LayersTwo01 = makeIcon('layers');
export const LifeBuoy01 = makeIcon('lifepreserver');
export const List = makeIcon('list_bullet');
export const LogOut01 = makeIcon('square_arrow_right');
export const Mail01 = makeIcon('envelope');
export const MarkerPin01 = makeIcon('placemark');
export const Menu02 = makeIcon('bars');
export const Minus = makeIcon('minus');
export const Moon01 = makeIcon('moon');
export const Package = makeIcon('archivebox');
export const PackagePlus = makeIcon('plus_rectangle');
export const PackageX = makeIcon('xmark_rectangle');
export const Percent01 = makeIcon('percent');
export const Phone = makeIcon('phone');
export const PieChart03 = makeIcon('chart_pie');
export const Plus = makeIcon('plus');
export const QrCode01 = makeIcon('qrcode');
export const Receipt = makeIcon('doc_text');
export const RefreshCcw01 = makeIcon('arrow_2_circlepath');
export const Save01 = makeIcon('square_and_arrow_down');
export const Scan = makeIcon('viewfinder');
export const SearchLg = makeIcon('search');
export const Send01 = makeIcon('paperplane');
export const Settings01 = makeIcon('gear');
export const Share04 = makeIcon('square_arrow_up');
export const ShoppingCart01 = makeIcon('cart');
export const ShoppingOutlined = makeIcon('bag');
export const Sliders02 = makeIcon('slider_horizontal_3');
export const SwitchHorizontal01 = makeIcon('arrow_right_arrow_left');
export const Tag01 = makeIcon('tag');
export const Trash01 = makeIcon('trash');
export const TrendDown01 = makeIcon('arrow_down_right');
export const TrendUp01 = makeIcon('arrow_up_right');
export const Truck01 = ({ size, color, className, style, ...props }: IconProps) => (
    <svg 
        width={size || 16} 
        height={size || 16} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={color || "currentColor"} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={className}
        style={{ ...style, display: 'inline-block', verticalAlign: 'middle' }}
        {...props as any}
    >
        <rect x="1" y="3" width="15" height="13" rx="1" ry="1" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
);
export const UploadCloud02 = makeIcon('cloud_upload');
export const User01 = makeIcon('person');
export const UserX01 = makeIcon('person_badge_minus');
export const X = makeIcon('xmark');
export const XCircle = makeIcon('xmark_circle');
export const XClose = makeIcon('xmark');

export const ArrowRightIcon = ArrowRight;
export const LineChart = makeIcon('chart_bar');
export const ShoppingBag = makeIcon('bag');
export const Alert = makeIcon('exclamationmark');
