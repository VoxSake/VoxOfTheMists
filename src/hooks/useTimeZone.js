import { usePersistedState } from "./usePersistedState";

export function useTimeZone() {
    const allZones =
        typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
    const defaultZone = allZones.includes("Europe/Brussels") ? "Europe/Brussels" : allZones[0];
    const [timeZone, setTimeZone] = usePersistedState("vox-timezone", defaultZone, {
        parse: (raw) => {
            const zone = String(raw || "").trim();
            return zone && allZones.includes(zone) ? zone : defaultZone;
        },
        serialize: (value) => String(value || defaultZone),
    });

    return { allZones, timeZone, setTimeZone };
}
