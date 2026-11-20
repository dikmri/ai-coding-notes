// タスク帳（Tauri 版）の Rust 側。窓を開き、画面（ui/）から届く記録をファイルへ書く。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Instant;

use taskcore::{WINDOW_SIZE, args, log};
use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

struct Started(Instant);

/// 画面で起きたことを記録する
#[tauri::command]
fn log_event(event: String, args: String, result: String) {
    log::event(&event, &args, &result);
}

/// 画面の 1 枚目が出たあとに呼ばれる
#[tauri::command]
fn ready(started: tauri::State<'_, Started>, items: usize) {
    log::event(
        "ready",
        &format!("renderer=webview2 items={items}"),
        &format!("since_main_ms={}", started.0.elapsed().as_millis()),
    );
}

fn main() {
    let started = Instant::now();
    let a = args::from_env();
    let path = log::init("tauri", a.log_path.as_deref());
    log::event(
        "startup",
        &format!("items={} bench={:?} software={}", a.items, a.bench_scroll, a.software),
        &format!("log={path:?}"),
    );

    // 起動引数を画面へ渡す（IPC を 1 往復減らすため、読み込み前に差し込む）
    let init = format!(
        "window.__TASKBOOK_ARGS__ = {{ items: {}, benchScroll: {} }};",
        a.items,
        a.bench_scroll.map(|s| s.to_string()).unwrap_or_else(|| "null".into())
    );
    let software = a.software;
    let pos = a.pos;
    let focus = !a.no_focus;

    let app = tauri::Builder::default()
        .manage(Started(started))
        .invoke_handler(tauri::generate_handler![log_event, ready])
        .setup(move |app| {
            let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("タスク帳（Tauri）")
                .inner_size(WINDOW_SIZE.0 as f64, WINDOW_SIZE.1 as f64)
                .initialization_script(&init)
                .focused(focus);
            if let Some((x, y)) = pos {
                b = b.position(x as f64, y as f64);
            }
            // 測定では WebView2 の保存先を毎回同じ場所にそろえる
            if let Ok(dir) = std::env::var("TASKBOOK_WEBVIEW_DATA") {
                b = b.data_directory(dir.into());
            }
            if software {
                // Tauri の既定の引数に、GPU を使わない指定を足す
                b = b.additional_browser_args(
                    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-gpu",
                );
            }
            b.build()?;
            log::event("window", "label=main", "built");
            Ok(())
        })
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|_, event| {
            if let RunEvent::Exit = event {
                log::event("exit", "", "ok");
            }
        }),
        Err(e) => log::event("error", "build", &e.to_string()),
    }
}
