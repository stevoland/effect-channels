import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Effect, FileSystem, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { beginCopilotLogin, completeCopilotLogin } from '../src/CopilotLogin'

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem
	const path = new URL('../.copilot.json', import.meta.url).pathname
	if (yield* fs.exists(path)) {
		return yield* Effect.fail(
			new Error('Copilot login: .copilot.json already exists; remove it yourself to sign in again'),
		)
	}
	const device = yield* beginCopilotLogin()
	yield* Effect.logInfo(`Sign in at ${device.verification_uri} and enter code ${device.user_code}`)
	const credential = yield* completeCopilotLogin(device)
	yield* fs.writeFileString(
		path,
		JSON.stringify({ token: Redacted.value(credential.token), apiUrl: credential.apiUrl }),
		{
			mode: 0o600,
			flag: 'wx',
		},
	)
	yield* Effect.logInfo('Copilot login saved locally. Run bun run dev next. No token was printed.')
})

program.pipe(Effect.provide(FetchHttpClient.layer), Effect.provide(NodeServices.layer), NodeRuntime.runMain)
