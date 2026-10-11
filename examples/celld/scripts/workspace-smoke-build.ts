import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { WorkerBundle } from 'alchemy/Cloudflare/Workers/Sources/Rolldown'
import { Effect, FileSystem } from 'effect'

import { celldComputerBuildPlugin } from './ComputerBuildPlugin'

const directory = new URL('../.celld/workspace-smoke', import.meta.url).pathname
Effect.gen(function* () {
	const bundler = yield* WorkerBundle
	yield* bundler.build({
		id: 'workspace-smoke',
		main: new URL('../test/WorkspaceSmokeWorker.ts', import.meta.url).pathname,
		compatibility: { date: '2026-10-01', flags: ['nodejs_compat'] },
		entry: { kind: 'external' },
		stack: { name: 'WorkspaceSmoke', stage: 'local' },
		extraOptions: {
			input: {
				plugins: [celldComputerBuildPlugin],
			},
			output: { dir: directory, codeSplitting: false, sourcemap: false },
		},
	})
	const fs = yield* FileSystem.FileSystem
	yield* fs.writeFileString(
		`${directory}/wrangler.json`,
		JSON.stringify({
			name: 'workspace-smoke',
			main: 'WorkspaceSmokeWorker.js',
			no_bundle: true,
			compatibility_date: '2026-10-01',
			compatibility_flags: ['nodejs_compat'],
			durable_objects: { bindings: [{ name: 'Computer', class_name: 'Computer' }] },
			migrations: [{ tag: 'v1', new_sqlite_classes: ['Computer'] }],
			worker_loaders: [{ binding: 'LOADER' }],
		}),
	)
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
