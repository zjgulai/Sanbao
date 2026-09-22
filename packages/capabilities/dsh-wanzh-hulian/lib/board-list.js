import { buildBoards, mergeRegisteredTools } from "./host-util.js";
import { BOARDS } from "./boards.js";

export function createListHandler({ readState, resolveCreds, readConnections, readMcpServers, getnoteToolNames, mergeHealth }) {
  return async function handleList(credentials) {
    const state = await readState();
    const creds = await resolveCreds(credentials);
    const { connections: conns, health: connsHealth } = await readConnections();
    const connections = [];
    for (const conn of conns) {
      const item = { ...conn };
      const st = {
        enabled: conn.enabled !== false,
        modelInvoke: conn.id === "getnote-brain" ? state.modelInvoke : undefined,
        defaultTopicId: conn.id === "getnote-brain" ? (state.defaultTopicId ?? null) : null,
        cliAuthed: conn.id === "getnote-brain" ? creds.cliAuthed : false,
        credSource: conn.id === "getnote-brain" ? creds.source : "none"
      };
      if (conn.id === "getnote-brain") {
        st.apiKeyConfigured = Boolean(creds.apiKey);
        st.clientIdConfigured = Boolean(creds.clientId);
      } else {
        for (const f of conn.authFields ?? []) {
          try {
            const r = await credentials.resolve(f.ref);
            st[f.ref + "Configured"] = typeof r?.value === "string" && r.value !== "";
            if (typeof r?.value === "string" && r.value) st.credSource = st.credSource === "none" ? "form" : st.credSource;
          } catch { st[f.ref + "Configured"] = false; }
        }
      }
      if (conn.id === "getnote-brain") {
        Object.assign(item, mergeRegisteredTools(item, getnoteToolNames()));
        item.command = conn.command ?? item.command;
        item.oauthCmd = conn.oauthCmd;
      }
      item.state = st;
      connections.push(item);
    }
    const boards = buildBoards({ boards: BOARDS, connections });
    const { health: mcpHealth } = await readMcpServers();
    return {
      status: 200,
      body: { ok: true, boards, connections, health: mergeHealth(state.health, connsHealth, mcpHealth) }
    };
  };
}
