# Flight data bridge

SkyLog 1.3.0 keeps a local-only telemetry bridge on `127.0.0.1:42831` and reads simulators through their own local APIs. At startup it also tries to install/repair the bundled X-Plane script and the MSFS launch hook automatically.

## Microsoft Flight Simulator 2020/2024 (recommended path)

SkyLog uses **SimConnect** directly from its Electron main process. No Community package, in-game panel, toolbar icon, or FlyWithLua installation is required.

1. Start Microsoft Flight Simulator and load into a flight.
2. Start SkyLog with the same Windows user account. If MSFS is the selected game, SkyLog starts the SimConnect source automatically; otherwise use **读取飞行数据** on a flight.
3. Watch **设置 → 飞行数据连接** for `MSFS SimConnect · 已连接`.
4. Steer the aircraft normally; SkyLog records latitude, longitude, altitude, indicated airspeed, heading, vertical speed, and on-ground state.

### Auto-launch from MSFS

On startup SkyLog writes a `SkyLog` entry to the per-user MSFS `exe.xml`
(`%APPDATA%\Microsoft Flight Simulator 2024`, MSFS 2020 equivalents, or the Store LocalCache).
The entry points at the installed SkyLog executable, so the next simulator launch opens SkyLog automatically. A backup is written as `exe.xml.skylog.bak` before editing. Settings → Flight data connection → **安装 / 修复组件** can recreate it.

The transport is the standard `node-simconnect` client, which speaks the SimConnect named-pipe protocol directly and supports MSFS 2020 and 2024. Because SimConnect uses a Windows named pipe, SkyLog and the simulator must run in the same interactive user session. If the pipe is blocked, run both normally under the same account (not as mixed elevated/non-elevated processes).

The old `skylog-telemetry` HTML InGamePanel package from 1.2.0 is no longer used. It is still copied as a bundled compatibility package but is not the telemetry source. If it is present in Community, it is harmless; the 1.2.0 panel lacked the toolbar registration (`.spb`) and icon assets required by MSFS 2024.

## X-Plane 11/12

SkyLog first tries X-Plane's built-in **UDP RREF** stream:

1. In X-Plane, open **Settings → Network** and make sure UDP data output is enabled on port `49000` (the X-Plane default).
2. Start a flight. SkyLog listens locally and requests the needed datarefs five times per second.
3. Watch **设置 → 飞行数据连接** for `X-Plane UDP RREF · 已连接`.

If FlyWithLua is installed, SkyLog writes `SkyLogTelemetry.lua` into its `Scripts` folder. The script samples JSON and attempts to launch SkyLog once when the simulator loads. If FlyWithLua is unavailable, the script is kept under `Community/SkyLogTelemetry` for manual installation; UDP remains the primary data path.

If UDP is unavailable, install [FlyWithLua](https://forums.x-plane.org/index.php?/files/file/38445-flywithlua-ng/) and use **Downloads → SkyLog 遥测插件 · X-Plane**. The script writes `SkyLogTelemetry.json` beside itself; SkyLog watches that file while a tracking session is active.

## Data fields

- latitude / longitude
- altitude (feet)
- indicated airspeed (knots)
- true heading (degrees)
- vertical speed (feet per minute)
- on-ground flag
- ground speed (where available)
- timestamp

No data leaves the machine. The HTTP bridge only listens on loopback; SimConnect and X-Plane UDP are local simulator transports. Nothing is exposed on the LAN.
