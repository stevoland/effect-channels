/**
 * Bundle `src/entry.ts` with Alchemy's Cloudflare Worker build into `dist/`, which `wrangler.json` deploys
 * with `no_bundle`. celld's own esbuild run lacks the Cloudflare build's plugins, such as the one that loads
 * Photon's WebAssembly, so it cannot bundle this Worker.
 */
import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { WorkerBundle } from 'alchemy/Cloudflare/Workers/Sources/Rolldown'
import { Effect } from 'effect'

import { celldComputerBuildPlugin } from './ComputerBuildPlugin'

const program = Effect.gen(function* () {
	const bundler = yield* WorkerBundle
	const { files } = yield* bundler.build({
		id: 'celld',
		main: new URL('../src/entry.ts', import.meta.url).pathname,
		compatibility: { date: '2026-10-01', flags: ['nodejs_compat'] },
		entry: { kind: 'external' },
		stack: { name: 'ChannelsCelld', stage: 'celld' },
		extraOptions: {
			input: {
				plugins: [celldComputerBuildPlugin],
			},
			/** celld deploys one JavaScript module, so the chunks Cloudflare would load on demand are inlined. */
			output: { dir: new URL('../dist', import.meta.url).pathname, codeSplitting: false, sourcemap: false },
		},
	})
	yield* Effect.logInfo(
		'Bundled Worker',
		files.map((file) => file.path),
	)
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
