export function phaseLabel(p: { phase: string; done?: number; total?: number }) {
  switch (p.phase) {
    case "resolving": return "Preparando…";
    case "downloading": return `Baixando… ${p.done ?? 0}/${p.total ?? "?"}`;
    case "registering": return "Registrando…";
    case "active_in_system": return "Ativada no sistema";
    case "waiting_app": return "Aguardando atualização do aplicativo";
    case "error": return "Erro ao ativar";
    default: return "";
  }
}
