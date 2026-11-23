// 画面の設定。1 人用なのでサーバーの住所は無い（世界の計算はこのページの Web Worker で動く）。
// ?debug=1 は確かめ用の表示・命令の窓（F2）・window.__kanenaki を出す。
const params = new URLSearchParams(location.search);

export const DEBUG = params.get('debug') === '1';
export const SETTINGS_KEY = 'kanenaki:settings';
