import {runtimeConfig} from "../src/core/runtime-config.js";
import {MultiModelGateway} from "../src/core/multi-model-gateway.js";
import {JoraNativeProvider} from "../src/core/jora-native-provider.js";
import {createProductionJoraRuntime} from "../src/core/production-runtime.js";

export const maxDuration = 60;

let runtimePromise;

async function getApi() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const config = runtimeConfig(process.env);
      const stateDir = "/tmp/jora-state";
      config.api = {...config.api, enabled: true, host: "127.0.0.1", port: 8787, authToken: null};
      config.workspace = "/tmp/jora-workspace";
      config.persistence = stateDir + "/executions.json";
      config.projectStateFile = stateDir + "/projects.json";
      config.championStateFile = stateDir + "/champion.json";
      config.benchmarkStateFile = stateDir + "/benchmarks.json";
      config.lineageStateFile = stateDir + "/lineage.json";
      config.observabilityStateFile = stateDir + "/observability.json";
      config.distributed = {...config.distributed, enabled: Boolean(config.distributed?.databaseUrl)};
      config.mission = {...config.mission, enabled: false, intervalMs: 0};
      config.operationalHealth = {...config.operationalHealth, enabled: false};
      config.slo = {...config.slo, enabled: false};
      const providers = new Map([["jora", new JoraNativeProvider()]]);
      const modelGateway = new MultiModelGateway({providers, defaultModel: "jora", fallbackModels: []});
      const composed = await createProductionJoraRuntime({config, modelGateway});
      if (!composed.api) throw new Error("JORA_API_ENABLED must be enabled");
      return composed.api;
    })();
  }
  return runtimePromise;
}

export default async function handler(req, res) {
  try {
    const api = await getApi();
    const originalUrl = req.url || "/";
    req.url = originalUrl.replace(/^\/api(?=\/|\?|$)/, "") || "/";
    await api._route(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({status: "unavailable", service: "jora", error: error?.message || "backend initialization failed"}));
    } else {
      res.destroy(error);
    }
  }
}
