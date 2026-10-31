# Changelog

> English summary: SkyLog 1.1.0 adds X-Plane/MSFS auto-detection and launch, an in-app SimBrief draft workflow, a Chinese/English UI, frosted-glass interactions, corrected China / South China Sea map data, and macOS x64/arm64 package support. All 1.0 features remain.

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
