//! The macOS menu bar's keys (run everywhere: `mac_menu` itself builds only on macOS): every key
//! equivalent the menu model hands over names a key muda's accelerators take.

use std::str::FromStr;

use figcraft_engine::keymap::{self, Platform};
use figcraft_ui_egui::menu_model::native_key;

#[test]
fn every_native_key_names_a_key_code_muda_takes() {
    let mut n = 0;
    let specs = figcraft_engine::catalog::items().filter_map(|m| keymap::primary(m.id, Platform::Mac)).chain(["Cmd+Q", "Cmd+,"]);
    for spec in specs {
        if let Some(k) = native_key(spec) {
            assert!(keyboard_types::Code::from_str(k.code).is_ok(), "{spec}: {}", k.code);
            n += 1;
        }
    }
    assert!(n > 40, "{n} menu items have ⌘ keys");
}
