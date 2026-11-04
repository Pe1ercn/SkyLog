# SkyLog Telemetry Bridge for X-Plane

1. Install **FlyWithLua** for X-Plane 11/12.
2. Copy `SkyLogTelemetry.lua` to:
   `X-Plane/Resources/plugins/FlyWithLua/Scripts/`
3. Start X-Plane and load a flight. SkyLog will watch `SkyLogTelemetry.json`
   in the same Scripts folder.

This bridge exposes latitude, longitude, altitude, indicated speed, true
heading, vertical speed and on-ground state. It is intentionally small and
local-only.
