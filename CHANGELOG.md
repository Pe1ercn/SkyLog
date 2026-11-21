# Changelog

> English summary: SkyLog 1.3.0 is a cockpit-style redesign with a hover-expanding icon rail, 150 ms page fades, a map-free home with launch/history split, automatic simulator components and MSFS exe.xml launch, a full-width altitude/speed/heading telemetry strip, tray close behaviour, a first-run legal gate, and an in-app support QR.

## [1.3.0] - 2026-11-22

### Added

- Dark cockpit shell; sidebar shows icons only at rest and expands to labels on hover; pages cross-fade for 150 ms.
- New Home layout: game launch on the left, historical flight list and stats on the right, no map.
- Full-width telemetry strip under the map with separate altitude, speed and heading tracks and live values.
- Automatic bundled component installation for MSFS and X-Plane. MSFS gets an `exe.xml` entry so starting the simulator launches SkyLog; the X-Plane FlyWithLua bridge attempts the same.
- Close dialog with quit/tray choices and persistent “save my choice”; tray menu and Settings controls.
- First-run User Agreement and Disclaimer gate; both documents readable in Settings.
- Support QR code in Settings with animated thank-you phrases.
- Unit coverage for the new legal copy and settings fields.

### Changed

- Removed the aircraft gallery and its imagery.
- MSFS/X-Plane sources begin recording automatically once a planned flight is active; game launch now pre-starts the telemetry source.
- Version bumped to 1.3.0; Windows and macOS packages rebuilt.

### Verification

- Built and exercised the new dark home, collapsed/expanded rail, 150 ms transitions, map telemetry strip, close dialog, first-run legal gate, settings additions and component install path in a Windows test instance.
- X-Plane RREF codec tested with the local responder; MSFS SimConnect transport remains tested from 1.2.1.
- Unit tests pass; macOS bundles verified structurally.

## [1.2.1] - 2026-11-07

### Fixed

- **MSFS 2020/2024 live data now works without the Community HTML panel.** The 1.2.0 panel was never registered in the MSFS 2024 toolbar because its package lacked the required `InGamePanels/*.spb` registration and toolbar icon assets. SkyLog now speaks SimConnect directly from the Electron main process and reads latitude, longitude, altitude, IAS, heading, vertical speed and on-ground state.
- MSFS data starts automatically when SkyLog opens with MSFS selected and a flight is active; the first sample also activates the live map recording if a planned flight is present.
- SimConnect reconnect and status reporting now cover simulator start/quit, wrong protocol, and connection errors.

### Added

- X-Plane 11/12 **UDP RREF** telemetry as the primary path. FlyWithLua remains available as a fallback, but is no longer a hard requirement.
- **Settings → 飞行数据连接** diagnostics for MSFS SimConnect, X-Plane UDP, FlyWithLua and the local telemetry port.
- Independent **飞机图库** navigation page with six NASA Image and Video Library photographs. Photos are public-domain aviation photography and are not labeled with aircraft types, registrations or specs.
- NASA photo credits and usage notes in `docs/aviation-photo-credits.md`.

### Changed

- Removed aircraft photos and aircraft intro/spec cards from the home page. The home aviation desk now only keeps airline theme cards and aviation facts.
- Replaced the 1.2.0 Unsplash aircraft-card photos with NASA public-domain gallery images.
- Version bumped to 1.2.1; Windows installer and macOS x64/arm64 ZIPs rebuilt.

### Verification

- `node-simconnect` 4.2.1 connected to a live MSFS 2024 session and produced moving samples over SimConnect (`SunRise` protocol).
- Electron main-process SimConnect module tested against the running simulator; live map auto-started and displayed speed/altitude/heading.
- X-Plane UDP packet/decoder path exercised with a local RREF responder.
- Gallery, navigation, settings diagnostics and production renderer build tested in the Electron app.
- Unit tests pass.

## [1.2.0] - 2026-11-04

### Added

- 首页航空小课堂改用 6 张真实航空照片，增加机型、示例注册号、机龄、座位、航程、巡航速度与动力信息；照片许可与 ID 记录在 `docs/aviation-photo-credits.md`。
- 导入 SimBrief 后询问是否已飞；未飞可选择读取飞行数据。
- X-Plane 11/12 FlyWithLua 遥测脚本与 MSFS 2020/2024 Community HTML 面板。
- 本机遥测桥 `127.0.0.1:42831`；地图实时飞机、状态气泡、蓝色轨迹，以及速度 / 高度 / 航向图表。
- 自动检测 MSFS Community 与 X-Plane plugins；找不到时提示选择，设置页可修改。
- 菜单栏「下载」：FlyByWire 直链、FlightSim.to、飞行宝、X-Plane 插件资源；MSFS 2020/2024 与 X-Plane 11/12 筛选。
- 4 路 Range 多线程 URL 下载、文件名识别、速度 / 进度 / 剩余时间、右下角圆形下载按钮与下载中心。
- 工具箱 URL 下载与持久保存路径。
- 首次启动赞赏码、QQ 群 `967512206`、标题栏「我已赞赏」与复制群号。
- 圆形转场加入轨迹光带与蒙版淡入淡出，提高不透明度。

### Changed

- 下载层改用 Electron `net`，兼容系统代理与证书链。
- 版本升级至 1.2.0；README、插件说明、发布说明与更新日志同步。

### Verification

- 50 项单元测试通过。
- Windows 开发版验证了首启赞赏、下载中心、URL 下载、FAB、文件名识别、7Z 解压、社区插件安装、本机遥测桥、实时地图、状态气泡、三张图表与结束保存。
- 未在真实 X-Plane / MSFS 内完整验证插件面板加载；macOS 包未原生启动。

## [1.1.1] - 2026-11-01

### Added

- 首页改为飞行甲板：左侧游戏启动，右侧机型、航司与航空知识卡片。
- 原概览页独立为菜单栏「详情」。
- 首次启动全盘搜索游戏本体；支持重新全盘搜索和手动选择。
- 工具箱：7 个航空公司主题、16 位兑换码、主题色/菜单图标/背景图变化。
- 自定义背景图导入与不透明度调节（设置和工具箱）。
- 菜单栏圆形扩散转场。
- 地图「全部航线高亮」与全部航线视野适配。

### Changed

- Windows / macOS 版本升级至 1.1.1。
- macOS Steam 版 X-Plane 改用 Steam 启动，修复缺少 `libsteam_api.dylib` 的启动崩溃。
- README、双语发布说明和版本信息同步更新。

### Verification

- 44 项单元测试通过。
- Windows 安装、启动、主题、地图高亮与卸载已验证。
- macOS bundle 结构已验证；未在原生 macOS 启动。真实游戏启动未在无游戏环境端到端验证。

## [1.1.0] - 2026-10-31

### Added

- 自动检测 X-Plane 11 / 12 与 Microsoft Flight Simulator 2020 / 2024，支持 Steam、Microsoft Store、常见安装目录和 macOS Applications 目录。
- 设置页游戏管理：自动检测、手动选择 `.exe` / `.app`、保存默认游戏、一键启动。
- 应用内创建 SimBrief 草稿：起降机场、机型、航司、航班号、日期时间、航路、备降场与旅客数；可打开 SimBrief 官方 dispatch 页面并预填参数，生成后导入最新 OFP。
- 中文 / English 界面切换，覆盖主要页面、地图标签、设置、弹窗和动态状态。
- 交互按钮、地图控制、分段选择器与设置卡片的玻璃磨砂效果。
- 地图数据修正：台湾、香港、澳门并入中国；增加中国台湾、南海诸岛、西沙群岛、南沙群岛、黄岩岛标注；增加南海九段线图层与图例。
- macOS 构建配置与 x64 / arm64 应用包。

### Changed

- 版本升级至 1.1.0。
- README、中文 / 英文发布说明同步更新。
- Windows 标题栏与 macOS 窗口样式、菜单和交通灯留白适配。

### Verification

- 39 项 Node.js 单元测试通过。
- Windows NSIS 安装包的安装、启动、英文切换、创建面板和卸载已验证。
- macOS 包完成 bundle 结构、版本、图标和符号链接校验；未在原生 macOS 上启动。

### Notes

- SimBrief 官方创建 API 需要 Navigraph 合作方密钥，因此应用采用官方 dispatch 预填 + 导入最新 OFP 的工作流，不保存账号密码。
- macOS 包未签名、未公证；Windows 与 macOS 包均未配置代码签名证书。
- 本机没有安装 X-Plane / MSFS，真实游戏启动路径未在本机做端到端验证。

## [1.0.0] - 2026-10-29

- 首个公开源码版本：SimBrief OFP 读取、世界地图、航段详情、飞行日志、游戏会话、本地备份与 CSV 导出。
