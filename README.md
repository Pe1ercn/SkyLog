# SkyLog 航迹

> 把每一次起飞，都留在地图上。

SkyLog 航迹是一款面向微软模拟飞行与 X-Plane 玩家的桌面飞行计划与飞行日志工具。它从 SimBrief 读取 OFP，把航班号、起降机场、巡航高度、航路、机型和性能数据整理成可回看的记录，并在内置世界地图上画出完整航迹。v1.1.0 同时提供 Windows 安装包与 macOS 应用包。

模拟飞行玩家通常在 SimBrief 生成计划，但计划容易散落在网页、PDF 和截图里；同一次游戏里的多个起降也不容易归档。SkyLog 想解决三件事：**计划读得进来、航线看得清楚、飞行记得下来。**

## English overview

SkyLog is a local-first flight-plan and logbook app for Microsoft Flight Simulator and X-Plane. It reads your latest SimBrief OFP, draws the route and waypoints on an offline world map, and keeps every leg grouped into a game session. Version 1.1.0 adds automatic X-Plane/MSFS detection and launch, an in-app SimBrief draft workflow, a Chinese/English UI, frosted-glass interactions, and corrected China / South China Sea map data.

## 界面

![SkyLog 概览](docs/screenshots/home.png)

![SkyLog 飞行地图](docs/screenshots/map.png)

![SkyLog 航段详情](docs/screenshots/detail.png)

## 功能

### 读取 SimBrief

- 输入 Pilot ID，或粘贴 SimBrief 计划链接，读取最新一份 OFP。
- 自动识别航班号 / 呼号、起降机场、计划时间、机型与注册号。
- 读取巡航高度、阶梯巡航、航路、航路点、燃油、载重、天气、性能数据和机组信息。
- 自动检查重复计划；同一份计划需要记录第二个架次时，可以确认后再次导入。
- 只调用 SimBrief 的公开读取接口，不保存账号密码。

### 世界地图

- 内置 Natural Earth 1:50m 世界矢量地图，浅色、干净，**不依赖在线瓦片**；只有读取 SimBrief 时需要联网。
- 中国台湾、香港、澳门作为中国的一部分呈现；南海诸岛与九段线按中国标准地图标注。
- 航线支持两种显示方式：**航点连线** 或 **起降直连**。
- 机场标签可切换为全称、IATA/ICAO 代码，或代码加全称。
- 可显示 / 隐藏航点、备降场，也可以叠加全部已存航班。
- 点击航线、机场或航点，打开对应详情；支持缩放与一键适应航路。
- 航点模式会保留 SimBrief 计划里的真实航路走向，而不是简单的两点直线。

### 航段详情

每个航段都有完整详情页，分为：

- **概览**：航班信息、起降时间、巡航、航路、燃油、载重、机场天气、机组与计划链接。
- **航路**：逐点航路表，包含航点、航路、阶段、高度、距离、累计时间、剩余油量、风和 FIR。
- **机场**：起飞机场、到达机场和备降机场的跑道、海拔、时区、坐标、METAR / TAF。
- **性能**：起飞与着陆性能、V 速度、跑道距离、高度与成本指数影响、重量限制。
- **日志**：标记已飞、填写实际日期、实际轮挡和备注，也可以移动所属游戏会话。

### 飞行日志与游戏会话

- 一次游戏可以包含多个起降。导入时明确选择：**新的游戏会话** 或 **加入现有游戏**。
- 日志按游戏会话分组，显示航段数、已飞数量、总距离和总时间。
- 支持把航段移出为新的游戏、移动到其他游戏、合并两个游戏会话。
- 支持重命名游戏、写游戏备注、搜索、状态筛选和排序。
- 航段状态、实际执行日期、实际轮挡与个人备注都会保存在本地。

### 本地数据

- 所有日志、计划详情和原始 SimBrief JSON 都保存在本机，不上传云端。
- 支持导出 JSON 备份、CSV 飞行记录，以及单个航段的原始 JSON。
- 支持重量、距离、高度、时间显示单位和地图标签的偏好设置。
- 日志损坏时会自动尝试从备份恢复。

### 游戏与启动（v1.1.0）

- 自动检测 X-Plane 11 / 12 与 Microsoft Flight Simulator 2020 / 2024。
- 支持 Steam、Microsoft Store、常见安装目录与 macOS Applications 目录；也支持手动选择可执行文件或 `.app`。
- 在侧边栏或设置页一键启动游戏；游戏路径与选择会保存在本地。

### 创建 SimBrief（v1.1.0）

- 在应用内填写起降机场、机型、航司、航班号、日期时间、航路、备降场与旅客数。
- 一键打开 SimBrief 官方 dispatch 页面并预填参数；在 SimBrief 登录并生成 OFP 后，回到 SkyLog 读取最新计划即可导入日志。
- SimBrief 的正式创建 API 需要 Navigraph 合作方密钥，因此应用不保存密码，也不伪造自动生成结果。

### 英文界面与玻璃质感（v1.1.0）

- 设置 → 显示偏好 → 界面语言，可在中文与 English 之间切换。
- 主要按钮、地图控制、分段选择器和设置卡片使用半透明磨砂玻璃效果，并保留减少动态效果设置。

## 使用流程

1. 安装并打开 SkyLog 航迹。
2. 在「设置」里填入 SimBrief Pilot ID，或直接点「导入 SimBrief」。
3. 确认计划，选择它属于新的游戏还是已有游戏。
4. 导入后在地图上查看航路，点击机场或航线查看详情。
5. 飞行结束后，在航段日志里标记已飞并写下备注。

## 设计

界面采用浅色、低饱和的航空蓝配色，减少长时间查看数据的疲劳。航路绘制、面板切换和数字统计都带有适度动画；同时尊重系统的“减少动态效果”设置。

应用隐藏系统标题栏，使用与界面一体化的浅色顶栏，整体更像一张安静的电子飞行日志，而不是一个复杂的航空运行系统。

## 技术实现

- **桌面框架**：Electron 43（Windows x64；macOS x64 / arm64）。
- **界面**：原生 JavaScript + CSS，Vite 构建；Leaflet 负责地图交互。
- **地图数据**：Natural Earth 1:50m 国家边界与轮廓，本地打包；中国台湾、香港、澳门并入中国，南海诸岛与九段线使用独立本地图层。
- **主进程**：负责 SimBrief 请求、数据归档、文件读写和本地日志存储。
- **数据层**：纯 JavaScript 计划归一化模块，将 SimBrief 原始 JSON 转换成稳定的应用数据模型。
- **测试**：Node.js 单元测试覆盖计划解析、地理计算、会话分组、备份恢复、CSV 与异常恢复。

## 兼容性与安装

- 支持 Windows 10 / 11 x64，提供 NSIS 安装包。
- 支持 macOS 12+，提供 x64 与 arm64 两个 `.app` ZIP 包；首次打开需右键 → 打开。当前 macOS 包未签名/未公证。
- Windows 安装包约 109 MB，macOS ZIP 约 120 MB；应用本身不依赖外部地图服务。
- 卸载应用不会删除本地飞行日志。

## 测试状态

- 39 项单元测试全部通过，覆盖计划解析、地理计算、游戏路径分类、SimBrief 草稿 URL、会话分组、地图数据、备份恢复、CSV 与异常恢复。
- 已完成 Windows 打包、静默安装、启动、英文切换与卸载测试。
- macOS 包已在 Windows 上完成 bundle 结构、版本、图标与符号链接校验；因当前环境不是 macOS，未做原生启动测试。

## 更新日志

- [SkyLog 1.1.0 更新内容 / What's New](docs/releases/v1.1.0.md)
- [完整变更记录](CHANGELOG.md)

## 说明

SkyLog 不是 SimBrief 或 Navigraph 的官方产品。飞行计划内容归 SimBrief / Navigraph 所有；地图轮廓来自 Natural Earth 公共领域数据。南海诸岛与九段线参考中国民政部标准地图 / geojson.cn 数据。请遵守 SimBrief 的使用条款，不要高频批量读取计划。
