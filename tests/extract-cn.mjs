import fs from 'node:fs';
const files=['src/app.js','src/pages/home.js','src/pages/map.js','src/pages/log.js','src/pages/settings.js','src/ui/import-modal.js','src/ui/flight-detail.js','src/ui/airport-detail.js','src/ui/components.js','src/lib/format.js'];
const all=new Set();
for(const f of files){const t=fs.readFileSync(f,'utf8'); for(const m of t.matchAll(/[\u4e00-\u9fff][^\n`'"<>${}]*/g)){const s=m[0].trim(); if(s.length>1) all.add(s);}}
console.log('unique',all.size);
console.log([...all].sort((a,b)=>b.length-a.length).slice(0,220).join('\n'));
