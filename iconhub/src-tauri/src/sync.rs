//! Conta e sincronização com o Supabase.
//!
//! Regra: cada pasta e cada ícone importado tem uma data de mudança; entre o
//! computador e a nuvem, fica a versão mais nova. Apagados viram "lápides" para
//! o apagamento também chegar aos outros computadores.
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::folders::{now_ms, Entry, Folder};
use crate::icons::CustomMeta;

pub const URL: &str = "https://olumeufwijnwormipvqf.supabase.co";
/// Chave pública (publishable): pode ir no app; o acesso é limitado pelas regras do banco.
pub const KEY: &str = "sb_publishable_VtKgWldVqWAlgX6iZCO11Q_cB-SjhP2";

static HTTP: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().unwrap()
});

type Result<T> = std::result::Result<T, String>;

// ---------- Sessão ----------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: String,
    /// Segundos desde 1970.
    pub expires_at: i64,
    pub user_id: String,
    pub email: String,
}

pub fn load_session(path: &Path) -> Option<Session> {
    std::fs::read(path).ok().and_then(|d| serde_json::from_slice(&d).ok())
}

pub fn save_session(path: &Path, session: Option<&Session>) -> Result<()> {
    match session {
        None => {
            let _ = std::fs::remove_file(path);
            Ok(())
        }
        Some(s) => {
            std::fs::write(path, serde_json::to_vec(s).unwrap()).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
            }
            Ok(())
        }
    }
}

fn net_error(e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "Sem conexão com a internet. A sincronização tenta de novo sozinha.".into()
    } else {
        format!("Erro de rede: {e}")
    }
}

/// Traduz as mensagens de erro do Supabase.
fn auth_error(status: u16, body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    let msg = v["msg"]
        .as_str()
        .or(v["error_description"].as_str())
        .or(v["message"].as_str())
        .unwrap_or(body)
        .to_string();
    let code = v["error_code"].as_str().or(v["code"].as_str()).unwrap_or("");
    let lower = msg.to_lowercase();
    if code == "invalid_credentials" || lower.contains("invalid login credentials") {
        "E-mail ou senha incorretos.".into()
    } else if code == "user_already_exists" || lower.contains("already registered") {
        "Já existe uma conta com esse e-mail. Use “Entrar”.".into()
    } else if code == "weak_password" || lower.contains("password should be") {
        "A senha precisa ter pelo menos 6 caracteres.".into()
    } else if code == "email_address_invalid" || lower.contains("invalid format") || lower.contains("is invalid") {
        "Esse e-mail não parece válido.".into()
    } else if code == "signup_disabled" || lower.contains("signups not allowed") {
        "Novos cadastros estão fechados. Peça para quem administra criar sua conta.".into()
    } else if code == "email_not_confirmed" {
        "Esse e-mail ainda não foi confirmado.".into()
    } else if code == "same_password" {
        "A senha nova precisa ser diferente da atual.".into()
    } else if status == 429 {
        "Muitas tentativas. Espere um minuto e tente de novo.".into()
    } else {
        msg
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    user: Option<User>,
}

#[derive(Deserialize)]
struct User {
    id: String,
    email: Option<String>,
}

async fn token(url: String, body: serde_json::Value) -> Result<Session> {
    let res = HTTP.post(url).header("apikey", KEY).json(&body).send().await.map_err(net_error)?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(net_error)?;
    if !(200..300).contains(&status) {
        return Err(auth_error(status, &text));
    }
    let t: TokenResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let (Some(access_token), Some(refresh_token), Some(user)) = (t.access_token, t.refresh_token, t.user) else {
        return Err("Conta criada, mas o Supabase pediu confirmação de e-mail. Desligue “Confirm email” no painel.".into());
    };
    Ok(Session {
        access_token,
        refresh_token,
        expires_at: now_ms() / 1000 + t.expires_in.unwrap_or(3600),
        user_id: user.id,
        email: user.email.unwrap_or_default(),
    })
}

pub async fn sign_in(email: &str, password: &str) -> Result<Session> {
    token(format!("{URL}/auth/v1/token?grant_type=password"), json!({ "email": email.trim(), "password": password })).await
}

pub async fn sign_up(email: &str, password: &str) -> Result<Session> {
    token(format!("{URL}/auth/v1/signup"), json!({ "email": email.trim(), "password": password })).await
}

pub async fn refresh(session: &Session) -> Result<Session> {
    token(format!("{URL}/auth/v1/token?grant_type=refresh_token"), json!({ "refresh_token": session.refresh_token }))
        .await
        .map_err(|e| if e.starts_with("Sem conexão") { e } else { "Sua sessão expirou. Entre de novo.".into() })
}

pub fn needs_refresh(session: &Session) -> bool {
    session.expires_at - 120 < now_ms() / 1000
}

pub async fn change_password(session: &Session, password: &str) -> Result<()> {
    let res = HTTP
        .put(format!("{URL}/auth/v1/user"))
        .header("apikey", KEY)
        .bearer_auth(&session.access_token)
        .json(&json!({ "password": password }))
        .send()
        .await
        .map_err(net_error)?;
    let status = res.status().as_u16();
    if (200..300).contains(&status) {
        Ok(())
    } else {
        Err(auth_error(status, &res.text().await.unwrap_or_default()))
    }
}

// ---------- Datas ----------

fn to_iso(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms).unwrap_or_default().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn from_iso(s: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(s).map(|d| d.timestamp_millis()).unwrap_or(0)
}

// ---------- Banco ----------

async fn get<T: for<'de> Deserialize<'de>>(session: &Session, path: &str) -> Result<T> {
    let res = HTTP
        .get(format!("{URL}/rest/v1/{path}"))
        .header("apikey", KEY)
        .bearer_auth(&session.access_token)
        .send()
        .await
        .map_err(net_error)?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(net_error)?;
    if status == 401 {
        return Err("Sua sessão expirou. Entre de novo.".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!("A nuvem recusou a leitura ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn upsert(session: &Session, table: &str, conflict: &str, rows: serde_json::Value) -> Result<()> {
    let res = HTTP
        .post(format!("{URL}/rest/v1/{table}?on_conflict={conflict}"))
        .header("apikey", KEY)
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .bearer_auth(&session.access_token)
        .json(&rows)
        .send()
        .await
        .map_err(net_error)?;
    let status = res.status().as_u16();
    if (200..300).contains(&status) {
        Ok(())
    } else {
        Err(format!("A nuvem recusou o envio ({status}): {}", res.text().await.unwrap_or_default()))
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RemoteFolder {
    pub id: String,
    pub name: String,
    pub items: Vec<Entry>,
    pub deleted: bool,
    pub updated_at: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RemoteIcon {
    pub name: String,
    pub svg: String,
    pub deleted: bool,
    pub updated_at: String,
}

// ---------- Comparação (sem rede, testável) ----------

/// Devolve (enviar para a nuvem, aplicar no computador).
pub fn plan_folders(local: &[Folder], remote: Vec<RemoteFolder>) -> (Vec<Folder>, Vec<Folder>) {
    let remote: HashMap<String, Folder> = remote
        .into_iter()
        .map(|r| {
            let f = Folder { updated_at: from_iso(&r.updated_at), id: r.id, name: r.name, items: r.items, deleted: r.deleted };
            (f.id.clone(), f)
        })
        .collect();
    let mut push = Vec::new();
    let mut apply = Vec::new();
    for l in local {
        match remote.get(&l.id) {
            None => push.push(l.clone()),
            Some(r) if l.updated_at > r.updated_at => push.push(l.clone()),
            Some(r) if r.updated_at > l.updated_at => apply.push(r.clone()),
            _ => {}
        }
    }
    let local_ids: HashSet<&str> = local.iter().map(|f| f.id.as_str()).collect();
    for (id, r) in remote {
        if !local_ids.contains(id.as_str()) {
            apply.push(r);
        }
    }
    (push, apply)
}

#[derive(Clone, Debug, PartialEq)]
pub struct LocalIcon {
    pub name: String,
    /// None = apagado.
    pub svg: Option<String>,
    pub updated_at: i64,
}

pub fn local_icons(dir: &Path) -> Vec<LocalIcon> {
    let meta = CustomMeta::load(dir);
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let path = e.path();
            if !path.extension().is_some_and(|x| x == "svg") {
                continue;
            }
            let Some(name) = path.file_stem().and_then(|s| s.to_str()).map(String::from) else { continue };
            let Ok(svg) = std::fs::read_to_string(&path) else { continue };
            let mtime = e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let updated_at = meta.updated.get(&name).copied().unwrap_or(mtime);
            out.push(LocalIcon { name, svg: Some(svg), updated_at });
        }
    }
    for (name, at) in &meta.deleted {
        if !out.iter().any(|i| &i.name == name) {
            out.push(LocalIcon { name: name.clone(), svg: None, updated_at: *at });
        }
    }
    out
}

pub fn plan_icons(local: &[LocalIcon], remote: Vec<RemoteIcon>) -> (Vec<LocalIcon>, Vec<LocalIcon>) {
    let remote: HashMap<String, LocalIcon> = remote
        .into_iter()
        .map(|r| {
            let icon = LocalIcon {
                updated_at: from_iso(&r.updated_at),
                svg: if r.deleted { None } else { Some(r.svg) },
                name: r.name,
            };
            (icon.name.clone(), icon)
        })
        .collect();
    let mut push = Vec::new();
    let mut apply = Vec::new();
    for l in local {
        match remote.get(&l.name) {
            None => push.push(l.clone()),
            Some(r) if l.updated_at > r.updated_at => push.push(l.clone()),
            Some(r) if r.updated_at > l.updated_at => apply.push(r.clone()),
            _ => {}
        }
    }
    let names: HashSet<&str> = local.iter().map(|i| i.name.as_str()).collect();
    for (name, r) in remote {
        if !names.contains(name.as_str()) {
            apply.push(r);
        }
    }
    (push, apply)
}

/// Grava no computador os ícones que vieram da nuvem.
pub fn apply_icons(dir: &Path, icons: &[LocalIcon]) -> Result<()> {
    if icons.is_empty() {
        return Ok(());
    }
    let mut meta = CustomMeta::load(dir);
    for icon in icons {
        // Nomes vindos de fora não podem sair da pasta.
        if icon.name.contains(['/', '\\']) || icon.name.starts_with('.') {
            continue;
        }
        let path: PathBuf = dir.join(format!("{}.svg", icon.name));
        match &icon.svg {
            Some(svg) => {
                std::fs::write(&path, svg).map_err(|e| e.to_string())?;
                meta.mark_updated(&icon.name, icon.updated_at);
            }
            None => {
                let _ = std::fs::remove_file(&path);
                meta.mark_deleted(&icon.name, icon.updated_at);
            }
        }
    }
    meta.save(dir)
}

pub fn folder_rows(user_id: &str, folders: &[Folder]) -> serde_json::Value {
    folders
        .iter()
        .map(|f| {
            json!({
                "user_id": user_id, "id": f.id, "name": f.name, "items": f.items,
                "deleted": f.deleted, "updated_at": to_iso(f.updated_at.max(1)),
            })
        })
        .collect()
}

pub fn icon_rows(user_id: &str, icons: &[LocalIcon]) -> serde_json::Value {
    icons
        .iter()
        .map(|i| {
            json!({
                "user_id": user_id, "name": i.name, "svg": i.svg.clone().unwrap_or_default(),
                "deleted": i.svg.is_none(), "updated_at": to_iso(i.updated_at.max(1)),
            })
        })
        .collect()
}

pub async fn fetch(session: &Session) -> Result<(Vec<RemoteFolder>, Vec<RemoteIcon>)> {
    let folders = get(session, "folders?select=id,name,items,deleted,updated_at").await?;
    let icons = get(session, "custom_icons?select=name,svg,deleted,updated_at").await?;
    Ok((folders, icons))
}

pub async fn push(session: &Session, folders: &[Folder], icons: &[LocalIcon]) -> Result<()> {
    if !folders.is_empty() {
        upsert(session, "folders", "user_id,id", folder_rows(&session.user_id, folders)).await?;
    }
    if !icons.is_empty() {
        upsert(session, "custom_icons", "user_id,name", icon_rows(&session.user_id, icons)).await?;
    }
    Ok(())
}
