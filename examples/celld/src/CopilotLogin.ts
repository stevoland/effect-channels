import { Effect, Redacted, Schema } from 'effect'
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http'

const CLIENT_ID = 'Ov23li8tweQw6odWQebz'
const CopilotApiUrl = Schema.String.check(Schema.isPattern(/^https:\/\/[a-z0-9.-]+\.githubcopilot\.com\/?$/))
const PositiveSeconds = Schema.Int.check(Schema.isGreaterThan(0))
const DeviceAuthorization = Schema.Struct({
	verification_uri: Schema.String,
	user_code: Schema.String,
	device_code: Schema.RedactedFromValue(Schema.String),
	interval: PositiveSeconds,
	expires_in: PositiveSeconds,
})
const AuthorizationResponse = Schema.Struct({
	access_token: Schema.optional(Schema.RedactedFromValue(Schema.String)),
	error: Schema.optional(Schema.String),
	interval: Schema.optional(PositiveSeconds),
})
const CopilotAccount = Schema.Struct({
	chat_enabled: Schema.Boolean,
	endpoints: Schema.Struct({ api: CopilotApiUrl }),
})

/** Persisted Copilot login; its token must only be unwrapped when binding or sending authentication. */
export const CopilotCredential = Schema.Struct({
	token: Schema.RedactedFromValue(Schema.String),
	apiUrl: CopilotApiUrl,
})

/** Safe login failures exclude HTTP bodies and headers, which may contain credentials. */
export class CopilotLoginError extends Schema.TaggedError<CopilotLoginError>()('CopilotLoginError', {
	message: Schema.String,
}) {}

/** Start GitHub device authorization without printing or persisting the device credential. */
export const beginCopilotLogin = Effect.fn('celld.copilot.begin_login')(
	function* () {
		const http = yield* HttpClient.HttpClient
		const request = yield* HttpClientRequest.post('https://github.com/login/device/code').pipe(
			HttpClientRequest.acceptJson,
			HttpClientRequest.setHeader('User-Agent', 'effect-channels-celld'),
			HttpClientRequest.bodyJson({ client_id: CLIENT_ID, scope: 'read:user' }),
		)
		const response = yield* http.execute(request).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))
		return yield* HttpClientResponse.schemaBodyJson(DeviceAuthorization)(response)
	},
	Effect.mapError(() => new CopilotLoginError({ message: 'Copilot login: could not start device authorization' })),
)

/** Poll only pending device authorization; denial, expiry and network errors require another login. */
const pollCopilotLogin = Effect.fn('celld.copilot.poll_login')(
	function* (device: typeof DeviceAuthorization.Type) {
		const http = yield* HttpClient.HttpClient
		let waitSeconds = Math.max(device.interval, 1)
		while (true) {
			yield* Effect.sleep(`${waitSeconds + 3} seconds`)
			const request = yield* HttpClientRequest.post('https://github.com/login/oauth/access_token').pipe(
				HttpClientRequest.acceptJson,
				HttpClientRequest.setHeader('User-Agent', 'effect-channels-celld'),
				HttpClientRequest.bodyJson({
					client_id: CLIENT_ID,
					device_code: Redacted.value(device.device_code),
					grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
				}),
			)
			const response = yield* http.execute(request).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))
			const authorization = yield* HttpClientResponse.schemaBodyJson(AuthorizationResponse)(response)
			if (authorization.access_token !== undefined) {
				const accountResponse = yield* http
					.execute(
						HttpClientRequest.get('https://api.github.com/copilot_internal/user').pipe(
							HttpClientRequest.bearerToken(authorization.access_token),
							HttpClientRequest.setHeaders({
								Accept: 'application/json',
								'User-Agent': 'effect-channels-celld',
								'X-GitHub-Api-Version': '2025-04-01',
							}),
						),
					)
					.pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))
				const account = yield* HttpClientResponse.schemaBodyJson(CopilotAccount)(accountResponse)
				if (!account.chat_enabled) {
					return yield* new CopilotLoginError({
						message: 'Copilot login: this account does not have chat access',
					})
				}
				return { token: authorization.access_token, apiUrl: account.endpoints.api.replace(/\/+$/, '') }
			}
			if (authorization.error === 'slow_down') {
				waitSeconds = Math.max(authorization.interval ?? waitSeconds + 5, waitSeconds + 5)
			} else if (authorization.error !== 'authorization_pending') {
				return yield* new CopilotLoginError({
					message: 'Copilot login: authorization denied or expired; run login again',
				})
			}
		}
	},
	Effect.mapError(
		() =>
			new CopilotLoginError({
				message: 'Copilot login: authorization or account lookup failed; run login again',
			}),
	),
)

/** Stop polling at GitHub's device-code expiry rather than retaining a background login indefinitely. */
export const completeCopilotLogin = Effect.fn('celld.copilot.complete_login')(
	(device: typeof DeviceAuthorization.Type) =>
		pollCopilotLogin(device).pipe(
			Effect.timeoutOrElse({
				duration: `${device.expires_in} seconds`,
				orElse: () => new CopilotLoginError({ message: 'Copilot login: device code expired; run login again' }),
			}),
		),
)
