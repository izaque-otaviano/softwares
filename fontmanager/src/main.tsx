import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { IS_TAURI } from "./lib/api";
import "./index.css";

// macOS + app nativo: janela transparente com o material "sidebar" do sistema atrás da barra lateral.
const isMac = /Mac/.test(navigator.platform || navigator.userAgent);
document.documentElement.classList.toggle("mac", isMac);
document.documentElement.classList.toggle("vibrant", isMac && IS_TAURI);

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 0 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
