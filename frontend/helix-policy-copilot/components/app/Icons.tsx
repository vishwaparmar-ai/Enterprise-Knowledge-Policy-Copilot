import type { ReactNode } from "react";

export type AppIconName = "home" | "chat" | "doc" | "settings" | "logout" | "menu" | "close" | "send" | "upload" | "arrow" | "chart";

const paths: Record<AppIconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /></>,
  chat: <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  logout: <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  send: <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />,
  upload: <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chart: <path d="M4 20h16M7 17v-5M12 17V6M17 17v-9" />,
};

export function AppIcon({ name, className = "h-[18px] w-[18px]" }: { name: AppIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}