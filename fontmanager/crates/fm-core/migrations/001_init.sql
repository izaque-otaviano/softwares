-- Catálogo remoto (substituível a cada sincronização) ------------------------------------------
CREATE TABLE providers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_sync   TEXT,
    status      TEXT NOT NULL DEFAULT 'ok',
    status_note TEXT
);

-- Família deduplicada: uma linha por família real, qualquer que seja a quantidade de provedores.
CREATE TABLE families (
    id        INTEGER PRIMARY KEY,
    key       TEXT NOT NULL UNIQUE,          -- nome normalizado (ver dedup.rs)
    name      TEXT NOT NULL,
    category  TEXT,
    variable  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_families_name ON families(key);

-- Origem da família em cada provedor, com versão/licença próprias.
CREATE TABLE family_sources (
    id                 INTEGER PRIMARY KEY,
    family_id          INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    provider_id        TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    provider_family_id TEXT NOT NULL,
    origin             TEXT,                 -- ex.: "google" para espelhos do Google Fonts
    version            TEXT,
    license            TEXT,
    license_url        TEXT,
    last_modified      TEXT,
    subsets            TEXT NOT NULL DEFAULT '[]',
    axes               TEXT NOT NULL DEFAULT '[]',
    variable           INTEGER NOT NULL DEFAULT 0,
    UNIQUE(provider_id, provider_family_id)
);
CREATE INDEX idx_sources_family ON family_sources(family_id);

CREATE TABLE source_variants (
    source_id INTEGER NOT NULL REFERENCES family_sources(id) ON DELETE CASCADE,
    weight    INTEGER NOT NULL,
    style     TEXT NOT NULL CHECK (style IN ('normal','italic')),
    PRIMARY KEY (source_id, weight, style)
);

-- URLs de arquivos já resolvidas sob demanda (carregadas só quando necessário).
CREATE TABLE source_files (
    id          INTEGER PRIMARY KEY,
    source_id   INTEGER NOT NULL REFERENCES family_sources(id) ON DELETE CASCADE,
    weight      INTEGER NOT NULL,
    style       TEXT NOT NULL,
    format      TEXT NOT NULL,               -- ttf | otf | woff2 | woff
    subset      TEXT,
    url         TEXT NOT NULL,
    variable    INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT NOT NULL,
    UNIQUE(source_id, weight, style, format, subset, variable)
);

-- Cache de arquivos baixados e validados -------------------------------------------------------
CREATE TABLE cache_files (
    id            INTEGER PRIMARY KEY,
    family_key    TEXT NOT NULL,
    family_name   TEXT NOT NULL,
    provider_id   TEXT NOT NULL,
    weight        INTEGER NOT NULL,
    style         TEXT NOT NULL,
    variable      INTEGER NOT NULL DEFAULT 0,
    format        TEXT NOT NULL,
    rel_path      TEXT NOT NULL UNIQUE,       -- relativo à pasta de cache
    sha256        TEXT NOT NULL,
    size          INTEGER NOT NULL,
    internal_family TEXT,
    internal_style  TEXT,
    source_url    TEXT NOT NULL,
    license       TEXT,
    downloaded_at TEXT NOT NULL,
    UNIQUE(family_key, provider_id, weight, style, variable)
);

-- Ativação (fontes que ESTE app registrou no SO) -----------------------------------------------
CREATE TABLE activations (
    cache_file_id INTEGER PRIMARY KEY REFERENCES cache_files(id) ON DELETE RESTRICT,
    scope         TEXT NOT NULL CHECK (scope IN ('session','persistent')),
    display_name  TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    notification  TEXT NOT NULL,
    backend       TEXT NOT NULL
);

-- Controle de referências: o arquivo só é desregistrado quando o último dono sair.
CREATE TABLE activation_refs (
    cache_file_id INTEGER NOT NULL REFERENCES activations(cache_file_id) ON DELETE CASCADE,
    owner         TEXT NOT NULL,              -- "family:<key>" | "collection:<id>"
    PRIMARY KEY (cache_file_id, owner)
);

-- Inventário local (separado do catálogo remoto) -----------------------------------------------
CREATE TABLE local_fonts (
    path     TEXT PRIMARY KEY,
    family   TEXT NOT NULL,
    style    TEXT,
    weight   INTEGER,
    italic   INTEGER NOT NULL DEFAULT 0,
    size     INTEGER NOT NULL,
    mtime    INTEGER NOT NULL
);
CREATE INDEX idx_local_family ON local_fonts(family);

-- Preferências do usuário ----------------------------------------------------------------------
CREATE TABLE favorites (family_key TEXT PRIMARY KEY, added_at TEXT NOT NULL);

CREATE TABLE collections (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
);
CREATE TABLE collection_items (
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    family_key    TEXT NOT NULL,
    added_at      TEXT NOT NULL,
    PRIMARY KEY (collection_id, family_key)
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE operation_log (
    id         INTEGER PRIMARY KEY,
    ts         TEXT NOT NULL,
    kind       TEXT NOT NULL,                 -- activate | deactivate | download | sync | restore
    family_key TEXT,
    status     TEXT NOT NULL,                 -- ok | error
    detail     TEXT
);
