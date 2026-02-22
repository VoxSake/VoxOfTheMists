import logoDark from "../assets/vox-logo-dark.svg";
import logoLight from "../assets/vox-logo-light.svg";
import { TopbarActions } from "./TopbarActions";

export function DashboardShell({
  selectedWeekEnd,
  setSelectedWeekEnd,
  weekOptions,
  canRunManualAppwriteSync,
  appwriteSyncBusy,
  onRunManualAppwriteSync,
  onShareReport,
  onOpenSettings,
  themeDark,
  children,
}) {
  const year = new Date().getFullYear();
  const logoSrc = themeDark ? logoDark : logoLight;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="title-wrap">
          <img className="brand-logo" src={logoSrc} alt="Vox of the Mists logo" />
          <p className="eyebrow">Guild Wars 2 - WvW Analytics</p>
          <h1>Vox of the Mists</h1>
        </div>
        <TopbarActions
          selectedWeekEnd={selectedWeekEnd}
          setSelectedWeekEnd={setSelectedWeekEnd}
          weekOptions={weekOptions}
          canRunManualAppwriteSync={canRunManualAppwriteSync}
          appwriteSyncBusy={appwriteSyncBusy}
          onRunManualAppwriteSync={onRunManualAppwriteSync}
          onShareReport={onShareReport}
          onOpenSettings={onOpenSettings}
        />
      </header>

      {children}

      <footer className="footer">© {year} Vox of the Mists — Open-source WvW analytics, built with care.</footer>
    </div>
  );
}
