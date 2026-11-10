//! Fachada do núcleo: sincronização de catálogo, consulta, ativação/desativação com
//! contagem de referências, CSS e inventário. É o que o shell Tauri chama.

use crate::cache::FontCache;
use crate::css::{self, CssOutput, CssRequest};
use crate::db::{now, ActivationRow, CacheFile, Db};
use crate::error::{Error, Result};
use crate::http::Http;
use crate::model::*;
use crate::providers::{FamilyRef, ProviderConfig, Registry};
use fm_native::{FontBackend, Notification, RegisterRequest, Scope};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Arc;

/// Fases reais emitidas durante a ativação (a interface mostra exatamente estas).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum Phase {
    Resolving,
    Downloading { done: u32, total: u32 },
    Registering,
    /// Registrada no SO (estado 1) e notificação emitida (estado 2).
    ActiveInSystem,
    /// Estado 3 não verificável: aguardando o aplicativo reconhecer a fonte.
    WaitingApp,
    Error { message: String },
}

/// Estado 3: nenhuma API pública permite confirmar que um app de terceiros já enxerga a fonte.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppRecognition {
    NotVerifiable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationReport {
    pub family_key: String,
    pub family_name: String,
    /// "activated" | "already_in_system"
    pub outcome: String,
    pub provider_used: Option<String>,
    pub files: u32,
    /// Estado 1.
    pub registered_in_os: bool,
    /// Estado 2.
    pub notification: Notification,
    /// Verificação cruzada por processo novo (não prova nada sobre apps já abertos).
    pub visible_to_new_processes: Option<bool>,
    /// Estado 3.
    pub app_recognition: AppRecognition,
    pub scope: Scope,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeactivationReport {
    pub family_key: String,
    pub unregistered: u32,
    /// Arquivos que continuam registrados porque outro dono (coleção/família) ainda os usa.
    pub kept_by_other_owners: u32,
    pub notification: Notification,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub provider_id: String,
    pub inserted: usize,
    pub updated: usize,
    pub removed: usize,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateOptions {
    pub variants: Option<Vec<VariantView>>,
    pub scope: Option<Scope>,
    /// Quem pede a ativação; padrão `family:<key>`. Coleções usam `collection:<id>`.
    pub owner: Option<String>,
}

pub struct FontManager {
    pub db: Db,
    pub cache: FontCache,
    pub http: Http,
    pub registry: Registry,
    backend: Arc<dyn FontBackend>,
    op_lock: tokio::sync::Mutex<()>,
}

impl FontManager {
    pub fn new(data_dir: PathBuf, backend: Arc<dyn FontBackend>) -> Result<Self> {
        let db = Db::open(&data_dir.join("fontmanager.sqlite"))?;
        let http = Http::new()?;
        Self::assemble(data_dir, db, http, Registry::new(), backend)
    }

    pub fn assemble(data_dir: PathBuf, db: Db, http: Http, registry: Registry, backend: Arc<dyn FontBackend>) -> Result<Self> {
        let cache = FontCache::new(data_dir.join("cache"), http.clone(), db.clone())?;
        for p in registry.all() {
            let i = p.info();
            db.upsert_provider(&i.id, &i.name, i.status, i.note.as_deref())?;
        }
        Ok(Self { db, cache, http, registry, backend, op_lock: tokio::sync::Mutex::new(()) })
    }

    pub fn backend_name(&self) -> &'static str {
        self.backend.name()
    }

    fn config(&self) -> ProviderConfig {
        ProviderConfig { google_api_key: self.db.get_setting("google_api_key").ok().flatten() }
    }

    pub fn default_scope(&self) -> Scope {
        match self.db.get_setting("scope").ok().flatten().as_deref() {
            Some("persistent") => Scope::Persistent,
            _ => Scope::Session,
        }
    }

    // ---- catálogo ------------------------------------------------------------------------------

    pub fn providers(&self) -> Vec<ProviderInfo> {
        let has_key = self.config().google_api_key.is_some();
        self.registry
            .all()
            .iter()
            .map(|p| {
                let mut i = p.info();
                if i.id == "google" && !has_key {
                    i.status = ProviderStatus::NeedsConfig;
                }
                i
            })
            .collect()
    }

    pub async fn sync_provider(&self, id: &str) -> Result<SyncReport> {
        let p = self.registry.get(id).ok_or_else(|| Error::NotFound(format!("provedor {id}")))?;
        let families = match p.fetch_catalog(&self.http, &self.config()).await {
            Ok(f) => f,
            Err(e) => {
                self.db.log_op("sync", None, "error", &format!("{id}: {e}"));
                return Err(e);
            }
        };
        let db = self.db.clone();
        let pid = id.to_string();
        let (inserted, updated, removed) = tokio::task::spawn_blocking(move || db.sync_catalog(&pid, &families))
            .await
            .map_err(|e| Error::Other(e.to_string()))??;
        self.db.log_op("sync", None, "ok", &format!("{id}: +{inserted} ~{updated} -{removed}"));
        Ok(SyncReport { provider_id: id.into(), inserted, updated, removed })
    }

    /// Sincroniza os provedores com catálogo; falha de um não impede os outros.
    pub async fn sync_all(&self) -> Vec<(String, std::result::Result<SyncReport, String>)> {
        let mut out = Vec::new();
        for p in self.registry.all() {
            let i = p.info();
            if !i.has_catalog || !self.db.provider_enabled(&i.id).unwrap_or(true) || i.status == ProviderStatus::NotAvailable {
                continue;
            }
            if i.id == "google" && self.config().google_api_key.is_none() {
                continue;
            }
            let r = self.sync_provider(&i.id).await.map_err(|e| e.to_string());
            out.push((i.id, r));
        }
        out
    }

    pub fn query(&self, q: &CatalogQuery) -> Result<CatalogPage> {
        self.db.query_catalog(q)
    }

    // ---- CSS -----------------------------------------------------------------------------------

    pub fn generate_css(&self, family_key: &str, req: &CssRequest) -> Result<CssOutput> {
        let d = self.db.family_detail(family_key)?;
        css::generate(&d.summary.name, d.summary.category.as_deref(), &d.sources, req)
    }

    /// Exporta CSS + arquivos TTF para hospedagem própria (baixa o que faltar).
    pub async fn export_self_hosted(&self, family_key: &str, req: &CssRequest, dest: PathBuf) -> Result<Vec<PathBuf>> {
        let mut r = req.clone();
        r.cdn = css::Cdn::SelfHosted;
        let out = self.generate_css(family_key, &r)?;
        let d = self.db.family_detail(family_key)?;
        let wanted: Vec<VariantView> = out.self_host_files.iter().map(|f| VariantView { weight: f.weight, style: f.style }).collect();
        let (provider, files) = self.plan_files(family_key, Some(&wanted), req.variable).await?;
        let dir = dest.join("fonts");
        std::fs::create_dir_all(&dir)?;
        let mut written = Vec::new();
        for f in files {
            let cf = self.cache.ensure(&provider, family_key, &d.summary.name, d.summary.license.as_deref(), &f).await?;
            let name = out
                .self_host_files
                .iter()
                .find(|s| s.weight == f.weight && s.style == f.style && s.variable == f.variable)
                .map(|s| s.file_name.clone())
                .ok_or_else(|| Error::Other("arquivo fora da seleção".into()))?;
            let target = dir.join(&name);
            std::fs::copy(self.cache.verify(&cf)?, &target)?;
            written.push(target);
        }
        let css_path = dest.join("fonts.css");
        std::fs::write(&css_path, out.font_face_css.unwrap_or_default().replace("/fonts/", "./fonts/"))?;
        written.push(css_path);
        Ok(written)
    }

    // ---- resolução de arquivos instaláveis --------------------------------------------------------

    /// Escolhe o provedor e os arquivos TTF/OTF para as variantes pedidas.
    async fn plan_files(&self, family_key: &str, wanted: Option<&[VariantView]>, prefer_variable: bool) -> Result<(String, Vec<RemoteFile>)> {
        let detail = self.db.family_detail(family_key)?;
        // O Google CSS2 "aceita" pesos/estilos inexistentes (sintetiza arquivos), então validamos
        // antes contra as variantes reais do catálogo.
        if let Some(w) = wanted {
            let real: std::collections::HashSet<&VariantView> = detail.sources.iter().flat_map(|s| s.variants.iter()).collect();
            let bad: Vec<String> = w.iter().filter(|v| !real.contains(v)).map(|v| format!("{} {}", v.weight, v.style.as_str())).collect();
            if !bad.is_empty() {
                return Err(Error::Unavailable(format!("variantes inexistentes para {}: {}", detail.summary.name, bad.join(", "))));
            }
        }
        // Candidatos em ordem de preferência: espelhos do Google (via css2) primeiro.
        let mut cands: Vec<(String, FamilyRef, i64)> = Vec::new();
        for s in &detail.sources {
            let sid = self.db.source_id(&s.provider_id, family_key)?.unwrap_or(0);
            let variants = wanted.map(|w| w.to_vec()).unwrap_or_else(|| s.variants.clone());
            let google_like = s.provider_id == "google" || s.origin.as_deref() == Some("google");
            if google_like {
                let fam = FamilyRef { name: detail.summary.name.clone(), provider_family_id: detail.summary.name.clone(), variants: variants.clone(), variable: prefer_variable && s.variable };
                cands.insert(0, ("google".into(), fam, sid));
            }
            if s.provider_id == "fontsource" {
                let fam = FamilyRef { name: detail.summary.name.clone(), provider_family_id: s.provider_family_id.clone(), variants, variable: false };
                cands.push(("fontsource".into(), fam, sid));
            }
        }
        let mut last_err: Option<Error> = None;
        for (pid, fam, sid) in cands {
            let Some(p) = self.registry.get(&pid) else { continue };
            if !p.info().can_install_files {
                continue;
            }
            match p.resolve_files(&self.http, &fam).await {
                Ok(files) => {
                    let mut files: Vec<RemoteFile> = files.into_iter().filter(|f| f.format.installable()).collect();
                    if let Some(w) = wanted {
                        files.retain(|f| f.variable || w.iter().any(|v| v.weight == f.weight && v.style == f.style));
                    }
                    // Um arquivo por (peso, estilo): prefere TTF a OTF.
                    files.sort_by_key(|f| (f.weight, f.style, f.format != FileFormat::Ttf));
                    files.dedup_by_key(|f| (f.weight, f.style, f.variable));
                    if files.is_empty() {
                        last_err = Some(Error::Unavailable(format!("{pid} não publica TTF/OTF para {}", fam.name)));
                        continue;
                    }
                    if sid > 0 {
                        let _ = self.db.store_source_files(sid, &files);
                    }
                    return Ok((pid, files));
                }
                Err(e) => last_err = Some(e),
            }
        }
        Err(last_err.unwrap_or_else(|| Error::Unavailable("nenhum provedor oferece arquivos instaláveis desta família".into())))
    }

    // ---- ativação --------------------------------------------------------------------------------

    pub async fn activate(&self, family_key: &str, opts: ActivateOptions, progress: impl Fn(Phase) + Send + Sync) -> Result<ActivationReport> {
        let _guard = self.op_lock.lock().await;
        match self.activate_inner(family_key, &opts, &progress).await {
            Ok(r) => {
                self.db.log_op("activate", Some(family_key), "ok", &r.message);
                Ok(r)
            }
            Err(e) => {
                progress(Phase::Error { message: e.to_string() });
                self.db.log_op("activate", Some(family_key), "error", &e.to_string());
                Err(e)
            }
        }
    }

    async fn activate_inner(&self, key: &str, opts: &ActivateOptions, progress: &(impl Fn(Phase) + Send + Sync)) -> Result<ActivationReport> {
        let detail = self.db.family_detail(key)?;
        let name = detail.summary.name.clone();
        let scope = opts.scope.unwrap_or_else(|| self.default_scope());
        let owner = opts.owner.clone().unwrap_or_else(|| format!("family:{key}"));

        // 1. Já disponível no sistema (instalada pelo usuário/SO)? Não duplicamos nem tocamos nela.
        let already_ours = self.db.cache_files_for_family(key)?.iter().any(|c| matches!(self.db.activation(c.id), Ok(Some(_))));
        if !already_ours && self.db.is_system_family(&name)? {
            return Ok(ActivationReport {
                family_key: key.into(),
                family_name: name.clone(),
                outcome: "already_in_system".into(),
                provider_used: None,
                files: 0,
                registered_in_os: false,
                notification: Notification::NotSent,
                visible_to_new_processes: Some(true),
                app_recognition: AppRecognition::NotVerifiable,
                scope,
                message: format!("{name} já está instalada no sistema; nada foi alterado."),
            });
        }

        // 2. Identifica os arquivos necessários.
        progress(Phase::Resolving);
        let prefer_vf = self.db.get_setting("prefer_variable")?.as_deref() == Some("true");
        let (provider, files) = self.plan_files(key, opts.variants.as_deref(), prefer_vf).await?;

        // 3-4. Baixa (se não estiver em cache) e valida.
        let total = files.len() as u32;
        let mut cached: Vec<CacheFile> = Vec::new();
        for (i, f) in files.iter().enumerate() {
            progress(Phase::Downloading { done: i as u32, total });
            let cf = self.cache.ensure(&provider, key, &name, detail.summary.license.as_deref(), f).await?;
            cached.push(cf);
        }
        progress(Phase::Downloading { done: total, total });

        // 5. Registra no SO. Em qualquer falha, desfaz o que esta operação registrou.
        progress(Phase::Registering);
        let backend = self.backend.clone();
        let db = self.db.clone();
        let cached2 = cached.clone();
        let cache = self.cache.clone();
        let owner2 = owner.clone();
        let (registered_now, notification) = tokio::task::spawn_blocking(move || -> Result<(u32, Notification)> {
            let mut done: Vec<(CacheFile, RegisterRequest)> = Vec::new();
            let mut last = Notification::NotSent;
            for cf in &cached2 {
                // Já registrado por outro dono: só soma a referência.
                if db.activation(cf.id)?.is_some() {
                    db.add_ref_only(cf.id, &owner2)?;
                    continue;
                }
                let path = cache.verify(cf)?; // integridade antes de entregar ao SO
                let req = RegisterRequest { path, scope, display_name: display_name(cf) };
                match backend.register(&req) {
                    Ok(rep) if rep.registered => {
                        last = rep.notification;
                        let row = ActivationRow {
                            cache_file_id: cf.id,
                            scope,
                            display_name: req.display_name.clone(),
                            registered_at: now(),
                            notification: format!("{:?}", rep.notification),
                            backend: backend.name().into(),
                        };
                        if let Err(e) = db.add_activation_ref(&row, &owner2) {
                            let _ = backend.unregister(&req);
                            rollback(&*backend, &db, &done, &owner2);
                            return Err(e);
                        }
                        done.push((cf.clone(), req));
                    }
                    Ok(_) => {
                        rollback(&*backend, &db, &done, &owner2);
                        return Err(Error::Other(format!("o sistema não confirmou o registro de {}", cf.rel_path)));
                    }
                    Err(e) => {
                        rollback(&*backend, &db, &done, &owner2);
                        return Err(e.into());
                    }
                }
            }
            Ok((done.len() as u32, last))
        })
        .await
        .map_err(|e| Error::Other(e.to_string()))??;

        // Estado 1 e 2 confirmados. Verificação cruzada por processo novo (estado 2.5, opcional).
        progress(Phase::ActiveInSystem);
        let backend = self.backend.clone();
        let fam = cached.first().and_then(|c| c.internal_family.clone()).unwrap_or_else(|| name.clone());
        let visible = tokio::task::spawn_blocking(move || backend.visible_to_new_processes(&fam)).await.ok().flatten();
        progress(Phase::WaitingApp);

        let message = format!(
            "{} arquivo(s) de {name} registrado(s) no sistema ({}). Aplicativos já abertos podem exigir atualização manual ou reinício para exibir a fonte.",
            cached.len(),
            self.backend.name()
        );
        Ok(ActivationReport {
            family_key: key.into(),
            family_name: name,
            outcome: "activated".into(),
            provider_used: Some(provider),
            files: registered_now.max(cached.len() as u32),
            registered_in_os: true,
            notification,
            visible_to_new_processes: visible,
            app_recognition: AppRecognition::NotVerifiable,
            scope,
            message,
        })
    }

    pub async fn deactivate(&self, family_key: &str, owner: Option<String>) -> Result<DeactivationReport> {
        let _guard = self.op_lock.lock().await;
        let owner = owner.unwrap_or_else(|| format!("family:{family_key}"));
        let backend = self.backend.clone();
        let db = self.db.clone();
        let cache = self.cache.clone();
        let key = family_key.to_string();
        let rep = tokio::task::spawn_blocking(move || -> Result<DeactivationReport> {
            let mut rep = DeactivationReport { family_key: key.clone(), unregistered: 0, kept_by_other_owners: 0, notification: Notification::NotSent, warnings: vec![] };
            for id in db.refs_of_owner(&owner)? {
                let cf = db.cache_file(id)?;
                if cf.family_key != key {
                    continue;
                }
                let remaining = db.remove_ref(id, &owner)?;
                if remaining > 0 {
                    rep.kept_by_other_owners += 1;
                    continue;
                }
                let Some(act) = db.activation(id)? else { continue };
                // Só mexemos em caminhos que NÓS registramos (dentro do cache gerenciado).
                let path = cache.abs_path(&cf.rel_path)?;
                let req = RegisterRequest { path, scope: act.scope, display_name: act.display_name.clone() };
                match backend.unregister(&req) {
                    Ok(u) => rep.notification = u.notification,
                    Err(e) => rep.warnings.push(format!("{}: {e}", act.display_name)),
                }
                db.drop_activation(id)?;
                rep.unregistered += 1;
            }
            Ok(rep)
        })
        .await
        .map_err(|e| Error::Other(e.to_string()))??;
        self.db.log_op("deactivate", Some(family_key), if rep.warnings.is_empty() { "ok" } else { "error" }, &format!("{} removida(s); {} mantida(s)", rep.unregistered, rep.kept_by_other_owners));
        Ok(rep)
    }

    /// Ativa/desativa várias famílias em lote (cada uma segue as mesmas garantias).
    pub async fn activate_many(&self, keys: &[String], owner: Option<String>, progress: impl Fn(&str, Phase) + Send + Sync) -> Vec<(String, std::result::Result<ActivationReport, String>)> {
        let mut out = Vec::new();
        for k in keys {
            let r = self.activate(k, ActivateOptions { owner: owner.clone(), ..Default::default() }, |p| progress(k, p)).await.map_err(|e| e.to_string());
            out.push((k.clone(), r));
        }
        out
    }

    /// No início do app: para cada ativação registrada, garante que o SO ainda a enxerga.
    /// Fontes de sessão desaparecem após logoff/reinício, então são registradas de novo.
    pub async fn restore_activations(&self) -> Result<u32> {
        if self.db.get_setting("restore_on_startup")?.as_deref() == Some("false") {
            return Ok(0);
        }
        let _guard = self.op_lock.lock().await;
        let backend = self.backend.clone();
        let db = self.db.clone();
        let cache = self.cache.clone();
        tokio::task::spawn_blocking(move || -> Result<u32> {
            let mut restored = 0;
            let mut visible: std::collections::HashMap<String, Option<bool>> = Default::default();
            for act in db.all_activations()? {
                let cf = db.cache_file(act.cache_file_id)?;
                let fam = cf.internal_family.clone().unwrap_or(cf.family_name.clone());
                let vis = *visible.entry(fam.clone()).or_insert_with(|| backend.visible_to_new_processes(&fam));
                if vis == Some(true) {
                    continue;
                }
                let Ok(path) = cache.verify(&cf) else {
                    db.log_op("restore", Some(&cf.family_key), "error", "arquivo ausente ou corrompido; ativação descartada");
                    for o in db.refs_of_owner(&format!("family:{}", cf.family_key))? {
                        let _ = db.remove_ref(o, &format!("family:{}", cf.family_key));
                    }
                    db.drop_activation(cf.id)?;
                    continue;
                };
                let req = RegisterRequest { path, scope: act.scope, display_name: act.display_name.clone() };
                match backend.register(&req) {
                    Ok(_) => restored += 1,
                    Err(e) => db.log_op("restore", Some(&cf.family_key), "error", &e.to_string()),
                }
            }
            Ok(restored)
        })
        .await
        .map_err(|e| Error::Other(e.to_string()))?
    }

    /// Desativa tudo o que este app ativou (usado por "desativar ao sair").
    pub async fn deactivate_all(&self) -> Result<u32> {
        let keys: BTreeSet<String> = self.db.all_activations()?.into_iter().filter_map(|a| self.db.cache_file(a.cache_file_id).ok()).map(|c| c.family_key).collect();
        let mut n = 0;
        for k in keys {
            // Remove todas as referências, de qualquer dono.
            let owners: Vec<String> = {
                let c = self.db.lock();
                let mut s = c.prepare("SELECT DISTINCT owner FROM activation_refs r JOIN cache_files f ON f.id=r.cache_file_id WHERE f.family_key=?1")?;
                let v = s.query_map([&k], |r| r.get(0))?.collect::<std::result::Result<Vec<String>, _>>()?;
                v
            };
            for o in owners {
                n += self.deactivate(&k, Some(o)).await?.unregistered;
            }
        }
        Ok(n)
    }

    // ---- inventário local ------------------------------------------------------------------------

    pub fn scan_local(&self) -> Result<(usize, usize)> {
        let dirs = self.backend.system_font_dirs();
        crate::inventory::scan(&self.db, &dirs, &[self.cache.root().to_path_buf()])
    }

    /// Estado do SO para uma família (usado em "diagnóstico").
    pub fn visible_to_new_processes(&self, family: &str) -> Option<bool> {
        self.backend.visible_to_new_processes(family)
    }
}

fn display_name(cf: &CacheFile) -> String {
    let base = cf.internal_family.clone().unwrap_or_else(|| cf.family_name.clone());
    let style = cf.internal_style.clone().unwrap_or_else(|| format!("{} {}", cf.weight, cf.style));
    format!("{base} {style}{}", if cf.variable { " VF" } else { "" })
}

fn rollback(backend: &dyn FontBackend, db: &Db, done: &[(CacheFile, RegisterRequest)], owner: &str) {
    for (cf, req) in done.iter().rev() {
        let _ = backend.unregister(req);
        let _ = db.remove_ref(cf.id, owner);
        let _ = db.drop_activation(cf.id);
    }
}
