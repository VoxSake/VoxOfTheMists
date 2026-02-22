import { ToastContainer } from "./Toast";
import { SettingsPanel } from "./SettingsPanel";
import { DashboardMain } from "./DashboardMain";
import { DashboardShell } from "./DashboardShell";

/** @typedef {import("../types/dashboard").DashboardMainProps} DashboardMainProps */

/**
 * @param {{
 *  shellProps: any;
 *  settingsPanelProps: any;
 *  dashboardMainProps: DashboardMainProps;
 * }} props
 */
export function AppView({
  shellProps,
  settingsPanelProps,
  dashboardMainProps,
}) {
  return (
    <>
      <DashboardShell {...shellProps}>
        <DashboardMain {...dashboardMainProps} />
      </DashboardShell>
      <SettingsPanel {...settingsPanelProps} />
      <ToastContainer />
    </>
  );
}
