//! Tray-first Tauri backend for Gree Climate.
//!
//! The app lives in the menu bar (no Dock icon) and shows the main window
//! only for the first-run wizard and device management. Device discovery
//! reuses the `gree-climate` crate directly; chosen devices are persisted
//! under the app data dir together with their user-given alias.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use gree_climate::discovery::discover_with_timeout;
use gree_climate::{
    Client, DeviceInfo, FanSpeed, Mode, State as DeviceState, SwingHorizontal, SwingVertical,
};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, AppHandle, LogicalSize, Manager, State, WindowEvent,
};

/// A device saved by the user, with an optional user-given display name.
///
/// `info` holds the network identity reported by the device itself;
/// `alias` is the friendly name chosen in the app and shown in the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedDevice {
    info: DeviceInfo,
    #[serde(default)]
    alias: Option<String>,
}

/// A single control change requested from the UI.
///
/// Serialized from the frontend as `{ "action": "power", "value": true }`;
/// enum values (mode, fan speed, swings) travel as their protocol numbers.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action", content = "value", rename_all = "camelCase")]
enum ControlAction {
    Power(bool),
    Mode(Mode),
    Temperature(u8),
    FanSpeed(FanSpeed),
    SwingVertical(SwingVertical),
    SwingHorizontal(SwingHorizontal),
    Turbo(bool),
    Quiet(bool),
    Sleep(bool),
    SteadyHeat(bool),
    PowerSave(bool),
    FreshAir(bool),
    Xfan(bool),
    Anion(bool),
    Light(bool),
}

/// Shared backend state: the saved devices plus one live client per device.
///
/// Clients stay connected in memory so every button press does not pay for
/// a new bind handshake; a failed command drops its client so the next
/// attempt reconnects from scratch.
struct AppState {
    devices: Mutex<Vec<SavedDevice>>,
    clients: tauri::async_runtime::Mutex<HashMap<String, Client>>,
}

const DEVICES_FILE: &str = "devices.json";
const MANUAL_ADD_TIMEOUT: Duration = Duration::from_secs(8);

/// Fixed logical width of the main window, in CSS pixels.
const WINDOW_WIDTH: f64 = 470.0;
/// Smallest content height accepted from the webview.
const MIN_CONTENT_HEIGHT: f64 = 240.0;
/// Largest content height accepted from the webview.
const MAX_CONTENT_HEIGHT: f64 = 1400.0;

/// Logical content size for a height measured in the webview.
///
/// Width stays fixed. A non-finite or out-of-range height is clamped so a
/// bad measurement cannot collapse the window or grow it without limit.
fn content_window_size(height: f64) -> LogicalSize<f64> {
    let height = if height.is_finite() {
        height.clamp(MIN_CONTENT_HEIGHT, MAX_CONTENT_HEIGHT)
    } else {
        MIN_CONTENT_HEIGHT
    };
    LogicalSize::new(WINDOW_WIDTH, height)
}

/// Tolerance, in CSS pixels, between a requested window height and the height
/// the window actually adopts. Smaller differences are not worth another
/// resize round-trip.
const FIT_TOLERANCE: f64 = 2.0;

/// How many times a single fit request retries with compensation before
/// giving up with the best-effort size.
const FIT_ATTEMPTS: usize = 3;

/// Next height to request when the window settled at `actual` instead of the
/// requested height.
///
/// Returns `None` when `actual` already covers `requested`: a small overshoot
/// is fine and avoids resize ping-pong. Otherwise returns the grown request
/// that compensates the observed shortfall. The shortfall is stable per
/// machine (window-chrome accounting on macOS delivers a constant offset),
/// so one compensation round usually lands exactly.
fn next_height_to_request(requested: f64, actual: f64) -> Option<f64> {
    let shortfall = requested - actual;
    if shortfall <= FIT_TOLERANCE {
        None
    } else {
        Some(requested + shortfall)
    }
}

/// Resize the main window to `size` and lock it there.
///
/// Runs on the main thread: Cocoa ignores `setContentSize` and min/max
/// changes that arrive from a background thread. On macOS a non-resizable
/// window also clamps later resizes to its current min and max, so the
/// locks are opened, the frame is applied, then both axes are pinned.
fn apply_content_size(app: &AppHandle, size: LogicalSize<f64>) -> Result<(), String> {
    let app_for_main = app.clone();
    app.run_on_main_thread(move || {
        let Some(window) = app_for_main.get_webview_window("main") else {
            return;
        };
        let _ = window.set_resizable(true);
        let _ = window.set_min_size(Some(LogicalSize::new(WINDOW_WIDTH, MIN_CONTENT_HEIGHT)));
        let _ = window.set_max_size(Some(LogicalSize::new(WINDOW_WIDTH, MAX_CONTENT_HEIGHT)));
        let _ = window.set_size(size);
        let _ = window.set_min_size(Some(size));
        let _ = window.set_max_size(Some(size));
        let _ = window.set_resizable(false);
    })
    .map_err(|e| e.to_string())
}

/// Resolve the file used to persist the saved devices.
fn devices_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(DEVICES_FILE))
        .map_err(|e| e.to_string())
}

/// Load previously saved devices, if any.
///
/// Reads the current `Vec<SavedDevice>` format and falls back to the legacy
/// plain `Vec<DeviceInfo>` format written by earlier versions.
fn load_devices(app: &AppHandle) -> Result<Vec<SavedDevice>, String> {
    let path = devices_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if let Ok(devices) = serde_json::from_str::<Vec<SavedDevice>>(&raw) {
        return Ok(devices);
    }
    let legacy = serde_json::from_str::<Vec<DeviceInfo>>(&raw).map_err(|e| e.to_string())?;
    Ok(legacy
        .into_iter()
        .map(|info| SavedDevice { info, alias: None })
        .collect())
}

/// Persist the saved devices for the next launch.
fn save_devices(app: &AppHandle, devices: &[SavedDevice]) -> Result<(), String> {
    let path = devices_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(devices).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

/// Replace the whole saved list in memory and on disk.
fn replace_devices(
    app: &AppHandle,
    state: &State<'_, AppState>,
    devices: Vec<SavedDevice>,
) -> Result<Vec<SavedDevice>, String> {
    save_devices(app, &devices)?;
    *state.devices.lock().map_err(|e| e.to_string())? = devices.clone();
    Ok(devices)
}

/// Normalize a user-given alias: blank input means "no alias".
fn normalize_alias(alias: Option<String>) -> Option<String> {
    alias.and_then(|name| {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

/// Broadcast on the LAN and return every GREE device that answers.
///
/// An empty list is a normal outcome (nothing found), not an error.
#[tauri::command]
async fn discover_devices() -> Result<Vec<DeviceInfo>, String> {
    match gree_climate::discover().await {
        Ok(devices) => Ok(devices),
        Err(gree_climate::Error::NoDevicesFound) => Ok(Vec::new()),
        Err(other) => Err(other.to_string()),
    }
}

/// Return the devices saved by a previous run.
#[tauri::command]
async fn get_saved_devices(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<SavedDevice>, String> {
    let devices = load_devices(&app)?;
    *state.devices.lock().map_err(|e| e.to_string())? = devices.clone();
    Ok(devices)
}

/// Merge scanned devices into the saved list, matched by MAC address.
///
/// Devices already saved keep their place and are only refreshed; new ones
/// are appended. Devices the scan missed (e.g. powered off) are kept, so a
/// re-scan never wipes the existing setup.
fn merge_saved_devices(
    mut saved: Vec<SavedDevice>,
    incoming: Vec<SavedDevice>,
) -> Vec<SavedDevice> {
    for mut device in incoming {
        device.alias = normalize_alias(device.alias);
        if let Some(existing) = saved
            .iter_mut()
            .find(|saved| saved.info.mac == device.info.mac)
        {
            *existing = device;
        } else {
            saved.push(device);
        }
    }
    saved
}

/// Save the wizard selection and hide the window back to the tray.
///
/// Returns the full saved list after merging, so rescans from Settings add
/// new devices without dropping the ones already stored.
#[tauri::command]
async fn complete_onboarding(
    app: AppHandle,
    state: State<'_, AppState>,
    devices: Vec<SavedDevice>,
) -> Result<Vec<SavedDevice>, String> {
    let saved = load_devices(&app)?;
    let merged = replace_devices(&app, &state, merge_saved_devices(saved, devices))?;
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(merged)
}

/// Add a device by IP address, with an optional user-given name.
///
/// The IP alone is not enough to talk to a device (binding needs its MAC),
/// so the backend polls the network for the device's real identity first
/// and stores that together with the alias.
#[tauri::command]
async fn add_device_by_ip(
    app: AppHandle,
    state: State<'_, AppState>,
    ip: String,
    alias: Option<String>,
) -> Result<SavedDevice, String> {
    let ip = ip.trim().to_string();
    ip.parse::<std::net::IpAddr>()
        .map_err(|_| format!("\"{ip}\" is not a valid IP address"))?;

    let found = match discover_with_timeout(MANUAL_ADD_TIMEOUT).await {
        Ok(devices) => devices.into_iter().find(|device| device.ip == ip),
        Err(gree_climate::Error::NoDevicesFound) => None,
        Err(other) => return Err(other.to_string()),
    };
    let info = found.ok_or_else(|| format!("No GREE device answered at {ip}"))?;

    let saved = SavedDevice {
        info,
        alias: normalize_alias(alias),
    };
    let mut devices = load_devices(&app)?;
    if let Some(existing) = devices
        .iter_mut()
        .find(|device| device.info.mac == saved.info.mac)
    {
        *existing = saved.clone();
    } else {
        devices.push(saved.clone());
    }
    replace_devices(&app, &state, devices)?;
    Ok(saved)
}

/// Set (or clear, with a blank name) the user-given name of a saved device.
///
/// Devices are matched by MAC address, which is their stable identity.
#[tauri::command]
async fn rename_device(
    app: AppHandle,
    state: State<'_, AppState>,
    mac: String,
    alias: Option<String>,
) -> Result<Vec<SavedDevice>, String> {
    let mut devices = load_devices(&app)?;
    let entry = devices
        .iter_mut()
        .find(|device| device.info.mac == mac)
        .ok_or_else(|| format!("Unknown device: {mac}"))?;
    entry.alias = normalize_alias(alias);
    replace_devices(&app, &state, devices)
}

/// Resize the main window so its height matches the webview content.
///
/// `height` is the content height in CSS pixels. The window is not
/// user-resizable; this command is the only thing that changes its size.
///
/// After applying a size the adopted inner height is read back: on macOS the
/// window can settle a constant offset short of the request (window-chrome
/// accounting), so a shortfall is compensated by growing the request. Reads
/// are bounded and best-effort; the frontend keeps the loop convergent by
/// never settling for a window shorter than the content.
#[tauri::command]
async fn fit_window_height(
    app: AppHandle,
    height: f64,
    viewport: Option<f64>,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Missing main window".to_string());
    };
    let mut size = content_window_size(height);
    // Anti-balloon rail: never grow the request more than this above the
    // measured content, even if the read-back keeps reporting short.
    let max_request = size.height + 64.0;
    for _ in 0..FIT_ATTEMPTS {
        apply_content_size(&app, size)?;
        // The resize above travels through the main thread and the window
        // server asynchronously; give it a beat to land before reading back.
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let actual = window
            .inner_size()
            .map_err(|e| e.to_string())?
            .to_logical::<f64>(scale)
            .height;
        #[cfg(debug_assertions)]
        eprintln!(
            "[fit] req={} view={} actual={}",
            size.height,
            viewport
                .map(|v| v.to_string())
                .unwrap_or_else(|| "?".to_string()),
            actual
        );
        match next_height_to_request(size.height, actual) {
            Some(grown) => {
                size.height = grown
                    .clamp(MIN_CONTENT_HEIGHT, MAX_CONTENT_HEIGHT)
                    .min(max_request);
                if size.height <= actual + FIT_TOLERANCE {
                    break;
                }
            }
            None => break,
        }
    }
    Ok(())
}

/// Sort devices front to back following `macs`.
///
/// Entries missing from `macs` keep their relative order at the end
/// (stable sort), so a partial order never loses devices.
fn sort_devices_by_order(devices: &mut Vec<SavedDevice>, macs: &[String]) {
    devices.sort_by_key(|device| {
        macs.iter()
            .position(|mac| mac == &device.info.mac)
            .unwrap_or(usize::MAX)
    });
}

/// Persist a new display order for the saved devices.
///
/// `macs` lists MAC addresses front to back. Returns the reordered list.
#[tauri::command]
async fn set_device_order(
    app: AppHandle,
    state: State<'_, AppState>,
    macs: Vec<String>,
) -> Result<Vec<SavedDevice>, String> {
    let mut devices = load_devices(&app)?;
    sort_devices_by_order(&mut devices, &macs);
    replace_devices(&app, &state, devices)
}

/// Forget a saved device. Returns the remaining list.
#[tauri::command]
async fn remove_device(
    app: AppHandle,
    state: State<'_, AppState>,
    mac: String,
) -> Result<Vec<SavedDevice>, String> {
    let devices = load_devices(&app)?;
    let kept: Vec<SavedDevice> = devices
        .into_iter()
        .filter(|device| device.info.mac != mac)
        .collect();
    state.clients.lock().await.remove(&mac);
    replace_devices(&app, &state, kept)
}

/// Look up the saved network identity of a device by MAC.
fn saved_info(state: &State<'_, AppState>, mac: &str) -> Result<DeviceInfo, String> {
    let devices = state.devices.lock().map_err(|e| e.to_string())?;
    devices
        .iter()
        .find(|device| device.info.mac == mac)
        .map(|device| device.info.clone())
        .ok_or_else(|| format!("Unknown device: {mac}"))
}

/// Connect and bind a device unless a live client is already pooled.
async fn ensure_client(
    app: &AppHandle,
    state: &State<'_, AppState>,
    mac: &str,
) -> Result<(), String> {
    if state.clients.lock().await.contains_key(mac) {
        return Ok(());
    }
    // Re-read identity from disk so an app restart never strands the pool.
    let info = match saved_info(state, mac) {
        Ok(info) => info,
        Err(_) => load_devices(app)?
            .into_iter()
            .find(|device| device.info.mac == mac)
            .map(|device| device.info)
            .ok_or_else(|| format!("Unknown device: {mac}"))?,
    };
    let mut client = Client::connect(info).await.map_err(|e| e.to_string())?;
    client.bind().await.map_err(|e| e.to_string())?;
    state.clients.lock().await.insert(mac.to_string(), client);
    Ok(())
}

/// Read the live state of a device, reconnecting once on failure.
#[tauri::command]
async fn get_state(
    app: AppHandle,
    state: State<'_, AppState>,
    mac: String,
) -> Result<DeviceState, String> {
    for attempt in 0..2 {
        ensure_client(&app, &state, &mac).await?;
        let mut clients = state.clients.lock().await;
        let client = clients
            .get_mut(&mac)
            .ok_or_else(|| "Device session was lost".to_string())?;
        match client.refresh().await {
            Ok(()) => return Ok(client.state().clone()),
            Err(error) => {
                clients.remove(&mac);
                if attempt == 1 {
                    return Err(error.to_string());
                }
            }
        }
    }
    Err("Device did not answer".to_string())
}

/// Apply one control change, then return the refreshed live state.
///
/// Like reads, a failed attempt drops the pooled client and retries once
/// with a fresh connection before reporting the error.
#[tauri::command]
async fn set_control(
    app: AppHandle,
    state: State<'_, AppState>,
    mac: String,
    action: ControlAction,
) -> Result<DeviceState, String> {
    for attempt in 0..2 {
        ensure_client(&app, &state, &mac).await?;
        let mut clients = state.clients.lock().await;
        let client = clients
            .get_mut(&mac)
            .ok_or_else(|| "Device session was lost".to_string())?;
        let applied = match &action {
            ControlAction::Power(on) => client.set_power(*on).await,
            ControlAction::Mode(mode) => client.set_mode(*mode).await,
            ControlAction::Temperature(temp) => client.set_temperature(*temp).await,
            ControlAction::FanSpeed(speed) => client.set_fan_speed(*speed).await,
            ControlAction::SwingVertical(swing) => client.set_swing_vertical(*swing).await,
            ControlAction::SwingHorizontal(swing) => client.set_swing_horizontal(*swing).await,
            ControlAction::Turbo(on) => client.set_turbo(*on).await,
            ControlAction::Quiet(on) => client.set_quiet(*on).await,
            ControlAction::Sleep(on) => client.set_sleep(*on).await,
            ControlAction::SteadyHeat(on) => client.set_steady_heat(*on).await,
            ControlAction::PowerSave(on) => client.set_power_save(*on).await,
            ControlAction::FreshAir(on) => client.set_fresh_air(*on).await,
            ControlAction::Xfan(on) => client.set_xfan(*on).await,
            ControlAction::Anion(on) => client.set_anion(*on).await,
            ControlAction::Light(on) => client.set_light(*on).await,
        };
        let outcome = match applied {
            Ok(()) => client.refresh().await,
            Err(error) => Err(error),
        };
        match outcome {
            Ok(()) => return Ok(client.state().clone()),
            Err(error) => {
                clients.remove(&mac);
                if attempt == 1 {
                    return Err(error.to_string());
                }
            }
        }
    }
    Err("Device did not answer".to_string())
}

/// Toggle the main window when the tray icon is left-clicked.
fn handle_tray_click(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            devices: Mutex::new(Vec::new()),
            clients: tauri::async_runtime::Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            // Tray-first: hide the Dock icon, keep only the menu-bar icon.
            app.set_activation_policy(ActivationPolicy::Accessory);

            let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = app
                .default_window_icon()
                .cloned()
                .expect("app icon is missing: run `npm run tauri icon` first");

            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("Gree Climate")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        handle_tray_click(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it to the tray instead of quitting.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            discover_devices,
            get_saved_devices,
            complete_onboarding,
            add_device_by_ip,
            rename_device,
            remove_device,
            set_device_order,
            fit_window_height,
            get_state,
            set_control
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Gree Climate");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(mac: &str) -> SavedDevice {
        SavedDevice {
            info: DeviceInfo::new(
                "192.168.1.1".to_string(),
                7000,
                mac.to_string(),
                mac.to_string(),
            ),
            alias: None,
        }
    }

    fn macs(devices: &[SavedDevice]) -> Vec<&str> {
        devices.iter().map(|d| d.info.mac.as_str()).collect()
    }

    #[test]
    fn reorder_follows_given_macs() {
        let mut devices = vec![saved("aa"), saved("bb"), saved("cc")];
        let order = ["cc".to_string(), "aa".to_string(), "bb".to_string()];
        sort_devices_by_order(&mut devices, &order);
        assert_eq!(macs(&devices), vec!["cc", "aa", "bb"]);
    }

    #[test]
    fn content_height_tracks_the_webview_and_clamps() {
        let size = content_window_size(640.0);
        assert_eq!(size.width, WINDOW_WIDTH);
        assert_eq!(size.height, 640.0);

        assert_eq!(content_window_size(10.0).height, MIN_CONTENT_HEIGHT);
        assert_eq!(content_window_size(9_000.0).height, MAX_CONTENT_HEIGHT);
        assert_eq!(content_window_size(f64::NAN).height, MIN_CONTENT_HEIGHT);
        assert_eq!(
            content_window_size(f64::INFINITY).height,
            MIN_CONTENT_HEIGHT
        );
    }

    fn named(mac: &str, name: &str, alias: Option<&str>) -> SavedDevice {
        SavedDevice {
            info: DeviceInfo::new(
                "192.168.1.1".to_string(),
                7000,
                mac.to_string(),
                name.to_string(),
            ),
            alias: alias.map(str::to_string),
        }
    }

    #[test]
    fn rescan_merges_by_mac_without_dropping_saved() {
        let saved = vec![named("aa", "old-name", Some("Living")), named("bb", "other", None)];
        let incoming = vec![
            named("aa", "new-name", Some("Soggiorno")),
            named("cc", "third", None),
        ];
        let merged = merge_saved_devices(saved, incoming);
        // Order kept, matched entry refreshed in place, new one appended.
        assert_eq!(
            merged.iter().map(|d| d.info.mac.as_str()).collect::<Vec<_>>(),
            vec!["aa", "bb", "cc"]
        );
        assert_eq!(merged[0].info.name, "new-name");
        assert_eq!(merged[0].alias.as_deref(), Some("Soggiorno"));
        // Untouched entry survives the rescan even though it was not found.
        assert_eq!(merged[1].info.mac, "bb");
    }

    #[test]
    fn blank_alias_means_no_alias_after_merge() {
        let merged = merge_saved_devices(vec![], vec![named("aa", "n", Some("   "))]);
        assert_eq!(merged[0].alias, None);
    }

    #[test]
    fn short_window_grows_request_by_shortfall() {
        // The exact offset observed on macOS (requested 716, adopted 684).
        assert_eq!(next_height_to_request(716.0, 684.0), Some(748.0));
        assert_eq!(next_height_to_request(809.0, 777.0), Some(841.0));
    }

    #[test]
    fn fitting_stops_at_or_just_above_target() {
        assert_eq!(next_height_to_request(700.0, 700.0), None);
        // Small overshoot is fine and avoids resize ping-pong.
        assert_eq!(next_height_to_request(700.0, 701.0), None);
        // Anything within tolerance still counts as settled.
        assert_eq!(next_height_to_request(700.0, 698.0), None);
        // Anything shorter must be retried with compensation.
        assert_eq!(next_height_to_request(700.0, 697.0), Some(703.0));
    }

    #[test]
    fn unknown_macs_keep_relative_order_at_end() {
        let mut devices = vec![saved("aa"), saved("bb"), saved("cc")];
        let order = ["cc".to_string()];
        sort_devices_by_order(&mut devices, &order);
        assert_eq!(macs(&devices), vec!["cc", "aa", "bb"]);
    }
}
