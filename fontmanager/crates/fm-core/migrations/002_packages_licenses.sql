-- Provedores que distribuem pacotes ZIP (ex.: Font Squirrel): vários arquivos por (peso, estilo),
-- licença lida do próprio pacote e aceite explícito do usuário para licenças não pré-aprovadas.

-- cache_files ganha `variant_name` na chave única (ex.: "Condensed Bold" e "Bold" no mesmo peso).
CREATE TABLE cache_files_new (
    id            INTEGER PRIMARY KEY,
    family_key    TEXT NOT NULL,
    family_name   TEXT NOT NULL,
    provider_id   TEXT NOT NULL,
    weight        INTEGER NOT NULL,
    style         TEXT NOT NULL,
    variable      INTEGER NOT NULL DEFAULT 0,
    variant_name  TEXT NOT NULL DEFAULT '',
    format        TEXT NOT NULL,
    rel_path      TEXT NOT NULL UNIQUE,
    sha256        TEXT NOT NULL,
    size          INTEGER NOT NULL,
    internal_family TEXT,
    internal_style  TEXT,
    source_url    TEXT NOT NULL,
    license       TEXT,
    downloaded_at TEXT NOT NULL,
    UNIQUE(family_key, provider_id, weight, style, variable, variant_name)
);
INSERT INTO cache_files_new(id,family_key,family_name,provider_id,weight,style,variable,format,rel_path,sha256,size,internal_family,internal_style,source_url,license,downloaded_at)
    SELECT id,family_key,family_name,provider_id,weight,style,variable,format,rel_path,sha256,size,internal_family,internal_style,source_url,license,downloaded_at FROM cache_files;
DROP TABLE cache_files;
ALTER TABLE cache_files_new RENAME TO cache_files;

-- Licença lida do pacote baixado (texto integral, para mostrar ao usuário).
CREATE TABLE source_licenses (
    source_id  INTEGER PRIMARY KEY REFERENCES family_sources(id) ON DELETE CASCADE,
    license    TEXT NOT NULL,
    file_name  TEXT NOT NULL,
    text       TEXT NOT NULL,
    read_at    TEXT NOT NULL
);

-- Aceite explícito: vale para aquela família, provedor e licença.
CREATE TABLE license_acceptances (
    family_key  TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    license     TEXT NOT NULL,
    accepted_at TEXT NOT NULL,
    PRIMARY KEY (family_key, provider_id)
);

-- Detalhes obtidos sob demanda (imagem de prévia, MD5 de cada arquivo).
CREATE TABLE remote_details (
    source_id     INTEGER PRIMARY KEY REFERENCES family_sources(id) ON DELETE CASCADE,
    preview_image TEXT,
    checksums     TEXT NOT NULL DEFAULT '{}',
    fetched_at    TEXT NOT NULL
);
