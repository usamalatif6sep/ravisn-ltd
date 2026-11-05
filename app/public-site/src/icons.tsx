/** A small, consistent line-icon set (1.6px strokes on a 24px grid). Decorative unless a label is given. */
const PATHS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.2 4.2L19 7",
  shield: "M12 3.5l7 2.6v5.6c0 4.3-2.9 7.6-7 8.8-4.1-1.2-7-4.5-7-8.8V6.1l7-2.6Zm-3.2 8.6 2.3 2.3 4.2-4.4",
  globe: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm0 0c2.3-2.2 3.5-5 3.5-8.5S14.3 5.7 12 3.5M12 20.5C9.7 18.3 8.5 15.5 8.5 12S9.7 5.7 12 3.5M4 9.5h16M4 14.5h16",
  tag: "M3.8 12.6V5.3c0-.8.7-1.5 1.5-1.5h7.3l7.6 7.6a1.5 1.5 0 0 1 0 2.1l-7.3 7.3a1.5 1.5 0 0 1-2.1 0l-7-7.2Zm4.7-4.1h.01",
  truck: "M3.5 6.5h10v9h-10zM13.5 9.5h3.8l3.2 3.4v2.6h-7M7 18.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm10 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z",
  label: "M6 3.5h8.5L19 8v12.5H6V3.5Zm8 0V8.5h5M9 12.5h7M9 16h5",
  search: "M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6ZM20 20l-4.4-4.4",
  chat: "M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2L7 19.5V16a2.5 2.5 0 0 1-2.5-2.5v-7Z",
  whatsapp: "M4 20l1.3-4.1A8 8 0 1 1 8.4 19L4 20Zm5-11.5c-.3 2.6 2.6 6.2 5.6 6.4.7 0 1.5-.6 1.6-1.3l-1.8-.9-.9.8c-1-.4-2.1-1.5-2.5-2.5l.8-.9-.8-1.8c-.8 0-1.9.7-2 1.2Z",
  mail: "M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6",
  box: "M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8",
  bag: "M5.5 8h13l-1 11.2a1.8 1.8 0 0 1-1.8 1.6H8.3a1.8 1.8 0 0 1-1.8-1.6L5.5 8ZM9 8V6.5a3 3 0 0 1 6 0V8",
  pin: "M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  spark: "M12 3.5l1.7 5.1 5.3 1.7-5.3 1.7L12 17.1l-1.7-5.1L5 10.3l5.3-1.7L12 3.5ZM18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z",
  hash: "M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15",
  lock: "M6.5 10.5h11v9h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2",
  card: "M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h3",
  layers: "M12 4l8.5 4.5L12 13 3.5 8.5 12 4Zm-8.5 8L12 16.5l8.5-4.5M3.5 15.5 12 20l8.5-4.5",
  help: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM9.6 9.3a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.2-2.5 3.6M12 16.6h.01",
  return: "M8 7.5H15a4.5 4.5 0 0 1 0 9H8.5M8 7.5l3-3M8 7.5l3 3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.6, label }: { name: IconName; size?: number; stroke?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={PATHS[name]} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
