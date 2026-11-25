# Claude writes the lead replies (phase 1): implementation plan

**Spec:** `docs/superpowers/specs/2026-11-25-claude-whatsapp-agent-design.md`.

**Goal:** the sales route can answer leads with `claude-opus-5-5`, provably and
reversibly. Deploying changes nothing until the settings are switched.

## Global constraints

- Official SDK `@anthropic-ai/sdk` for every Anthropic call; no sampling
  parameters (rejected on the SDK's API version).
- Current models: effort `low`, `max_tokens` at least 4096, server-side
  refusal fallback, no silent switch to another model id.
- A failed Claude call falls back to the OpenAI default model, never to a Claude
  id sent to OpenAI.
- No lead text or keys in logs or errors.

## Review focus

- Old Claude ids still work (the follow-up and experiment paths use them).
- A refusal or an empty answer is a provider failure, not an empty reply.
- Low credit is visible to Lord the same day.
- The check button never sends anything to a customer.

## Tasks

- [x] 1. `salesAgent/agent.js` `callAnthropic` on the SDK; `callClaude` passes
      the OpenAI model to the fallback and reports `fallbackFrom`. Tests in
      `salesAgent.test.js`.
- [x] 2. `settings.js` registry and `pricing.js` rates for `claude-opus-5-5` and
      `claude-sonnet-5-5`. Tests.
- [x] 3. `salesAgent/claudeHealth.js`: `checkClaude()`, `recordClaudeFailure()`,
      `claudeAlert()`. Route records a fallback; daily summary shows it; the
      customer board gets "בדוק את Claude". Tests.
- [x] 4. Full tests, lint, build; `AGENTS.md`; ask to deploy.
- [ ] 5. After deploy (needs Lord): API credit, check button green, one live
      sales reply with the current model, then switch settings to Claude and end
      the model experiment.
