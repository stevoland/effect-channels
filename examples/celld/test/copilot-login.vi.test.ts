import { describe, it } from '@effect/vitest'
import { Effect, Fiber, Match, Redacted, Schema } from 'effect'
import { HttpClient, HttpClientResponse } from 'effect/http'
import { TestClock } from 'effect/testing'

import { beginCopilotLogin, completeCopilotLogin, CopilotCredential } from '../src/CopilotLogin'

const device = {
	verification_uri: 'https://github.com/login/device',
	user_code: 'TEST-CODE',
	device_code: Redacted.make('test-device-credential'),
	interval: 1,
	expires_in: 900,
}

describe('Copilot device login', () => {
	it.effect('starts authorization with a redacted device credential', ({ expect }) => {
		const client = HttpClient.make((request) => {
			expect(request.url).toBe('https://github.com/login/device/code')
			expect(request.method).toBe('POST')
			return Effect.succeed(
				HttpClientResponse.fromWeb(
					request,
					Response.json({
						...device,
						device_code: 'test-device-credential',
					}),
				),
			)
		})
		return beginCopilotLogin().pipe(
			Effect.map((result) => {
				expect(Redacted.isRedacted(result.device_code)).toBe(true)
				expect(JSON.stringify(result)).not.toContain('test-device-credential')
				return result
			}),
			Effect.provideService(HttpClient.HttpClient, client),
		)
	})

	it.effect('respects pending and slow-down responses, then discovers the seat endpoint', ({ expect }) => {
		let polls = 0
		const client = HttpClient.make((request) => {
			if (request.url.endsWith('/user')) {
				expect(request.headers.authorization).toBe('Bearer test-oauth-credential')
				return Effect.succeed(
					HttpClientResponse.fromWeb(
						request,
						Response.json({
							chat_enabled: true,
							endpoints: { api: 'https://api.business.githubcopilot.com/' },
						}),
					),
				)
			}
			expect(request.url).toBe('https://github.com/login/oauth/access_token')
			polls += 1
			const response = Match.value(polls).pipe(
				Match.when(1, () => ({ error: 'authorization_pending' })),
				Match.when(2, () => ({ error: 'slow_down', interval: 6 })),
				Match.orElse(() => ({ access_token: 'test-oauth-credential' })),
			)
			return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(response)))
		})
		return Effect.gen(function* () {
			const fiber = yield* completeCopilotLogin(device).pipe(Effect.forkChild)
			yield* TestClock.adjust('4 seconds')
			expect(polls).toBe(1)
			yield* TestClock.adjust('4 seconds')
			expect(polls).toBe(2)
			yield* TestClock.adjust('9 seconds')
			const credential = yield* Fiber.join(fiber)
			expect(credential.apiUrl).toBe('https://api.business.githubcopilot.com')
			expect(Redacted.isRedacted(credential.token)).toBe(true)
			expect(JSON.stringify(credential)).not.toContain('test-oauth-credential')
		}).pipe(Effect.provideService(HttpClient.HttpClient, client))
	})

	for (const scenario of [
		{ name: 'denied authorization', response: { error: 'access_denied' }, status: 200 },
		{ name: 'HTTP failure', response: { access_token: 'must-not-leak' }, status: 500 },
		{ name: 'malformed response', response: { access_token: 123 }, status: 200 },
	]) {
		it.effect(`reports ${scenario.name} without exposing the response`, ({ expect }) => {
			const client = HttpClient.make((request) =>
				Effect.succeed(
					HttpClientResponse.fromWeb(request, Response.json(scenario.response, { status: scenario.status })),
				),
			)
			return Effect.gen(function* () {
				const fiber = yield* completeCopilotLogin(device).pipe(Effect.flip, Effect.forkChild)
				yield* TestClock.adjust('4 seconds')
				const error = yield* Fiber.join(fiber)
				expect(error).toMatchObject({ _tag: 'CopilotLoginError' })
				expect(JSON.stringify(error)).not.toContain('must-not-leak')
			}).pipe(Effect.provideService(HttpClient.HttpClient, client))
		})
	}

	for (const account of [
		{ chat_enabled: false, endpoints: { api: 'https://api.githubcopilot.com' } },
		{ chat_enabled: true, endpoints: { api: 'http://untrusted.example' } },
	]) {
		it.effect('rejects unavailable chat or an unsafe credential destination', ({ expect }) => {
			const client = HttpClient.make((request) =>
				Effect.succeed(
					HttpClientResponse.fromWeb(
						request,
						Response.json(
							request.url.endsWith('/user') ? account : { access_token: 'test-oauth-credential' },
						),
					),
				),
			)
			return Effect.gen(function* () {
				const fiber = yield* completeCopilotLogin(device).pipe(Effect.flip, Effect.forkChild)
				yield* TestClock.adjust('4 seconds')
				expect(yield* Fiber.join(fiber)).toMatchObject({ _tag: 'CopilotLoginError' })
			}).pipe(Effect.provideService(HttpClient.HttpClient, client))
		})
	}

	it.effect('stops waiting when the device code expires', ({ expect }) => {
		let polls = 0
		const client = HttpClient.make((request) => {
			polls += 1
			return Effect.succeed(
				HttpClientResponse.fromWeb(request, Response.json({ error: 'authorization_pending' })),
			)
		})
		return Effect.gen(function* () {
			const fiber = yield* completeCopilotLogin({ ...device, expires_in: 5 }).pipe(Effect.flip, Effect.forkChild)
			yield* TestClock.adjust('5 seconds')
			expect((yield* Fiber.join(fiber)).message).toContain('device code expired')
			expect(polls).toBe(1)
		}).pipe(Effect.provideService(HttpClient.HttpClient, client))
	})

	it('redacts credentials decoded from the local login file', ({ expect }) => {
		const credential = Schema.decodeSync(Schema.fromJsonString(CopilotCredential))(
			JSON.stringify({ token: 'test-local-credential', apiUrl: 'https://api.githubcopilot.com' }),
		)
		expect(JSON.stringify(credential)).not.toContain('test-local-credential')
	})
})
