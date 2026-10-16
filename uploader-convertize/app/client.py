import requests


class APIError(Exception):
    pass


class APIClient:
    def __init__(self, schema, api_key, version="1.0"):
        self.schema, self.version = schema, version
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Token {api_key}"})

    def request(self, method, path, **kwargs):
        try:
            response = self.session.request(method,
                f"https://api.convertize.com.br/{self.schema}/api/{self.version}{path}",
                timeout=(15, 30), **kwargs)
        except requests.exceptions.SSLError:
            raise APIError("Não foi possível verificar o certificado do servidor. Contate o suporte.") from None
        except requests.exceptions.Timeout:
            raise APIError("Servidor demorou a responder. Confira se o envio foi recebido antes de tentar novamente.") from None
        except requests.exceptions.RequestException:
            raise APIError("Falha de conexão. Verifique a internet e tente novamente.") from None
        if not response.ok:
            messages = {401: "Chave de API inválida ou expirada.", 403: "A chave não tem permissão para esta operação.",
                        404: "Recurso não encontrado. Confira schema e versão.", 429: "Limite de requisições atingido. Aguarde antes de tentar novamente."}
            raise APIError(messages.get(response.status_code, f"Servidor retornou erro HTTP {response.status_code}."))
        try:
            return response.json() if response.content else {}
        except ValueError:
            raise APIError("Servidor retornou uma resposta inesperada.") from None

    def get(self, path, params=None):
        return self.request("GET", path, params=params)

    def post(self, path, data=None, files=None):
        # Nunca repetir POST automaticamente: ele pode já ter sido recebido.
        return self.request("POST", path, data=data, files=files)

    def close(self):
        self.session.close()
