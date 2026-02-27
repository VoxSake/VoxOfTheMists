export const reportCss = `
:root {
  color-scheme: dark;
  --ctp-rosewater: #f5e0dc;
  --ctp-flamingo: #f2cdcd;
  --ctp-pink: #f5c2e7;
  --ctp-mauve: #cba6f7;
  --ctp-red: #f38ba8;
  --ctp-maroon: #eba0ac;
  --ctp-peach: #fab387;
  --ctp-yellow: #f9e2af;
  --ctp-green: #a6e3a1;
  --ctp-teal: #94e2d5;
  --ctp-sky: #89dceb;
  --ctp-sapphire: #74c7ec;
  --ctp-blue: #89b4fa;
  --ctp-lavender: #b4befe;
  --ctp-text: #cdd6f4;
  --ctp-subtext1: #bac2de;
  --ctp-subtext0: #a6adc8;
  --ctp-overlay2: #9399b2;
  --ctp-overlay1: #7f849c;
  --ctp-overlay0: #6c7086;
  --ctp-surface2: #585b70;
  --ctp-surface1: #45475a;
  --ctp-surface0: #313244;
  --ctp-base: #1e1e2e;
  --ctp-mantle: #181825;
  --ctp-crust: #11111b;
  --background: var(--ctp-base);
  --foreground: var(--ctp-text);
  --card: #24273a;
  --card-foreground: var(--ctp-text);
  --primary: var(--ctp-blue);
  --primary-foreground: var(--ctp-crust);
  --secondary: var(--ctp-surface0);
  --secondary-foreground: var(--ctp-subtext1);
  --muted: var(--ctp-surface0);
  --muted-foreground: var(--ctp-subtext0);
  --accent: #2f334d;
  --accent-foreground: var(--ctp-text);
  --border: var(--ctp-surface1);
  --input: var(--ctp-surface1);
  --ring: var(--ctp-lavender);
  --radius: 10px;
  --radius-sm: 8px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--foreground);
  font-family: "Inter", "SF Pro Text", ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  background:
    radial-gradient(circle at 8% -14%, rgba(137, 180, 250, 0.24) 0%, transparent 42%),
    radial-gradient(circle at 85% -8%, rgba(203, 166, 247, 0.18) 0%, transparent 35%),
    linear-gradient(180deg, var(--ctp-mantle) 0%, var(--ctp-base) 35%, var(--ctp-crust) 100%);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.shell { max-width: 1280px; margin: 0 auto; padding: 22px; }
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 16px;
  margin-bottom: 18px;
}
.brand-wrap {
  min-width: 0;
  flex: 1;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--card) 90%, transparent);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
}
.brand-logo { display: block; width: min(252px, 60vw); height: auto; margin-bottom: 8px; }
.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 600;
  color: var(--ctp-lavender);
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--ctp-lavender) 50%, var(--border));
  color: var(--ctp-lavender);
  background: rgba(180, 190, 254, 0.09);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
h1 {
  margin: 6px 0 0;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--foreground);
}
h2 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--foreground);
}
p { margin: 6px 0; }
ul { margin: 0; padding-left: 20px; }
li { margin: 6px 0; }
.muted { color: var(--muted-foreground); }
.meta {
  min-width: 240px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--card) 86%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  font-size: 12px;
}
.card {
  padding: 20px;
  background: color-mix(in srgb, var(--card) 94%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
  transition: border-color 0.15s ease;
  margin: 14px 0;
}
.card:hover { border-color: color-mix(in srgb, var(--ctp-blue) 42%, var(--border)); }
.section-note { margin: -2px 0 12px; color: var(--ctp-subtext0); font-size: 13px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stat-card {
  padding: 14px;
  background: color-mix(in srgb, var(--ctp-surface0) 56%, var(--card));
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.stat-label {
  margin: 0;
  color: var(--ctp-subtext0);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.stat-value { margin: 8px 0 0; font-size: 18px; font-weight: 700; line-height: 1.25; color: var(--foreground); }
.chart-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.chart-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  background: color-mix(in srgb, var(--ctp-mantle) 76%, var(--card));
}
.chart-title { margin: 0 0 8px; font-size: 14px; font-weight: 600; color: var(--foreground); }
.chart-card svg { width: 100%; height: auto; display: block; }
.legend { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px 12px; }
.legend-item { font-size: 12px; color: var(--muted-foreground); display: inline-flex; align-items: center; gap: 6px; }
.legend-item i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.table-wrap {
  max-height: 640px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in srgb, var(--ctp-mantle) 76%, var(--card));
  color: var(--ctp-subtext1);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
tbody tr:hover td { background: color-mix(in srgb, var(--accent) 78%, transparent); }
.pager { display: flex; align-items: center; gap: 8px; margin: 10px 0 2px; }
.pager button {
  background: color-mix(in srgb, var(--ctp-surface0) 45%, transparent);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  cursor: pointer;
}
.pager button:hover { background: color-mix(in srgb, var(--ctp-blue) 24%, var(--ctp-surface0)); }
.pager button:disabled { opacity: .45; cursor: default; }
@media (max-width: 980px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .shell { padding: 12px; }
  .topbar { flex-direction: column; gap: 10px; }
  .meta { min-width: 0; }
  .brand-logo { width: min(230px, 78vw); }
  .stats-grid { grid-template-columns: 1fr; }
  h1 { font-size: 22px; }
}
`;
