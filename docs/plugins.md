# Flight data bridge

SkyLog 1.2.0 ships a local-only telemetry bridge on `127.0.0.1:42831`.

## X-Plane 11/12

1. Install [FlyWithLua](https://forums.x-plane.org/index.php?/files/file/38445-flywithlua-ng/).
2. Install the SkyLog bridge from **Downloads → SkyLog 遥测插件 · X-Plane**, or copy
   `plugins/xplane/SkyLogTelemetry.lua` to
   `<X-Plane>/Resources/plugins/FlyWithLua/Scripts/`.
3. Load a flight. The script writes `SkyLogTelemetry.json` beside itself every ~350 ms.
4. SkyLog watches that file while a tracking session is active.

## Microsoft Flight Simulator 2020/2024

1. Install the panel from **Downloads → SkyLog 遥测插件** (it copies into the
   selected Community folder).
2. Start a flight and open **SkyLog Telemetry** from the in-game toolbar.
3. Keep the panel open. It posts SimVar samples to SkyLog every 500 ms.

The panel is an HTML/JS InGamePanel package with `manifest.json` and `layout.json`.
MSFS package layouts vary between versions; if the toolbar entry does not appear,
review the `README.txt` inside the installed `skylog-telemetry` folder and the
SkyLog log at the app data directory.

## Data fields

- latitude / longitude
- altitude (feet)
- indicated airspeed (knots)
- true heading (degrees)
- vertical speed (feet per minute)
- on-ground flag
- timestamp

No data leaves the machine. The bridge only listens on loopback and accepts JSON
POSTs. It is deliberately not exposed on the LAN.
