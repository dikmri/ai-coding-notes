// 開店待ちの人（20×30 × 10 コマ = 5 人 × 待つ・歩く）。
// 体は Frostwind（https://github.com/trinity-works/frostwind、MIT）の人物の道具 paintPerson で描き、
// 色は CyberSprite の取り込み（import_image、palette.mode = project）でゲームのパレットに合わせる。
import { writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { WORK, CYBERSPRITE, OUT, PALETTE } from '../lib.mjs';

const FROSTWIND = process.env.FROSTWIND || join(WORK, '..', 'pixel-skills', 'frostwind');
const CAST_ROWS = ['thickDude', 'merchant', 'elder', 'bookDude', 'headphones'];
const CW = 20, CH = 30, PROFILE = 2;

function csp(args) {
  const r = spawnSync('uv', ['run', '--quiet', '--project', CYBERSPRITE, 'csp', ...args], { cwd: WORK, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const j = JSON.parse(r.stdout || '{}');
  if (r.status !== 0 || !j.ok) throw new Error(`csp ${args[0]} ${args[2] || ''}: ${(r.stdout || '').slice(0, 1500)} ${r.stderr || ''}`);
  return j;
}

export async function custom() {
  const t0 = Date.now();
  const { paintPerson, castStates, CAST } = await import(pathToFileURL(join(FROSTWIND, 'src', 'people.js')).href);
  const { resolveColour, writePng } = await import(pathToFileURL(join(FROSTWIND, 'tools', 'resolve.mjs')).href);
  const W = CW * CAST_ROWS.length * 2, H = CH;
  const img = Buffer.alloc(W * H * 4);
  const sizes = [];
  CAST_ROWS.forEach((name, n) => {
    const states = castStates(CAST[name]);
    [['idle', 0], ['walk', Math.min(2, states.walk - 1)]].forEach(([state, f], k) => {
      const sp = paintPerson(name, PROFILE, f, state, 'neutral');
      sizes.push(`${name}:${state} ${sp.w}x${sp.h}`);
      const ox = (n * 2 + k) * CW + ((CW - sp.w) >> 1), oy = CH - sp.h;
      for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
        const i = y * sp.w + x;
        if (!sp.occ[i]) continue;
        const [r, g, b] = resolveColour(sp, i);
        const X = ox + x, Y = oy + y;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const p = (Y * W + X) * 4;
        img[p] = r; img[p + 1] = g; img[p + 2] = b; img[p + 3] = 255;
      }
    });
  });
  mkdirSync(join(WORK, 'in'), { recursive: true });
  const raw = join(WORK, 'in', 'folks-frostwind.png');
  writePng(raw, img, W, H);
  // CyberSprite に取り込む（ゲームのパレットへ寄せる）
  rmSync(join(WORK, 'folks'), { recursive: true, force: true });
  csp(['new', 'folks', '--size', `${W}x${H}`, '--palette', JSON.stringify(PALETTE.map(([, h]) => (h.length === 7 ? `${h}ff` : h)))]);
  const imp = csp(['-p', 'folks', 'import', 'image', 'in/folks-frostwind.png', '--preset', 'exact',
    '--pipeline', JSON.stringify({ palette: { mode: 'project' } }),
    '--target', JSON.stringify({ mode: 'layer', layer: 'L1', x: 0, y: 0 }),
    '--provenance', JSON.stringify({ kind: 'imported', provider: 'Frostwind tools/person paintPerson', license: 'MIT', rights_note: 'Frostwind (c) 2026 Trinity Labs Pte. Ltd., MIT License' }),
    '--on-gate-fail', 'accept']);
  csp(['-p', 'folks', 'op', 'outline', 'layer=L1', 'frame=0', 'color=1']);
  const v = csp(['-p', 'folks', 'validate']);
  const ex = csp(['-p', 'folks', 'export', 'image', '--out', 'out/folks.png', '--color-mode', 'rgba']);
  csp(['-p', 'folks', 'export', 'image', '--out', 'prev/folks.png', '--scale', '4', '--color-mode', 'rgba']);
  copyFileSync(join(WORK, 'out', 'folks.png'), join(OUT, 'folks.png'));
  return { name: 'folks', ops: 2, validation: { ok: v.result.ok, counts: v.result.counts }, results: [{ out: 'folks', w: ex.result.files[0].width, h: ex.result.files[0].height }], frostwind: sizes, gates: imp.result?.gates ?? imp.result?.pipeline?.gates ?? null, ms: Date.now() - t0 };
}
export const asset = { name: 'folks', custom };
