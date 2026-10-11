import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { defineAgent, startSession } from '@humanlayer/fold-core'
import { ConfigProvider, Effect, FileSystem, Layer, Redacted, Schema } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { AgentModel } from '../../alchemy-cloudflare/src/AgentModel'
import { CopilotCredential } from '../src/CopilotLogin'
import { CopilotModelLive } from '../src/CopilotModel'

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem
	const login = yield* fs.readFileString(new URL('../.copilot.json', import.meta.url).pathname).pipe(
		Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(CopilotCredential))),
		Effect.mapError(() => new Error('Copilot smoke: run bun run copilot:login first')),
	)
	yield* Effect.gen(function* () {
		const model = yield* AgentModel
		const session = yield* startSession({
			agent: defineAgent({
				name: 'copilot-smoke',
				model,
				tools: [],
				systemPrompt: 'You are a helpful assistant.',
			}),
		})
		const finished = yield* session.send('Reply with exactly the word hello.')
		const textLength = finished.resultText?.length ?? 0
		yield* Effect.logInfo('Copilot smoke result', { outcome: finished.outcome, textLength })
		if (finished.outcome !== 'completed' || textLength === 0) {
			return yield* Effect.fail(new Error('Copilot smoke: Fold did not return an answer'))
		}
	}).pipe(
		Effect.scoped,
		Effect.provide(
			CopilotModelLive.pipe(
				Layer.provide(
					ConfigProvider.layer(
						ConfigProvider.fromUnknown({
							COPILOT_TOKEN: Redacted.value(login.token),
							COPILOT_API_URL: login.apiUrl,
						}),
					),
				),
			),
		),
	)
})

program.pipe(
	Effect.provide(FetchHttpClient.layer),
	Effect.provide(NodeServices.layer),
	Effect.mapError(() => new Error('Copilot smoke failed; check login, model access and network connectivity')),
	NodeRuntime.runMain,
)
