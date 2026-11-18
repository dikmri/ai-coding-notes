// 上から見る版のゲームの入口。データを読み、レースの計算・キーボード・絵・表示をつなぐ。
//
// 画面の流れ: タイトル → 3・2・1 の合図 → 走る（Esc で一時停止）
// ほかの部品が様子を知れるように、出来事は window に 'yugure' という名前のイベントで知らせ、
// 今の様子は window.yugure.state() で読めるようにする（自動の確かめと、記録に使う）。

import { startLoop } from './core/loop.js';
import { wrapAngle } from './core/math.js';
import { buildCourse } from './sim/course.js';
import { createRace, resetCar, startRace, stepRace } from './sim/race.js';
import { autopilotInput } from './sim/autopilot.js';
import { speedKmh } from './sim/car-physics.js';
import { createKeyboard } from './input/keyboard.js';
import { createTopView } from './view2d/top-view.js';
import { createHud, formatLapTime } from './ui/hud.js';

const STEP_SECONDS = 1 / 120; // 計算の刻み
const COUNTDOWN_SECONDS = 3;

const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} を読めませんでした（${response.status}）`);
  return response.json();
};

// 出来事を知らせる
const announce = (type, detail = {}) => window.dispatchEvent(new CustomEvent('yugure', { detail: { type, ...detail } }));

async function main() {
  const [courseData, carData] = await Promise.all([
    loadJson('data/courses/yugure-touge.json'),
    loadJson('data/cars/gen-hatch.json'),
  ]);
  const course = buildCourse(courseData);
  const race = createRace(course, carData.physics);
  const keyboard = createKeyboard();
  const view = createTopView(document.getElementById('stage'), course);
  const hud = createHud(document.getElementById('hud'));
  const titleDialog = document.getElementById('title-dialog');
  const pauseDialog = document.getElementById('pause-dialog');
  document.querySelector('[data-course="length"]').textContent = Math.round(course.length).toLocaleString('ja-JP');

  let phase = 'title'; // 'title' → 'countdown' → 'racing'
  let countdown = 0;
  let paused = false;
  let autopilot = false;
  let previousPose = poseOf(race); // 描くときに、前の刻みと今の刻みの間を混ぜるため

  /* ---------- 画面の流れ ---------- */

  titleDialog.addEventListener('close', () => {
    titleDialog.returnValue = '';
    beginCountdown();
  });
  pauseDialog.addEventListener('close', () => {
    const choice = pauseDialog.returnValue;
    pauseDialog.returnValue = '';
    paused = false;
    keyboard.clear();
    if (choice === 'restart') restart();
    announce('resume', { choice: choice || 'escape' });
  });

  function beginCountdown() {
    phase = 'countdown';
    countdown = COUNTDOWN_SECONDS;
    hud.showMessage(String(COUNTDOWN_SECONDS), 0);
    announce('countdown');
  }

  function restart() {
    const fresh = createRace(course, carData.physics);
    Object.assign(race, fresh);
    previousPose = poseOf(race);
    beginCountdown();
  }

  function pause() {
    if (paused || phase === 'title') return;
    paused = true;
    pauseDialog.showModal();
    announce('pause');
  }

  /* ---------- 1 刻みの計算 ---------- */

  function update(dt) {
    for (const code of keyboard.takePresses()) handlePress(code);
    if (paused || phase === 'title') return;

    if (phase === 'countdown') {
      const before = Math.ceil(countdown);
      countdown -= dt;
      const after = Math.ceil(countdown);
      if (after !== before) hud.showMessage(after > 0 ? String(after) : 'スタート！', after > 0 ? 0 : 1.2);
      if (countdown <= 0) {
        phase = 'racing';
        startRace(race);
      }
    }

    const input = autopilot ? autopilotInput(race) : keyboard.driveInput(dt);
    previousPose = poseOf(race);
    stepRace(race, input, dt);
    for (const event of race.events.splice(0)) handleRaceEvent(event);
    hud.tick(dt);
  }

  function handlePress(code) {
    if (code === 'Escape') return pause();
    if (paused) return;
    if (code === 'KeyR' && phase === 'racing') { resetCar(race); previousPose = poseOf(race); }
    if (code === 'KeyC') announce('camera', { mode: view.toggleMode() });
    if (code === 'KeyF') {
      autopilot = !autopilot;
      hud.showMessage(autopilot ? '自動運転 入' : '自動運転 切', 1.2);
      announce('autopilot', { on: autopilot });
    }
  }

  function handleRaceEvent(event) {
    if (event.type === 'lap') {
      const best = event.best === event.lapTime ? '（最速）' : '';
      hud.showMessage(`${event.lap} 周目 ${formatLapTime(event.lapTime)}${best}`, 2.5);
    }
    if (event.type === 'reset') hud.showMessage('道へ戻りました', 1);
    announce(event.type, { ...event, speedKmh: Math.round(speedKmh(race.car)), s: Math.round(race.location.s) });
  }

  /* ---------- 描く ---------- */

  function render(alpha) {
    const now = poseOf(race);
    view.draw({
      x: previousPose.x + (now.x - previousPose.x) * alpha,
      z: previousPose.z + (now.z - previousPose.z) * alpha,
      heading: previousPose.heading + wrapAngle(now.heading - previousPose.heading) * alpha,
      steerAngle: now.steerAngle,
      speed: now.speed,
      braking: now.braking,
    });
    hud.update(race, carData.physics.engine.redlineRpm);
  }

  /* ---------- 外から様子を読む窓口 ---------- */

  window.yugure = {
    state: () => ({
      phase, paused, autopilot,
      time: race.time,
      lap: race.lapCounter.lap,
      bestLapTime: race.lapCounter.bestLapTime,
      speedKmh: speedKmh(race.car),
      gear: race.car.gear,
      rpm: Math.round(race.car.engineRpm),
      s: race.location.s,
      lateral: race.location.lateral,
      surface: race.surface,
      barrierHits: race.barrierHits,
      cameraMode: view.mode,
    }),
  };

  startLoop({ stepSeconds: STEP_SECONDS, update, render });
  titleDialog.showModal();
  announce('ready', { courseLength: Math.round(course.length) });
}

// 描くのに要る車の様子
function poseOf(race) {
  const car = race.car;
  return { x: car.x, z: car.z, heading: car.heading, steerAngle: car.steerAngle, speed: car.forwardSpeed, braking: car.brake > 0.05 };
}

main().catch((error) => {
  const box = document.getElementById('load-error');
  box.textContent = `始められませんでした: ${error.message}`;
  box.hidden = false;
  throw error;
});
