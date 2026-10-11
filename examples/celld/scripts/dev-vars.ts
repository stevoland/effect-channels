import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { packEnvValue } from 'alchemy/RuntimeContext'
import { Config, Effect, FileSystem, Redacted, Schema } from 'effect'

import { CopilotCredential } from '../src/CopilotLogin'

const program = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem
	const example = yield* fs.readFileString(new URL('../.env.example', import.meta.url).pathname)
	const names = example.split('\n').flatMap((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1] ?? [])
	const lines = yield* Effect.forEach(names, (name) =>
		Config.Redacted(name).pipe(Effect.map((value) => `${name}='${packEnvValue(value)}'`)),
	)
	const login = yield* fs.readFileString(new URL('../.copilot.json', import.meta.url).pathname).pipe(
		Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(CopilotCredential))),
		Effect.mapError(
			() => new Error('Copilot configuration: run bun run copilot:login to create a valid .copilot.json'),
		),
	)
	lines.push(`COPILOT_TOKEN='${packEnvValue(login.token)}'`)
	lines.push(`COPILOT_API_URL='${packEnvValue(Redacted.make(login.apiUrl))}'`)
	const path = new URL('../.dev.vars', import.meta.url).pathname
	if (yield* fs.exists(path)) yield* fs.chmod(path, 0o600)
	yield* fs.writeFileString(path, `${lines.join('\n')}\n`, { mode: 0o600 })
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
