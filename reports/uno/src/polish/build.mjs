// Monta um único index.html autocontido a partir de source/js/*.js e source/wgsl/*.wgsl.
// uso: node source/build.mjs [--src DIR] [--out ARQUIVO] [--min] [--pack]
// --pack: o código vai comprimido (deflate-raw em base64) e é descomprimido na abertura com DecompressionStream, nativo do navegador
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(opt('--src', here));
const out = path.resolve(opt('--out', path.join(here, '..', 'index.html')));
const min = args.includes('--min'), pack = args.includes('--pack');
const ls = (d, ext) => fs.readdirSync(path.join(src, d)).filter(f => f.endsWith(ext)).sort();
const stripWgsl = s => s.replace(/\/\/(?! @dyn)[^\n]*/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').replace(/^ +/gm, '');
let wg = 'const WGSL = {};\n';
for (const f of ls('wgsl', '.wgsl')) {
  let s = fs.readFileSync(path.join(src, 'wgsl', f), 'utf8');
  if (min) s = stripWgsl(s);
  if (s.includes('`') || s.includes('${')) throw new Error('wgsl com crase: ' + f);
  wg += `WGSL[${JSON.stringify(f.replace('.wgsl', ''))}] = \`${s.replace(/\\/g, '\\\\')}\`;\n`;
}
let js = '';
for (const f of ls('js', '.js')) {
  let s = fs.readFileSync(path.join(src, 'js', f), 'utf8');
  js += `// ---- ${f}\n${s}\n`;
}
if (min) js = js.split('\n').map(l => l.replace(/^\s+/, '')).filter(l => l && !/^\/\/(?!#)/.test(l)).join('\n');
let html = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');
if (js.includes('</script')) throw new Error('fonte contém </script');
let code = `(()=>{'use strict';\n${wg}${js}\n})();`;
if (pack) {
  const b64 = zlib.deflateRawSync(Buffer.from(code, 'utf8'), { level: 9 }).toString('base64');
  code = `(async()=>{try{const b=atob('${b64}'),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);` +
    `const s=document.createElement('script');s.textContent=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();document.body.appendChild(s);}` +
    `catch(e){document.getElementById('msg').textContent='erro: '+e.message;}})();`;
}
html = html.replace('/*__CODE__*/', () => code);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`ok ${out} ${(html.length / 1024).toFixed(1)} KiB`);
