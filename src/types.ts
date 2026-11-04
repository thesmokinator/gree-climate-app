/** Mirrors gree_climate::DeviceInfo (serde Serialize). */
export interface DeviceInfo {
  ip: string;
  port: number;
  mac: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
}

/** Mirrors the backend SavedDevice struct. */
export interface SavedDevice {
  info: DeviceInfo;
  alias?: string | null;
}

/** Mirrors gree_climate::State (serde Serialize). */
export interface DeviceState {
  power: boolean;
  mode: number;
  target_temperature: number;
  current_temperature: number | null;
  temperature_unit: number;
  fan_speed: number;
  swing_vertical: number;
  swing_horizontal: number;
  turbo: boolean;
  quiet: boolean;
  sleep: boolean;
  steady_heat: boolean;
  power_save: boolean;
  fresh_air: boolean;
  xfan: boolean;
  anion: boolean;
  light: boolean;
}

export function displayName(saved: SavedDevice): string {
  return saved.alias?.trim() ? saved.alias.trim() : saved.info.name;
}

export function deviceDetail(info: DeviceInfo): string {
  const extra = [info.brand, info.model].filter(Boolean).join(" ");
  return extra
    ? `${info.ip}:${info.port} — ${extra}`
    : `${info.ip}:${info.port}`;
}
