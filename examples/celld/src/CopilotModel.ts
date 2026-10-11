import { openaiModel } from '@humanlayer/fold-core'
import { Config, Effect, Layer } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'

import { AgentModel } from '../../alchemy-cloudflare/src/AgentModel'
import { normalizeCopilotModel } from './CopilotStream'

/** Copilot authentication is confined to the model client, never the GitHub App's client. */
export const CopilotModelLive = Layer.effect(
	AgentModel,
	Effect.gen(function* () {
		const apiKey = yield* Config.Redacted('COPILOT_TOKEN')
		const baseUrl = yield* Config.String('COPILOT_API_URL')
		const modelId = yield* Config.String('COPILOT_MODEL').pipe(Config.withDefault('gpt-6.1-sol'))
		const model = openaiModel({
			apiKey,
			baseUrl,
			model: modelId,
			reasoning: 'medium',
			providerId: 'github-copilot',
		})
		return {
			...model,
			make: Effect.gen(function* () {
				const http = yield* HttpClient.HttpClient
				const copilot = http.pipe(
					HttpClient.mapRequest(
						HttpClientRequest.setHeaders({
							'User-Agent': 'effect-channels-celld',
							'Openai-Intent': 'conversation-edits',
							'X-GitHub-Api-Version': '2026-08-01',
							'X-Interaction-Type': 'conversation-agent',
							'x-initiator': 'agent',
						}),
					),
				)
				const language = yield* model.make.pipe(Effect.provideService(HttpClient.HttpClient, copilot))
				return normalizeCopilotModel(language)
			}),
		}
	}),
)
