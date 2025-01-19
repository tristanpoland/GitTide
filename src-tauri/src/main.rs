#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use encoding_rs::WINDOWS_1252;
use std::env;

// Store PTY state
struct PtyState {
    pty_pair: Mutex<Option<PtyPair>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
}

#[derive(Debug, Deserialize)]
pub struct ShellCommandArgs {
    command: String,
    args: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CommandOutput {
    text: String,
    is_error: bool,
}

#[tauri::command]
async fn create_pty(state: State<'_, PtyState>, window: tauri::Window) -> Result<(), String> {
    let pty_system = native_pty_system();
    
    let shell = if cfg!(target_os = "windows") {
        "cmd.exe"
    } else {
        &std::env::var("SHELL").unwrap_or_else(|_| String::from("/bin/sh"))
    };

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(shell);
    
    // Configure proper terminal modes
    if cfg!(target_os = "windows") {
        cmd.env("TERM", "cygwin");
    } else {
        cmd.env("TERM", "xterm");
    }

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Read output in a separate task
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    // Store the writer
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    *state.writer.lock().unwrap() = Some(writer);

    // Store the PTY pair
    *state.pty_pair.lock().unwrap() = Some(pair);
    let window_clone = window.clone();
    
    tauri::async_runtime::spawn(async move {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = window_clone.emit("pty-output", text);
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn write_to_pty(input: String, state: State<PtyState>) -> Result<(), String> {
    if let Some(writer) = &mut *state.writer.lock().unwrap() {
        if input == "\r" {
            // For Enter key, send both \r\n
            writer.write_all(b"\r\n").map_err(|e| e.to_string())?;
        } else {
            // For all other input, just write directly
            writer.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        }
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(rows: u16, cols: u16, state: State<PtyState>) -> Result<(), String> {
    if let Some(pair) = &*state.pty_pair.lock().unwrap() {
        pair.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn on_button_clicked() -> String {
    let start = SystemTime::now();
    let since_the_epoch = start
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis();
    format!("on_button_clicked called from Rust! (timestamp: {since_the_epoch}ms)")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    tauri::Builder::default()
        .manage(PtyState {
            pty_pair: Mutex::new(None),
            writer: Mutex::new(None),
        })
        .setup(|app| {
            let window = app.get_window("main").unwrap();
            window.set_decorations(false).unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_pty,
            write_to_pty,
            resize_pty,
            on_button_clicked
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}