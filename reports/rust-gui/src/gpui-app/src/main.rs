// タスク帳（GPUI 版）。データと絞り込みは taskcore、画面は GPUI と GPUI Kit の部品で描く。
#![windows_subsystem = "windows"]

use std::time::Instant;

use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::checkbox::Checkbox;
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::{ActiveTheme as _, Sizable as _, Theme, ThemeMode, h_flex, v_flex};
use gpui_kit::*;
use gpui_kit::base::Selectable as _;
use taskcore::bench::{ScrollBench, Step};
use taskcore::{Counts, ROW_HEIGHT, Status, Store, WINDOW_SIZE, args, group, log};

struct TaskView {
    store: Store,
    status: Status,
    dark: bool,
    visible: Vec<usize>,
    counts: Counts,
    message: SharedString,
    input: Entity<InputState>,
    query: Entity<InputState>,
    scroll: UniformListScrollHandle,
    main_started: Instant,
    ready_at: Option<Instant>,
    renders: u64,
    bench: Option<ScrollBench>,
    _subscriptions: Vec<Subscription>,
}

impl TaskView {
    fn new(window: &mut Window, cx: &mut Context<Self>, a: &args::Args, main_started: Instant) -> Self {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("新しいタスクを入力して Enter"));
        let query = cx.new(|cx| InputState::new(window, cx).placeholder("絞り込み（例: 資料）"));
        let subscriptions = vec![
            cx.subscribe_in(&input, window, |this, _, ev: &InputEvent, window, cx| {
                if let InputEvent::PressEnter { .. } = ev {
                    this.add_task(window, cx);
                }
            }),
            cx.subscribe_in(&query, window, |this, _, ev: &InputEvent, _, cx| {
                if let InputEvent::Change = ev {
                    this.refilter("query", cx);
                }
            }),
        ];

        let mut store = Store::new();
        if a.items > 0 {
            let t = Instant::now();
            store.generate(a.items);
            log::event("generate", &format!("n={}", a.items), &ms_since(t));
        }

        // 1 枚目を描いた直後に呼ばれる = 表示できた時点
        window.on_next_frame({
            let view = cx.entity().downgrade();
            move |_, cx| {
                let _ = view.update(cx, |this, cx| {
                    this.ready_at = Some(Instant::now());
                    log::event(
                        "ready",
                        &format!("renderer=directx11 items={}", this.counts.total),
                        &format!("since_main_ms={}", this.main_started.elapsed().as_millis()),
                    );
                    cx.notify();
                });
            }
        });

        let mut this = Self {
            store,
            status: Status::All,
            dark: false,
            visible: Vec::new(),
            counts: Counts::default(),
            message: "準備できました".into(),
            input,
            query,
            scroll: UniformListScrollHandle::new(),
            main_started,
            ready_at: None,
            renders: 0,
            bench: a.bench_scroll.map(ScrollBench::new),
            _subscriptions: subscriptions,
        };
        this.refilter("startup", cx);
        this
    }

    fn refilter(&mut self, why: &str, cx: &mut Context<Self>) {
        let t = Instant::now();
        let q = self.query.read(cx).value().to_string();
        self.visible = self.store.filter(&q, self.status);
        self.counts = self.store.counts();
        log::event(
            "filter",
            &format!("why={why} q={q} status={}", self.status.key()),
            &format!("hits={} {}", self.visible.len(), ms_since(t)),
        );
        cx.notify();
    }

    fn add_task(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let text = self.input.read(cx).value().to_string();
        match self.store.add(&text) {
            Some(id) => {
                log::event("add", &format!("text={}", text.trim()), &format!("id={id}"));
                self.message = format!("「{}」を足しました", text.trim()).into();
                self.input.update(cx, |s, cx| s.set_value("", window, cx));
                self.refilter("add", cx);
            }
            None => log::event("add", "text=", "skipped=empty"),
        }
    }

    fn set_dark(&mut self, dark: bool, window: &mut Window, cx: &mut Context<Self>) {
        self.dark = dark;
        let mode = if dark { ThemeMode::Dark } else { ThemeMode::Light };
        Theme::change(mode, Some(window), cx);
        log::event("theme", &format!("dark={dark}"), "ok");
        cx.notify();
    }

    /// 測定用の自動スクロール。描くたびに呼ぶ。
    fn bench_tick(&mut self, window: &mut Window) {
        let Some(ready) = self.ready_at else { return };
        let Some(bench) = self.bench.as_mut() else { return };
        match bench.tick(ready.elapsed().as_secs_f32()) {
            Step::Wait => window.request_animation_frame(),
            Step::Scroll { offset, first } => {
                if first {
                    log::event("bench.scroll.start", "", "ok");
                }
                let max = (self.visible.len() as f32 * ROW_HEIGHT).max(0.0);
                let y = offset.min(max);
                self.scroll.0.borrow().base_handle.set_offset(point(px(0.), px(-y)));
                window.request_animation_frame();
            }
            Step::Finished { frames, secs, max_gap_ms } => {
                log::event(
                    "bench.scroll.done",
                    &format!("secs={secs:.3}"),
                    &format!(
                        "frames={frames} fps={:.1} max_gap_ms={max_gap_ms:.1}",
                        frames as f32 / secs
                    ),
                );
            }
            Step::Idle => {}
        }
    }

    fn render_row(&self, ix: usize, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let task = &self.store.tasks()[ix];
        let id = task.id;
        let theme = cx.theme();
        let text = div().flex_1().truncate().child(task.text.clone());
        let text = if task.done {
            text.line_through().text_color(theme.muted_foreground)
        } else {
            text
        };
        h_flex()
            .id(("row", id as usize))
            .w_full()
            .h(px(ROW_HEIGHT))
            .px_3()
            .gap_3()
            .items_center()
            .border_b_1()
            .border_color(theme.border)
            .child(Checkbox::new(("done", id as usize)).checked(task.done).on_click(cx.listener(
                move |this, _: &bool, _, cx| {
                    let r = this.store.toggle(id);
                    log::event("toggle", &format!("id={id}"), &format!("done={r:?}"));
                    this.refilter("toggle", cx);
                },
            )))
            .child(text)
            .child(Button::new(("remove", id as usize)).ghost().xsmall().label("削除").on_click(
                cx.listener(move |this, _, _, cx| {
                    let r = this.store.remove(id);
                    log::event("remove", &format!("id={id}"), &format!("removed={r}"));
                    this.refilter("remove", cx);
                }),
            ))
    }
}

impl Render for TaskView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.renders += 1;
        self.bench_tick(window);
        let theme = cx.theme().clone();

        let mut tabs = h_flex().gap_1();
        for s in Status::LIST {
            tabs = tabs.child(
                Button::new(s.key()).small().label(s.label()).selected(self.status == s).on_click(
                    cx.listener(move |this, _, _, cx| {
                        this.status = s;
                        this.refilter("status", cx);
                    }),
                ),
            );
        }

        let header = v_flex()
            .gap_2()
            .p_3()
            .border_b_1()
            .border_color(theme.border)
            .child(
                h_flex()
                    .gap_3()
                    .items_center()
                    .child(div().text_xl().font_weight(FontWeight::BOLD).child("タスク帳"))
                    .child(div().text_color(theme.muted_foreground).child("GPUI Kit 0.10 ・ DirectX 11"))
                    .child(div().flex_1())
                    .child(
                        Checkbox::new("dark").label("ダーク").checked(self.dark).on_click(cx.listener(
                            |this, checked: &bool, window, cx| this.set_dark(*checked, window, cx),
                        )),
                    ),
            )
            .child(
                h_flex()
                    .gap_2()
                    .child(div().flex_1().child(Input::new(&self.input)))
                    .child(Button::new("add").primary().label("追加").on_click(cx.listener(
                        |this, _, window, cx| this.add_task(window, cx),
                    ))),
            )
            .child(
                h_flex()
                    .gap_3()
                    .items_center()
                    .child(div().w(px(240.)).child(Input::new(&self.query).small()))
                    .child(tabs)
                    .child(div().child(format!(
                        "{} 件中 {} 件を表示",
                        group(self.counts.total),
                        group(self.visible.len())
                    ))),
            );

        let list = uniform_list(
            "list",
            self.visible.len(),
            cx.processor(|this, range: std::ops::Range<usize>, _, cx| {
                range.map(|i| this.render_row(this.visible[i], cx)).collect::<Vec<_>>()
            }),
        )
        .track_scroll(&self.scroll)
        .flex_1();

        let footer = h_flex()
            .gap_2()
            .p_3()
            .items_center()
            .border_t_1()
            .border_color(theme.border)
            .child(Button::new("gen").small().label("1万件を作る").on_click(cx.listener(
                |this, _, _, cx| {
                    let t = Instant::now();
                    this.store.generate(10_000);
                    log::event("generate", "n=10000", &ms_since(t));
                    this.message = "1万件を作りました".into();
                    this.refilter("generate", cx);
                },
            )))
            .child(Button::new("clear_done").small().label("完了を消す").on_click(cx.listener(
                |this, _, _, cx| {
                    let n = this.store.clear_done();
                    log::event("clear_done", "", &format!("removed={n}"));
                    this.message = format!("完了 {} 件を消しました", group(n)).into();
                    this.refilter("clear_done", cx);
                },
            )))
            .child(Button::new("clear").small().label("すべて消す").on_click(cx.listener(
                |this, _, _, cx| {
                    let n = this.store.clear();
                    log::event("clear", "", &format!("removed={n}"));
                    this.message = format!("{} 件を消しました", group(n)).into();
                    this.refilter("clear", cx);
                },
            )))
            .child(div().child(format!(
                "未完了 {} ・ 完了 {}",
                group(self.counts.active),
                group(self.counts.done)
            )))
            .child(div().flex_1())
            .child(div().text_color(theme.muted_foreground).child(self.message.clone()));

        v_flex()
            .size_full()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(header)
            .child(list)
            .child(footer)
    }
}

/// GPUI の記録のうち、注意以上と「Using GPU」を記録ファイルへ書く
struct GpuiLog;

impl ::log::Log for GpuiLog {
    fn enabled(&self, m: &::log::Metadata) -> bool {
        m.level() <= ::log::Level::Info
    }
    fn log(&self, r: &::log::Record) {
        let msg = r.args().to_string();
        if r.level() <= ::log::Level::Warn || msg.starts_with("Using GPU") {
            log::event("gpui.log", &format!("level={} target={}", r.level(), r.target()), &msg);
        }
    }
    fn flush(&self) {}
}

fn ms_since(t: Instant) -> String {
    format!("ms={:.2}", t.elapsed().as_secs_f64() * 1000.0)
}

fn main() {
    let main_started = Instant::now();
    let a = args::from_env();
    let path = log::init("gpui", a.log_path.as_deref());
    log::event(
        "startup",
        &format!("items={} bench={:?} software={}", a.items, a.bench_scroll, a.software),
        &format!("log={path:?}"),
    );
    if a.software {
        // GPUI には GPU を使わない設定が無い。測定用に WARP を選べるようにした版（gpui-warp.diff）でだけ効く
        unsafe { std::env::set_var("TASKBOOK_GPUI_WARP", "1") };
        log::event("software", "", "TASKBOOK_GPUI_WARP=1");
    }
    // GPUI が出す記録（使った GPU の名前など）を、同じ記録ファイルへ流す
    let _ = ::log::set_logger(&GpuiLog).map(|()| ::log::set_max_level(::log::LevelFilter::Info));

    gpui_kit::application().with_assets(gpui_kit::assets::Assets).run(move |cx| {
        gpui_kit::init(cx);
        Theme::change(ThemeMode::Light, None, cx);
        let window_size = size(px(WINDOW_SIZE.0), px(WINDOW_SIZE.1));
        // GPUI は表示先のモニターを指定しないと主モニターを基準にし、
        // その外の位置は使わない。指定した位置を含むモニターを探して渡す
        let (bounds, display_id) = match a.pos {
            Some((x, y)) => {
                let origin = point(px(x), px(y));
                let display = cx.displays().into_iter().find(|d| d.bounds().contains(&origin));
                (Bounds::new(origin, window_size), display.map(|d| d.id()))
            }
            None => (Bounds::centered(None, window_size, cx), None),
        };
        let mut options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            display_id,
            focus: !a.no_focus,
            titlebar: Some(TitlebarOptions {
                title: Some("タスク帳（GPUI）".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        // GPUI は前面にない窓のフレームを既定で約 30fps に抑える。
        // 測定で他の版と同じ条件にするときだけ、--full-rate でこの制限を外す
        if std::env::args().any(|x| x == "--full-rate") {
            options.inactive_frame_interval = None;
            log::event("full_rate", "", "inactive_frame_interval=None");
        }
        let a = a.clone();
        let opened = gpui_kit::open_window(options, cx, move |window, cx| {
            cx.new(|cx| TaskView::new(window, cx, &a, main_started))
        });
        if let Err(e) = opened {
            log::event("error", "open_window", &e.to_string());
            cx.quit();
        }
        cx.on_app_quit(|_| {
            log::event("exit", "", "ok");
            async {}
        })
        .detach();
    });
}
