//! Núcleo do Font Manager (sem dependência de Tauri, testável isoladamente).

pub mod archive;
pub mod cache;
pub mod css;
pub mod db;
pub mod dedup;
pub mod error;
pub mod http;
pub mod inventory;
pub mod model;
pub mod providers;
pub mod service;
pub mod validate;

pub use error::{Error, Result};
