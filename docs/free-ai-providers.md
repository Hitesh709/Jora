# Jora Free AI / Coding Provider Guide

Jora exposes a provider menu so users can discover free or $0-start options instead of assuming a paid model is required.

## Important distinction

"Free" does not mean unlimited, permanent, or suitable for confidential production code. Free quotas, model catalogs, data policies, and regional availability can change.

## Current options

| Service | Free access type | Typical use | Jora connection |
|---|---|---|---|
| GitHub Copilot Free | $0 individual tier | IDE coding, chat, CLI/agent features with limits | External account; configure/use through GitHub |
| Gemini Code Assist | Free individual tier | Code completion, generation, debugging and review | External Google account; configure/use through Google's tooling |
| Amazon Q Developer | Perpetual Free tier with monthly limits | IDE/CLI coding and AWS assistance | External AWS/Builder ID account |
| Kilo Code | Auto Free + other free models | Agentic coding in IDE/CLI/cloud | External Kilo account/provider |
| Cline | Open-source agent + rotating free-model promotions | IDE/CLI agentic coding | External Cline/provider account |
| Freebuff | Free coding-agent service | Browser, desktop, CLI, GitHub workflows | External Freebuff account |
| OpenRouter | Free plan + rotating free models | API access to free models | API key; use OpenAI-compatible endpoint |
| Ollama | Local inference | Private/local coding models | Local endpoint; no hosted inference charge |

## OpenRouter example

OpenRouter currently documents a free plan and a free-model router. The catalog changes over time. Jora should never hardcode a model as permanently free.

Suggested environment configuration:

```text
JORA_SEARCH_PROVIDER=tavily
# For model access, configure the Jora model gateway separately.
JORA_MODEL_BASE_URL=https://openrouter.ai/api/v1
JORA_MODEL=<selected-free-model>
OPENAI_API_KEY=<openrouter-key>
```

## Local Ollama example

Run an Ollama model locally, then configure Jora's OpenAI-compatible model adapter to the local endpoint:

```text
JORA_MODEL_BASE_URL=http://host.docker.internal:11434/v1
JORA_MODEL=<local-model>
OPENAI_API_KEY=ollama
```

The exact hostname depends on where Jora runs. A cloud-hosted Railway Jora instance cannot automatically reach a user's laptop-local Ollama server.

## Product rule

Jora's provider picker is a discovery and connection layer. It must not claim that an external service is "unlimited free" unless the provider explicitly documents that condition. Free-tier quotas should be displayed as provider-supplied facts and refreshed periodically.
