-- SkyLog Telemetry Bridge for X-Plane 11/12
-- Requires FlyWithLua. Install this file in:
--   <X-Plane>/Resources/plugins/FlyWithLua/Scripts/
-- It writes one JSON sample every ~350 ms and launches SkyLog once when the
-- simulator loads. SkyLog watches this file while flight data is active.

local INTERVAL = 0.35
local last_write = 0
local APP_PATH = [[__SKYLOG_APP__]]
local app_launched = false

local function skylog_launch_app()
    if app_launched or APP_PATH == "" then
        return
    end
    app_launched = true
    pcall(function()
        os.execute('start "" "' .. APP_PATH .. '"')
    end)
end

skylog_launch_app()

function skylog_write_telemetry()
    if os.clock() - last_write < INTERVAL then
        return
    end
    last_write = os.clock()

    local lat = XPLMGetDataf("sim/flightmodel/position/latitude")
    local lon = XPLMGetDataf("sim/flightmodel/position/longitude")
    local elev_m = XPLMGetDataf("sim/flightmodel/position/elevation")
    local speed = XPLMGetDataf("sim/cockpit2/gauges/indicators/airspeed_kts_pilot")
    local heading = XPLMGetDataf("sim/flightmodel/position/psi")
    local vs = XPLMGetDataf("sim/cockpit2/gauges/indicators/vvi_fpm_pilot")
    local on_ground = XPLMGetDatai("sim/flightmodel/failures/onground_any")
    local sim_time = XPLMGetDataf("sim/time/total_running_time_sec")

    local f = io.open(SCRIPT_DIRECTORY .. "/SkyLogTelemetry.json", "w")
    if f == nil then
        return
    end
    f:write(string.format(
        '{"source":"xplane","lat":%.7f,"lon":%.7f,"altitudeFt":%.1f,"speedKt":%.1f,"headingDeg":%.1f,"verticalSpeedFpm":%.1f,"onGround":%s,"simTime":%.1f,"timestamp":%d}',
        lat, lon, elev_m * 3.28084, speed, heading, vs,
        on_ground == 1 and "true" or "false", sim_time, os.time()
    ))
    f:close()
end

do_every_frame("skylog_write_telemetry()")
