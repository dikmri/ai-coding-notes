// 人口の段階（マイルストーン）と、段階ごとに使えるようになる道具
export const MILESTONES = [
  { pop: 0, title: '開拓地', reward: 0, unlock: ['road:1', 'zone:1', 'zone:3', 'zone:5', 'power', 'svc:coal', 'svc:tower', 'svc:sewer', 'bulldoze', 'dezone', 'inspect'] },
  { pop: 240, title: '集落', reward: 1500, unlock: ['svc:wind', 'svc:fire', 'svc:police', 'svc:clinic', 'svc:park'] },
  { pop: 700, title: '小さな町', reward: 3000, unlock: ['road:2', 'svc:school', 'svc:pump', 'district', 'policies'] },
  { pop: 1600, title: '町', reward: 5000, unlock: ['zone:2', 'zone:4', 'svc:plaza', 'svc:high', 'svc:sewer2', 'loan:2'] },
  { pop: 3600, title: '市', reward: 8000, unlock: ['svc:solar', 'svc:hospital', 'svc:metro', 'zone:6'] },
  { pop: 7500, title: '大きな市', reward: 12000, unlock: ['road:3', 'svc:univ', 'svc:bigpark', 'loan:3'] },
  { pop: 15000, title: '都市', reward: 20000, unlock: ['svc:landmark'] },
  { pop: 30000, title: '大都市', reward: 30000, unlock: [] },
  { pop: 60000, title: '光の都', reward: 50000, unlock: [] },
];

// 人口のほかの目標（達成するとお金がもらえる）。check は月末の統計で調べる
export const GOALS = [
  { key: 'firstHome', name: 'はじめての住人', desc: '人口 50 人', reward: 300, check: (st) => st.residents >= 50 },
  { key: 'black12', name: '黒字の一年', desc: '12か月続けて黒字（人口 500 人以上）', reward: 2000, check: (st, sim) => sim.profitStreak >= 12 && st.residents >= 500 },
  { key: 'fullEmploy', name: 'みんなに仕事', desc: '人口 2,000 人以上で、仕事のない人が 5% 未満', reward: 3000, check: (st) => st.residents >= 2000 && st.unemployed / Math.max(1, st.workforce) < 0.05 },
  { key: 'cleanAir', name: '澄んだ空', desc: '人口 3,000 人以上で、住宅地の公害の平均が 8 未満', reward: 4000, check: (st) => st.residents >= 3000 && st.pol < 8 },
  { key: 'smooth', name: 'すいすい通り', desc: '人口 5,000 人以上で、交通の流れが 80% 以上', reward: 5000, check: (st, sim) => st.residents >= 5000 && sim.tr.flow >= 0.8 },
  { key: 'scholar', name: '学びの街', desc: '人口 5,000 人以上で、教育の平均が 0.7 以上', reward: 5000, check: (st) => st.residents >= 5000 && st.edu >= 0.7 },
  { key: 'metroCity', name: '地下鉄の街', desc: '1か月に地下鉄の利用が 300 回以上', reward: 4000, check: (st) => st.metroMonth >= 300 },
  { key: 'happy', name: '笑顔の都市', desc: '人口 10,000 人以上で、満足の平均が 75 以上', reward: 10000, check: (st) => st.residents >= 10000 && st.happiness >= 75 },
  { key: 'tourist', name: '観光の名所', desc: '観光客が月に 800 人以上', reward: 8000, check: (st) => st.tourists >= 800 },
  { key: 'light', name: '光の都', desc: '人口 60,000 人', reward: 0, check: (st) => st.residents >= 60000 },
];

export function milestoneIndex(pop) {
  let k = 0;
  for (let i = 0; i < MILESTONES.length; i++) if (pop >= MILESTONES[i].pop) k = i;
  return k;
}
// その道具の鍵が、どの段階で解放されるか（見つからなければ 0）
export function unlockStage(key) {
  for (let i = 0; i < MILESTONES.length; i++) if (MILESTONES[i].unlock.includes(key)) return i;
  return 0;
}
export function isUnlocked(state, key) {
  if (state.unlockAll) return true;
  return unlockStage(key) <= (state.milestone || 0);
}
