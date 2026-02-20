export const reportCss = `
:root {
  color-scheme: dark;
  --background: #0d0f14;
  --foreground: #f5f7fb;
  --card: #13161d;
  --card-foreground: #f5f7fb;
  --primary: #f5f7fb;
  --primary-foreground: #0f1117;
  --secondary: #1f2430;
  --secondary-foreground: #f5f7fb;
  --muted: #1f2430;
  --muted-foreground: #a7b0bf;
  --accent: #212736;
  --accent-foreground: #f5f7fb;
  --border: #2e3646;
  --input: #2e3646;
  --ring: #cfd6e3;
  --radius: 8px;
  --radius-sm: 6px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  color: var(--foreground);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  background: radial-gradient(circle at 22% -18%, #283042 0%, var(--background) 46%);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.shell { max-width: 1280px; margin: 0 auto; padding: 22px; }
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 18px;
}
.eyebrow {
  margin: 0;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted-foreground);
}
h1 {
  margin: 4px 0 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--foreground);
}
h2 { margin: 0 0 12px; font-size: 18px; font-weight: 600; letter-spacing: -0.015em; color: var(--foreground); }
p { margin: 6px 0; }
ul { margin: 0; padding-left: 20px; }
li { margin: 6px 0; }
.muted { color: var(--muted-foreground); }
.meta { margin-bottom: 16px; }
.card {
  padding: 20px;
  background: color-mix(in srgb, var(--card) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.18);
  transition: border-color 0.15s ease;
  margin: 14px 0;
}
.card:hover { border-color: color-mix(in srgb, var(--ring) 34%, var(--border)); }
.section-note { margin: -2px 0 12px; color: #91a3be; font-size: 13px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.stat-card {
  padding: 14px;
  background: color-mix(in srgb, var(--card) 86%, #1d2432);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.stat-label { margin: 0; color: var(--muted-foreground); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value { margin: 8px 0 0; font-size: 18px; font-weight: 700; line-height: 1.25; color: var(--foreground); }
.chart-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.chart-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; background: color-mix(in srgb, var(--card) 84%, #151c2a); }
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
  background: color-mix(in srgb, var(--card) 96%, #171b25);
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
tbody tr:hover td { background: color-mix(in srgb, var(--accent) 78%, transparent); }
.pager { display: flex; align-items: center; gap: 8px; margin: 10px 0 2px; }
.pager button { background: transparent; color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; cursor: pointer; }
.pager button:hover { background: var(--accent); }
.pager button:disabled { opacity: .45; cursor: default; }
@media (max-width: 980px) {
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .shell { padding: 12px; }
  .topbar { flex-direction: column; gap: 10px; }
  .stats-grid { grid-template-columns: 1fr; }
  h1 { font-size: 22px; }
}
`;
