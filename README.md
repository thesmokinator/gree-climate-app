# Gree Climate

A menu-bar companion for GREE air conditioners (macOS, Tauri 2 + React).

![Gree Climate](screenshots/001.png)

## What it does

- Lives in the menu bar, out of the way.
- Finds your air conditioners on the local network.
- Turns them on and off, changes temperature, mode, fan speed, swings and extras (quiet, light, sleep, …).
- Remembers your devices and the names you give them.

## Run it

```bash
npm install
npm run tauri dev
```

## Notes

Unofficial project, not affiliated with GREE Electric Appliances. Everything stays on your local network.

The device protocol lives in the [`gree-climate`](https://github.com/thesmokinator/gree-climate) Rust crate.

Available in English and Italiano (Settings → Language).

Released under the MIT License — see [LICENSE](LICENSE).
