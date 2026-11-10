use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("banco de dados: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("rede: {0}")]
    Http(String),
    #[error("E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("origem não permitida: {0}")]
    ForbiddenOrigin(String),
    #[error("arquivo de fonte inválido: {0}")]
    InvalidFont(String),
    #[error("limite excedido: {0}")]
    TooLarge(String),
    #[error("caminho inseguro: {0}")]
    UnsafePath(String),
    #[error("provedor: {0}")]
    Provider(String),
    #[error("não encontrado: {0}")]
    NotFound(String),
    #[error("indisponível: {0}")]
    Unavailable(String),
    #[error("sistema: {0}")]
    Native(#[from] fm_native::NativeError),
    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        // Remove a URL do texto para não vazar tokens/parâmetros em mensagens de erro.
        Error::Http(e.without_url().to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
