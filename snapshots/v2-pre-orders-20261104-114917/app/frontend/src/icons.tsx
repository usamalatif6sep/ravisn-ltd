import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Search = (p: P) => <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></Svg>;
export const Lock = (p: P) => <Svg {...p}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Svg>;
export const Unlock = (p: P) => <Svg {...p}><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" /></Svg>;
export const Close = (p: P) => <Svg {...p}><path d="m4.5 4.5 7 7m0-7-7 7" /></Svg>;
export const Check = (p: P) => <Svg {...p}><path d="m3.5 8.5 3 3 6-7" /></Svg>;
export const Plus = (p: P) => <Svg {...p}><path d="M8 3.5v9M3.5 8h9" /></Svg>;
export const Chevron = (p: P) => <Svg {...p}><path d="m6 4 4 4-4 4" /></Svg>;
export const ChevronDown = (p: P) => <Svg {...p}><path d="m4 6 4 4 4-4" /></Svg>;
export const External = (p: P) => <Svg {...p}><path d="M9.5 3.5h3v3M12.5 3.5 7.5 8.5M11 9.5v2.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" /></Svg>;
export const Folder = (p: P) => <Svg {...p}><path d="M2.5 5a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /></Svg>;
export const Catalogue = (p: P) => <Svg {...p}><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M6 6.5V13" /></Svg>;
export const People = (p: P) => <Svg {...p}><circle cx="6" cy="6" r="2.2" /><path d="M2.5 13c.4-2 1.8-3.2 3.5-3.2S9.1 11 9.5 13" /><path d="M10.5 4.2a2 2 0 0 1 0 3.8M11.8 9.9c1 .4 1.6 1.4 1.8 3.1" /></Svg>;
export const Inbox = (p: P) => <Svg {...p}><path d="M2.5 9.5 4 4h8l1.5 5.5V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" /><path d="M2.5 9.5h3l.8 1.5h3.4l.8-1.5h3" /></Svg>;
export const Upload = (p: P) => <Svg {...p}><path d="M8 10V3m-3 3 3-3 3 3M3 10.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5" /></Svg>;
export const Gear = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="2" /><path d="M8 2.5v1.6M8 11.9v1.6M13.5 8h-1.6M4.1 8H2.5M11.9 4.1l-1.1 1.1M5.2 10.8l-1.1 1.1M11.9 11.9l-1.1-1.1M5.2 5.2 4.1 4.1" /></Svg>;
export const Alert = (p: P) => <Svg {...p}><path d="M8 2.8 14 13H2z" /><path d="M8 6.8v2.8M8 11.3v.1" /></Svg>;
export const Info = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M8 7.3v3.5M8 5.2v.1" /></Svg>;
export const Undo = (p: P) => <Svg {...p}><path d="M5.5 4 3 6.5 5.5 9" /><path d="M3 6.5h6.5a3.5 3.5 0 0 1 0 7H7" /></Svg>;
export const Chat = (p: P) => <Svg {...p}><path d="M3 12.5 3.8 10A5 5 0 1 1 6 12.2z" /></Svg>;
export const Archive = (p: P) => <Svg {...p}><rect x="2.5" y="3.5" width="11" height="3" rx="0.8" /><path d="M3.5 6.5V12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6.5M6.5 9h3" /></Svg>;
export const Download = (p: P) => <Svg {...p}><path d="M8 3v7m-3-3 3 3 3-3M3 10.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5" /></Svg>;
export const Power = (p: P) => <Svg {...p}><path d="M8 2.5v5" /><path d="M5 4.5a4.5 4.5 0 1 0 6 0" /></Svg>;
export const Shield = (p: P) => <Svg {...p}><path d="M8 2.5 13 4.5v3.3c0 2.8-2 4.9-5 5.7-3-.8-5-2.9-5-5.7V4.5z" /></Svg>;
export const Globe = (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.6 1.6 2.3 3.4 2.3 5.5S9.6 11.9 8 13.5M8 2.5C6.4 4.1 5.7 5.9 5.7 8s.7 3.9 2.3 5.5" /></Svg>;
export const Photo = (p: P) => <Svg {...p}><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" /><circle cx="6" cy="6.8" r="1.1" /><path d="m3 11.5 3-3 2.2 2.2L10.5 8l2.5 2.5" /></Svg>;
