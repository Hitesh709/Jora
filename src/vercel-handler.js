import { runtimeConfig } from "./core/runtime-config.js";
import { MultiModelGateway } from "./core/multi-model-gateway.js";
import { JoraNativeProvider } from "./core/jora-native-provider.js";
import { createProductionJoraRuntime } from "./core/production-runtime.js";

const config = runtimeConfig();
const modelGateway = new MultiModelGateway({
  providers: new Map([["jora", new JoraNativeProvider()]]),
  defaultModel: "jora",
  fallbackModels: [],
});
const runtime = await createProductionJoraRuntime({ config, modelGateway });

export default async function handler(req, res) {
  try {
    const command = req.method + " " + req.url;
    const result = await runtime.runtime.execute({
      command,
      constraints: {},
      context: { workspace: config.workspace, provider: "jora" },
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

export const config = { api: { bodyParser: false } };
