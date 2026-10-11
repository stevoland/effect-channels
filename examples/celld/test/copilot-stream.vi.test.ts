import { describe, it } from '@effect/vitest'
import { customModel, defineAgent, startSession, openaiModel } from '@humanlayer/fold-core'
import { Effect, Stream } from 'effect'
import { LanguageModel } from 'effect/ai'

import { normalizeCopilotModel, normalizeCopilotStream } from '../src/CopilotStream'

describe('Copilot stream IDs', () => {
	it.effect('preserves the final answer through a real Fold session when Copilot changes IDs', ({ expect }) =>
		Effect.gen(function* () {
			const language = yield* LanguageModel.make({
				generateText: () => Effect.die('Unexpected non-streaming model request'),
				streamText: () =>
					Stream.fromIterable([
						{ type: 'text-start' as const, id: 'start-id' },
						{ type: 'text-delta' as const, id: 'delta-id', delta: 'hello' },
						{ type: 'text-end' as const, id: 'end-id' },
					]),
			})
			const descriptor = customModel({
				activeModel: openaiModel({ apiKey: 'test', model: 'test' }).activeModel,
				make: Effect.succeed(normalizeCopilotModel(language)),
			})
			const session = yield* startSession({ agent: defineAgent({ name: 'test', model: descriptor, tools: [] }) })
			const finished = yield* session.send('Say hello')
			expect(finished.resultText).toBe('hello')
		}),
	)

	it.effect('keeps separate text and reasoning blocks and resets state on each stream consumption', ({ expect }) =>
		Effect.gen(function* () {
			const stream = normalizeCopilotStream(
				Stream.fromIterable([
					{ type: 'reasoning-start', id: 'reasoning-1' },
					{ type: 'reasoning-delta', id: 'changed-reasoning' },
					{ type: 'text-start', id: 'text-1' },
					{ type: 'text-delta', id: 'changed-text' },
					{ type: 'reasoning-end', id: 'changed-reasoning-end' },
					{ type: 'text-end', id: 'changed-text-end' },
					{ type: 'text-start', id: 'text-2' },
					{ type: 'text-delta', id: 'changed-text-2' },
					{ type: 'text-end', id: 'changed-text-end-2' },
				]),
			)
			const expected = [
				'reasoning-1',
				'reasoning-1',
				'text-1',
				'text-1',
				'reasoning-1',
				'text-1',
				'text-2',
				'text-2',
				'text-2',
			]
			const results = yield* Effect.all([Stream.runCollect(stream), Stream.runCollect(stream)], {
				concurrency: 2,
			})
			for (const parts of results) expect(parts.map((part) => part.id)).toEqual(expected)
		}),
	)
})
