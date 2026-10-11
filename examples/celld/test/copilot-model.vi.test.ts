import { describe, it } from '@effect/vitest'
import { ConfigProvider, Effect, Layer } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'

import { AgentModel } from '../../alchemy-cloudflare/src/AgentModel'
import { CopilotModelLive } from '../src/CopilotModel'

describe('celld Copilot model', () => {
	it.effect('uses the Copilot endpoint and headers only inside the model client', ({ expect }) => {
		let requested = false
		const client = HttpClient.make((request) => {
			requested = true
			expect(request.url).toBe('https://api.business.githubcopilot.com/responses')
			expect(request.headers.authorization).toBe('Bearer test-copilot-credential')
			expect(request.headers['x-initiator']).toBe('agent')
			expect(request.headers['x-interaction-type']).toBe('conversation-agent')
			expect(request.headers['openai-intent']).toBe('conversation-edits')
			return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({}, { status: 500 })))
		})
		return Effect.gen(function* () {
			const model = yield* AgentModel
			expect(model.activeModel.providerId).toBe('github-copilot')
			expect(model.activeModel.modelId).toBe('gpt-6.1-sol')
			const language = yield* model.make
			yield* language.generateText({ prompt: 'Hello' }).pipe(Effect.exit)
			expect(requested).toBe(true)
			expect(JSON.stringify(model.provider)).not.toContain('test-copilot-credential')
		}).pipe(
			Effect.scoped,
			Effect.provide(
				CopilotModelLive.pipe(
					Layer.provide(
						ConfigProvider.layer(
							ConfigProvider.fromUnknown({
								COPILOT_TOKEN: 'test-copilot-credential',
								COPILOT_API_URL: 'https://api.business.githubcopilot.com',
							}),
						),
					),
				),
			),
			Effect.provideService(HttpClient.HttpClient, client),
		)
	})

	it.effect('keeps the Cloudflare host on OpenAI without requiring Copilot configuration', ({ expect }) =>
		Effect.gen(function* () {
			const model = yield* AgentModel
			expect(model.activeModel.providerId).toBe('openai')
			expect(model.activeModel.modelId).toBe('gpt-6.1-sol')
		}).pipe(
			Effect.provide(
				AgentModel.layerOpenAI.pipe(
					Layer.provide(
						ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENAI_API_KEY: 'test-openai-credential' })),
					),
				),
			),
		),
	)
})
