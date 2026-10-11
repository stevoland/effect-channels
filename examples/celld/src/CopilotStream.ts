import { Stream } from 'effect'
import type { LanguageModel } from 'effect/ai'

/** Copilot changes text and reasoning item IDs mid-stream; Fold needs one stable ID per active block. */
export const normalizeCopilotStream = <A extends { readonly type: string; readonly id?: string }, E, R>(
	stream: Stream.Stream<A, E, R>,
) =>
	Stream.suspend(() => {
		let textId: string | undefined
		let reasoningId: string | undefined
		return stream.pipe(
			Stream.map((part): A => {
				if (part.type === 'text-start') textId = part.id
				if (part.type === 'reasoning-start') reasoningId = part.id
				if (part.type === 'text-delta' || part.type === 'text-end') {
					const normalized = { ...part, id: textId ?? part.id }
					if (part.type === 'text-end') textId = undefined
					return normalized
				}
				if (part.type === 'reasoning-delta' || part.type === 'reasoning-end') {
					const normalized = { ...part, id: reasoningId ?? part.id }
					if (part.type === 'reasoning-end') reasoningId = undefined
					return normalized
				}
				return part
			}),
		)
	})

/** Preserve the model's overloaded tool types while adapting only its streaming method. */
export const normalizeCopilotModel = (language: LanguageModel.LanguageModel): LanguageModel.LanguageModel =>
	new Proxy(language, {
		get(target, property) {
			if (property === 'streamText') {
				return (options: Parameters<typeof language.streamText>[0]) =>
					normalizeCopilotStream(target.streamText(options))
			}
			if (property === 'generateText') return target.generateText
			if (property === 'generateObject') return target.generateObject
			if (property === '~effect/ai/LanguageModel') return target['~effect/ai/LanguageModel']
			return undefined
		},
	})
