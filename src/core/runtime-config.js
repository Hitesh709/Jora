export function runtimeConfig(env=process.env){
  return {
    model:{apiKey:env.OPENAI_API_KEY,baseUrl:env.JORA_MODEL_BASE_URL,model:env.JORA_MODEL},
    github:{token:env.GITHUB_TOKEN,owner:env.JORA_GITHUB_OWNER,repo:env.JORA_GITHUB_REPO,branch:env.JORA_GITHUB_BRANCH||"main"},
    workspace:env.JORA_WORKSPACE||"./.jora/workspace",
    docker:{image:env.JORA_DOCKER_IMAGE||"node:20-bookworm-slim",network:env.JORA_DOCKER_NETWORK||"none"},
    persistence:env.JORA_STATE_FILE||"./.jora/executions.json",
    championStateFile:env.JORA_CHAMPION_STATE_FILE||"./.jora/champion.json",
    ci:{
      timeoutMs:Number(env.JORA_CI_TIMEOUT_MS||600000),
      pollMs:Number(env.JORA_CI_POLL_MS||5000)
    },
    worker:{intervalMs:Number(env.JORA_WORK_INTERVAL_MS||60000),maxCycles:env.JORA_MAX_CYCLES?Number(env.JORA_MAX_CYCLES):Infinity}
  };
}
