import fs from 'node:fs';
const all = JSON.parse(fs.readFileSync('node_modules/world-countries/countries.json','utf8'));
const out = {};
for (const c of all) {
  if (!c.cca2) continue;
  out[c.cca2] = { n: c.name.common, num: c.ccn3 || '', lat: c.latlng?.[0] ?? 0, lon: c.latlng?.[1] ?? 0, r: c.region || 'Other', s: c.subregion || '', f: c.flag || '' };
}
fs.writeFileSync('src/data/countries.json', JSON.stringify(out));
fs.copyFileSync('node_modules/world-atlas/countries-50m.json', 'public/countries-50m.json');
console.log('countries', Object.keys(out).length);
