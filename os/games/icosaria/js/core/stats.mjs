// 成長と能力とダメージの式（Gemini 4 Carbon の設計書の数値どおり）
export const BASE = { hp: 120, mp: 60, atk: 14, resonance: 10, def: 6, crit: 5, move_spd: 4.5, cdr: 0 };
export const PER_LEVEL = { hp: 16, mp: 5, atk: 2, resonance: 2, def: 1 };
export const CAPS = { move_spd: 7.2, cdr: 40, crit: 75 };

// 次のレベルまでに要る経験値
export const xpToNext = (lv) => Math.floor(40 * lv ** 1.45);

// 装備の屈折銘とパッシブのスキルを足した能力。items は [{ affixes: [{ stat, v }] }]、bonus は { stat: 値 } の足し算
export function derive({ level = 1, items = [], bonus = {} } = {}) {
  const add = {};
  const put = (k, v) => { add[k] = (add[k] || 0) + v; };
  for (const it of items) for (const a of it.affixes || []) put(a.stat, a.v);
  for (const [k, v] of Object.entries(bonus)) put(k, v);
  const lv = level - 1, s = {};
  for (const k of Object.keys(BASE)) s[k] = BASE[k] + (PER_LEVEL[k] || 0) * lv + (add[k] || 0);
  const pct = (k) => 1 + (add[k + '_pct'] || 0) / 100;
  s.hp = Math.floor(s.hp * pct('hp'));
  s.mp = Math.floor(s.mp * pct('mp'));
  s.atk = Math.floor(s.atk * pct('atk'));
  s.resonance = Math.floor(s.resonance * pct('resonance'));
  s.def = Math.floor(s.def * pct('def'));
  s.move_spd = Math.min(CAPS.move_spd, +(s.move_spd * pct('move_spd')).toFixed(3));
  s.cdr = Math.min(CAPS.cdr, s.cdr);
  s.crit = Math.min(CAPS.crit, s.crit);
  // 相の威力（%）と、装備の特別な効果
  for (const e of ['tide', 'gale', 'mirage', 'thunder', 'starfrost']) s[e + '_pct'] = add[e + '_pct'] || 0;
  for (const k of ['proc_wave', 'proc_chain', 'hp_on_kill', 'proc_step_flare']) s[k] = add[k] || 0;
  return s;
}

// ダメージ = max(1, floor((斬撃力×物理の寄与 + 共鳴力×共鳴の寄与) × 倍率 × (1 + 相の威力%) × 100/(100 + 防御×2) × 閃光 × 乱数))
export function damage(att, tgt, { mult = 1, phys = 1, res = 0, elemPct = 0, crit = false, roll = 1 } = {}) {
  const raw = (att.atk * phys + att.resonance * res) * mult * (1 + elemPct / 100) * (100 / (100 + (tgt.def || 0) * 2)) * (crit ? 1.6 : 1) * roll;
  return Math.max(1, Math.floor(raw + 1e-9));
}
