const paths = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5",
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 2.7-5 6-5s6 2 6 5M12 20c0-2.6 2-4.5 5-4.5s5 1.9 5 4.5",
  server: "M4 4h16v6H4V4Zm0 10h16v6H4v-6Zm3 3h.01M7 7h.01",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4.5 12a7.5 7.5 0 0 1 .15-1.5L3 9l1.5-2.6 2.3.6a7.6 7.6 0 0 1 2.6-1.5L10 3h4l.6 2.5a7.6 7.6 0 0 1 2.6 1.5l2.3-.6L21 9l-1.65 1.5a7.5 7.5 0 0 1 0 3L21 15l-1.5 2.6-2.3-.6a7.6 7.6 0 0 1-2.6 1.5L14 21h-4l-.6-2.5a7.6 7.6 0 0 1-2.6-1.5l-2.3.6L3 15l1.65-1.5a7.5 7.5 0 0 1-.15-1.5Z",
  truck: "M2 7h11v9H2V7Zm11 3h4l3 3v3h-7v-6ZM6 19a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 6 19Zm11 0a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 17 19Z",
  dollar: "M12 3v18M16.5 7.5c0-1.7-1.8-3-4.5-3s-4.5 1.4-4.5 3.2c0 4 9 2 9 6.1 0 1.9-2 3.2-4.5 3.2S7.5 15.9 7.5 14",
  rocket: "M12 2c3 2 5 5.5 5 9.5 0 2-1 4-2 5l-1.5-1.5M12 2c-3 2-5 5.5-5 9.5 0 2 1 4 2 5l1.5-1.5M9 16.5 7 21l3-1.2M15 16.5l2 4.5-3-1.2M9.5 12.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z",
  headset: "M4 13a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-1v-6h3M4 17v-4a8 8 0 0 1 .6-3M4 17a2 2 0 0 0 2 2h1v-6H4v4Z",
  trendUp: "m3 17 6-6 4 4 8-8M15 6h6v6",
  trendDown: "m3 7 6 6 4-4 8 8M15 17h6v-6",
  percent: "M6 6h.01M18 18h.01M18 6 6 18M6 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  wallet: "M3 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm14 6.5h.01",
  bell: "M6 8a6 6 0 1 1 12 0c0 3 1 5 2 6H4c1-1 2-3 2-6Zm4 9a2 2 0 0 0 4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6",
  box: "M3 8 12 4l9 4-9 4-9-4Zm0 0v9l9 4V12M21 8v9l-9 4",
  bolt: "M13 3 4 14h6l-1 7 9-11h-6l1-7Z",
  filter: "M4 5h16M7 12h10M10 19h4",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  chevronDown: "m6 9 6 6 6-6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm10 17-5.4-5.4",
  close: "M6 6l12 12M18 6 6 18",
  copy: "M8 8h10v10H8V8ZM6 14H4V4h10v2",
  refresh: "M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.3 2.7M18.5 9a7 7 0 0 0-12.3-2.7",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  check: "M5 12l5 5L20 7",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-14v14",
  pin: "M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Zm0-9a2.3 2.3 0 1 0 0-4.6A2.3 2.3 0 0 0 12 12Z",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  clipboard: "M9 3h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a1 1 0 0 1 1-1Zm0 4v0M9 12h6M9 16h6",
};

export function Icon({ name, size = 18, strokeWidth = 1.8, className }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
