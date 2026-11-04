// Airline-inspired UI themes. These are deliberately original, abstract
// interpretations of each carrier's public colours; no official logo artwork
// is bundled. See the in-app disclaimer.

export const THEME_CODES = {
  airchina: 'CA7K9Q2M4T8X1P6R',
  csair: 'CZ3N8V5B2L7D9F4H',
  ceair: 'MU6W1Y4J9C3R8K5T',
  shenzhen: 'ZH2P7G5S8X4N1B6V',
  hainan: 'HU9D3F6L2Q8M5T1W',
  xiamen: 'MF4R8K1C7V3Y6P2J',
  shanghai: 'FM5T9X2B6N1L8D4Q',
};

function nav(icons) {
  return {
    details: 'file',
    map: 'map',
    log: 'book',
    downloads: 'download',
    toolbox: 'toolbox',
    settings: 'sliders',
    ...icons,
  };
}

export const THEMES = [
  {
    id: 'default',
    nameZh: 'SkyLog 蓝',
    nameEn: 'SkyLog Blue',
    airlineZh: 'SkyLog 默认',
    airlineEn: 'SkyLog default',
    code: null,
    logo: 'SL',
    primary: '#2f6df6',
    deep: '#2458d6',
    soft: '#eaf1ff',
    soft2: '#f3f7ff',
    accent: '#7fb2ff',
    background: { top: '#f5f8fd', bottom: '#e8f1ff', glow: '#b6d2ff' },
    navIcons: nav({ home: 'home' }),
  },
  {
    id: 'airchina',
    nameZh: '中国国际航空',
    nameEn: 'Air China',
    airlineZh: '凤凰知音 · 北京',
    airlineEn: 'PhoenixMiles · Beijing',
    code: THEME_CODES.airchina,
    logo: 'CA',
    primary: '#c8102e',
    deep: '#980b20',
    soft: '#fff0f2',
    soft2: '#fff7f8',
    accent: '#e0a526',
    background: { top: '#fff7f5', bottom: '#f7e4e7', glow: '#efb7bf' },
    navIcons: nav({ home: 'takeoff', map: 'globe', toolbox: 'sparkles' }),
  },
  {
    id: 'csair',
    nameZh: '中国南方航空',
    nameEn: 'China Southern',
    airlineZh: '明珠俱乐部 · 广州',
    airlineEn: 'Sky Pearl Club · Guangzhou',
    code: THEME_CODES.csair,
    logo: 'CZ',
    primary: '#0a5fae',
    deep: '#06457f',
    soft: '#eaf5ff',
    soft2: '#f4faff',
    accent: '#d71920',
    background: { top: '#f4faff', bottom: '#dceeff', glow: '#9dc8ef' },
    navIcons: nav({ home: 'navigation', map: 'globe', toolbox: 'layers' }),
  },
  {
    id: 'ceair',
    nameZh: '中国东方航空',
    nameEn: 'China Eastern',
    airlineZh: '东方万里行 · 上海',
    airlineEn: 'Eastern Miles · Shanghai',
    code: THEME_CODES.ceair,
    logo: 'MU',
    primary: '#d71920',
    deep: '#a50f18',
    soft: '#fff0f1',
    soft2: '#fff7f7',
    accent: '#163d6b',
    background: { top: '#fff8f5', bottom: '#f4dfdf', glow: '#e7b7b7' },
    navIcons: nav({ home: 'sunrise', map: 'compass', toolbox: 'sparkles' }),
  },
  {
    id: 'shenzhen',
    nameZh: '深圳航空',
    nameEn: 'Shenzhen Airlines',
    airlineZh: '凤凰知音 · 深圳',
    airlineEn: 'PhoenixMiles · Shenzhen',
    code: THEME_CODES.shenzhen,
    logo: 'ZH',
    primary: '#b5121b',
    deep: '#820b12',
    soft: '#fff1f1',
    soft2: '#fff8f6',
    accent: '#e6b94a',
    background: { top: '#fff9f2', bottom: '#f6e6dc', glow: '#eccb9f' },
    navIcons: nav({ home: 'takeoff', map: 'map', toolbox: 'sparkles' }),
  },
  {
    id: 'hainan',
    nameZh: '海南航空',
    nameEn: 'Hainan Airlines',
    airlineZh: '金鹏俱乐部 · 海口',
    airlineEn: 'Fortune Wings Club · Haikou',
    code: THEME_CODES.hainan,
    logo: 'HU',
    primary: '#c8102e',
    deep: '#8e0b21',
    soft: '#fff1f3',
    soft2: '#fff8f4',
    accent: '#d4a44a',
    background: { top: '#fff9f4', bottom: '#f3e2dc', glow: '#ecc9b1' },
    navIcons: nav({ home: 'sun', map: 'map', toolbox: 'sparkles' }),
  },
  {
    id: 'xiamen',
    nameZh: '厦门航空',
    nameEn: 'XiamenAir',
    airlineZh: '白鹭俱乐部 · 厦门',
    airlineEn: 'Egret Club · Xiamen',
    code: THEME_CODES.xiamen,
    logo: 'MF',
    primary: '#0b63b7',
    deep: '#07477f',
    soft: '#edf7ff',
    soft2: '#f5fbff',
    accent: '#66b3e8',
    background: { top: '#f4fbff', bottom: '#dcefff', glow: '#a8d4f1' },
    navIcons: nav({ home: 'compass', map: 'globe', toolbox: 'layers' }),
  },
  {
    id: 'shanghai',
    nameZh: '上海航空',
    nameEn: 'Shanghai Airlines',
    airlineZh: '东方万里行 · 上海',
    airlineEn: 'Eastern Miles · Shanghai',
    code: THEME_CODES.shanghai,
    logo: 'FM',
    primary: '#c8102e',
    deep: '#8e0b21',
    soft: '#fff1f2',
    soft2: '#f3f7ff',
    accent: '#1f4e79',
    background: { top: '#f8faff', bottom: '#f2dfe3', glow: '#c7d8ef' },
    navIcons: nav({ home: 'compass', map: 'navigation', toolbox: 'sparkles' }),
  },
];

export function getTheme(id, unlocked = []) {
  const theme = THEMES.find((item) => item.id === id);
  if (!theme) return THEMES[0];
  if (theme.id !== 'default' && !unlocked.includes(theme.id)) return THEMES[0];
  return theme;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function themeBackgroundUri(theme) {
  const bg = theme.background;
  const name = escapeXml(theme.nameEn);
  const code = escapeXml(theme.logo);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg.top}"/>
      <stop offset=".56" stop-color="${bg.glow}" stop-opacity=".38"/>
      <stop offset="1" stop-color="${bg.bottom}"/>
    </linearGradient>
    <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="${theme.primary}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${theme.primary}" stop-opacity=".25"/>
      <stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <circle cx="1510" cy="180" r="300" fill="${theme.primary}" opacity=".035"/>
  <circle cx="1600" cy="250" r="180" fill="none" stroke="${theme.primary}" stroke-opacity=".09" stroke-width="2"/>
  <circle cx="1600" cy="250" r="120" fill="none" stroke="${theme.primary}" stroke-opacity=".08" stroke-width="1.5" stroke-dasharray="5 12"/>
  <path d="M-80 830C340 610 620 930 1040 680s610-180 1040-30" fill="none" stroke="url(#trail)" stroke-width="2.5" stroke-dasharray="10 16"/>
  <path d="M-50 900C390 740 680 980 1100 760s640-110 900 30" fill="none" stroke="${theme.accent}" stroke-opacity=".13" stroke-width="1.5"/>
  <g opacity=".055" fill="${theme.primary}">
    <path d="M1160 700c170-100 320-40 520-150l-34 76c-140 40-260 54-370 112Z"/>
    <path d="M1260 730c160-50 270 20 410-40l-18 50c-110 35-220 28-330 54Z"/>
  </g>
  <g opacity=".08" fill="none" stroke="${theme.primary}" stroke-width="2">
    <path d="M160 150h420M160 220h260M160 290h340"/>
  </g>
  <text x="1520" y="520" text-anchor="middle" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="230" font-weight="700" fill="${theme.primary}" opacity=".055">${code}</text>
  <text x="1520" y="610" text-anchor="middle" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="25" font-weight="600" letter-spacing="5" fill="${theme.primary}" opacity=".12">${name.toUpperCase()}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function navIconFor(theme, route) {
  return theme?.navIcons?.[route] || 'dot';
}
