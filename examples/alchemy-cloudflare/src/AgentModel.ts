import { type FoldModel, openaiModel } from '@humanlayer/fold-core'
import { Config, Context, Effect, Layer } from 'effect'
import { HttpClient } from 'effect/http'

/** The model provider for agent sessions; each host supplies its own authentication. */
export class AgentModel extends Context.Service<AgentModel, FoldModel<HttpClient.HttpClient>>()(
	'alchemy-cloudflare/AgentModel',
) {
	static readonly layerOpenAI = Layer.effect(
		AgentModel,
		Effect.gen(function* () {
			const apiKey = yield* Config.Redacted('OPENAI_API_KEY')
			return openaiModel({ apiKey, model: 'gpt-6.1-sol', reasoning: 'medium' })
		}),
	)
}
