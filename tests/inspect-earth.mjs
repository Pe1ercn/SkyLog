import fs from 'node:fs';
const j=JSON.parse(fs.readFileSync('src/assets/world-countries-50m.json','utf8'));
console.log('type',j.type,'features',j.features.length);
const wanted=['China','Taiwan','Hong Kong','Macao','Macau','Paracel','Spratly'];
for(const f of j.features){const p=f.properties; const n=[p.NAME,p.ADMIN,p.SOVEREIGNT,p.ISO_A3,p.NAME_ZH].join('|'); if(wanted.some(w=>n.includes(w))) console.log(n, f.geometry.type, p.LABEL_X,p.LABEL_Y);}
