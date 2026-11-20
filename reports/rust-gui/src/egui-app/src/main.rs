// タスク帳（egui 版）。データと絞り込みは taskcore、画面は egui の即時モードで描く。
#![windows_subsystem = "windows"]

use std::time::Instant;

use eframe::egui;
use taskcore::bench::{ScrollBench, Step};
use taskcore::{Counts, ROW_HEIGHT, Status, Store, WINDOW_SIZE, args, group, log};

#[cfg(feature = "wgpu")]
const RENDERER: &str = "wgpu";
#[cfg(not(feature = "wgpu"))]
const RENDERER: &str = "glow";

/// 一覧の 1 行で押されたもの。描き終えてからまとめて反映する。
enum RowAction {
    Toggle(u32),
    Remove(u32),
}

struct TaskApp {
    store: Store,
    input: String,
    query: String,
    status: Status,
    dark: bool,
    /// 絞り込みの結果（store.tasks() の添字）
    visible: Vec<usize>,
    counts: Counts,
    message: String,
    main_started: Instant,
    frame: u64,
    ready_at: Option<f64>,
    bench: Option<ScrollBench>,
}

impl TaskApp {
    fn new(cc: &eframe::CreationContext<'_>, a: &args::Args, main_started: Instant) -> Self {
        cc.egui_ctx.set_theme(egui::Theme::Light);
        let mut store = Store::new();
        if a.items > 0 {
            let t = Instant::now();
            store.generate(a.items);
            log::event("generate", &format!("n={}", a.items), &ms_since(t));
        }
        let mut app = Self {
            store,
            input: String::new(),
            query: String::new(),
            status: Status::All,
            dark: false,
            visible: Vec::new(),
            counts: Counts::default(),
            message: "準備できました".into(),
            main_started,
            frame: 0,
            ready_at: None,
            bench: a.bench_scroll.map(ScrollBench::new),
        };
        app.refilter("startup");
        app
    }

    /// 絞り込みを計算し直す。語・状態・データが変わったときだけ呼ぶ。
    fn refilter(&mut self, why: &str) {
        let t = Instant::now();
        self.visible = self.store.filter(&self.query, self.status);
        self.counts = self.store.counts();
        log::event(
            "filter",
            &format!("why={why} q={} status={}", self.query, self.status.key()),
            &format!("hits={} {}", self.visible.len(), ms_since(t)),
        );
    }

    fn add_task(&mut self) {
        match self.store.add(&self.input) {
            Some(id) => {
                log::event("add", &format!("text={}", self.input.trim()), &format!("id={id}"));
                self.message = format!("「{}」を足しました", self.input.trim());
                self.input.clear();
                self.refilter("add");
            }
            None => log::event("add", "text=", "skipped=empty"),
        }
    }

    fn header(&mut self, ui: &mut egui::Ui) {
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            ui.heading("タスク帳");
            ui.label(egui::RichText::new(format!("egui 0.37 ・ {RENDERER}")).weak());
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if ui.checkbox(&mut self.dark, "ダーク").changed() {
                    let theme = if self.dark { egui::Theme::Dark } else { egui::Theme::Light };
                    ui.ctx().set_theme(theme);
                    log::event("theme", &format!("dark={}", self.dark), "ok");
                }
            });
        });
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            let edit = egui::TextEdit::singleline(&mut self.input)
                .hint_text("新しいタスクを入力して Enter")
                .desired_width(ui.available_width() - 70.0);
            let r = ui.add(edit);
            let enter = r.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
            if enter {
                self.add_task();
                r.request_focus();
            }
            if ui.button("追加").clicked() {
                self.add_task();
            }
        });
        ui.horizontal(|ui| {
            let r = ui.add(
                egui::TextEdit::singleline(&mut self.query)
                    .hint_text("絞り込み（例: 資料）")
                    .desired_width(240.0),
            );
            if r.changed() {
                self.refilter("query");
            }
            for s in Status::LIST {
                if ui.selectable_value(&mut self.status, s, s.label()).clicked() {
                    self.refilter("status");
                }
            }
            ui.label(format!(
                "{} 件中 {} 件を表示",
                group(self.counts.total),
                group(self.visible.len())
            ));
        });
        ui.add_space(6.0);
    }

    fn footer(&mut self, ui: &mut egui::Ui) {
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if ui.button("1万件を作る").clicked() {
                let t = Instant::now();
                self.store.generate(10_000);
                log::event("generate", "n=10000", &ms_since(t));
                self.message = "1万件を作りました".into();
                self.refilter("generate");
            }
            if ui.button("完了を消す").clicked() {
                let n = self.store.clear_done();
                log::event("clear_done", "", &format!("removed={n}"));
                self.message = format!("完了 {} 件を消しました", group(n));
                self.refilter("clear_done");
            }
            if ui.button("すべて消す").clicked() {
                let n = self.store.clear();
                log::event("clear", "", &format!("removed={n}"));
                self.message = format!("{} 件を消しました", group(n));
                self.refilter("clear");
            }
            ui.separator();
            ui.label(format!(
                "未完了 {} ・ 完了 {}",
                group(self.counts.active),
                group(self.counts.done)
            ));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(egui::RichText::new(&self.message).weak());
            });
        });
        ui.add_space(6.0);
    }

    fn list(&mut self, ui: &mut egui::Ui, scroll_to: Option<f32>) {
        let mut actions = Vec::new();
        let mut area = egui::ScrollArea::vertical().id_salt("list").auto_shrink([false, false]);
        if let Some(y) = scroll_to {
            area = area.vertical_scroll_offset(y);
        }
        let store = &self.store;
        let visible = &self.visible;
        area.show_rows(ui, ROW_HEIGHT, visible.len(), |ui, range| {
            ui.spacing_mut().item_spacing.y = 0.0;
            for &ix in &visible[range] {
                let task = &store.tasks()[ix];
                ui.horizontal(|ui| {
                    ui.set_height(ROW_HEIGHT);
                    let mut done = task.done;
                    if ui.checkbox(&mut done, "").changed() {
                        actions.push(RowAction::Toggle(task.id));
                    }
                    let mut text = egui::RichText::new(&task.text);
                    if task.done {
                        text = text.strikethrough().weak();
                    }
                    ui.label(text);
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.add_space(8.0);
                        if ui.small_button("削除").clicked() {
                            actions.push(RowAction::Remove(task.id));
                        }
                    });
                });
            }
        });
        for a in actions {
            match a {
                RowAction::Toggle(id) => {
                    let r = self.store.toggle(id);
                    log::event("toggle", &format!("id={id}"), &format!("done={r:?}"));
                    self.refilter("toggle");
                }
                RowAction::Remove(id) => {
                    let r = self.store.remove(id);
                    log::event("remove", &format!("id={id}"), &format!("removed={r}"));
                    self.refilter("remove");
                }
            }
        }
    }

    /// 起動の記録と、測定用の自動スクロール。描く前に呼び、スクロール先を返す。
    fn tick(&mut self, ctx: &egui::Context) -> Option<f32> {
        self.frame += 1;
        let now = ctx.input(|i| i.time);
        // 2 枚目を描き始めた時点 = 1 枚目が画面に出たあと、を「表示できた」とする
        if self.frame == 1 {
            ctx.request_repaint();
        } else if self.ready_at.is_none() {
            self.ready_at = Some(now);
            log::event(
                "ready",
                &format!("renderer={RENDERER} items={}", self.counts.total),
                &format!("since_main_ms={}", self.main_started.elapsed().as_millis()),
            );
        }
        let ready = self.ready_at?;
        let bench = self.bench.as_mut()?;
        match bench.tick((now - ready) as f32) {
            Step::Wait => {
                ctx.request_repaint();
                None
            }
            Step::Scroll { offset, first } => {
                if first {
                    log::event("bench.scroll.start", "", "ok");
                }
                ctx.request_repaint();
                Some(offset)
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
                None
            }
            Step::Idle => None,
        }
    }
}

impl eframe::App for TaskApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let scroll_to = self.tick(ui.ctx());
        egui::Panel::top("head").show(ui, |ui| self.header(ui));
        egui::Panel::bottom("foot").show(ui, |ui| self.footer(ui));
        egui::CentralPanel::default().show(ui, |ui| self.list(ui, scroll_to));
    }

    // glow で描くときだけ、eframe の on_exit は OpenGL の文脈を受け取る形になる
    #[cfg(feature = "glow")]
    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        log::event("exit", "", &format!("frames={}", self.frame));
    }

    #[cfg(not(feature = "glow"))]
    fn on_exit(&mut self) {
        log::event("exit", "", &format!("frames={}", self.frame));
    }
}

fn ms_since(t: Instant) -> String {
    format!("ms={:.2}", t.elapsed().as_secs_f64() * 1000.0)
}

fn main() {
    let main_started = Instant::now();
    let a = args::from_env();
    let path = log::init("egui", a.log_path.as_deref());
    log::event(
        "startup",
        &format!("items={} bench={:?} software={} renderer={RENDERER}", a.items, a.bench_scroll, a.software),
        &format!("log={path:?}"),
    );

    let mut options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("タスク帳（egui）")
            .with_inner_size([WINDOW_SIZE.0, WINDOW_SIZE.1]),
        ..Default::default()
    };
    if let Some((x, y)) = a.pos {
        options.viewport = options.viewport.with_position([x, y]);
    }
    if a.no_focus {
        options.viewport = options.viewport.with_active(false);
    }

    #[cfg(feature = "wgpu")]
    if a.software {
        use eframe::egui_wgpu::WgpuSetup;
        use eframe::wgpu;
        // CPU で描くアダプター（Windows では WARP）を選ぶ
        if let WgpuSetup::CreateNew(setup) = &mut options.wgpu_options.wgpu_setup {
            setup.native_adapter_selector = Some(std::sync::Arc::new(|adapters, _surface| {
                let names: Vec<String> = adapters.iter().map(|a| format!("{:?}", a.get_info())).collect();
                log::event("adapters", "", &names.join(" | "));
                adapters
                    .iter()
                    .find(|a| a.get_info().device_type == wgpu::DeviceType::Cpu)
                    .cloned()
                    .ok_or_else(|| "CPU で描くアダプターが見つからない".to_string())
            }));
        }
    }
    #[cfg(not(feature = "wgpu"))]
    if a.software {
        log::event("software", "", "unsupported=glow");
    }

    let result = eframe::run_native(
        "taskbook-egui",
        options,
        Box::new(move |cc| Ok(Box::new(TaskApp::new(cc, &a, main_started)))),
    );
    if let Err(e) = result {
        log::event("error", "run_native", &e.to_string());
    }
}
