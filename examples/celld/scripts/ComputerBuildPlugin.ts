/** Select celld's shell and git inflation adapters only at the Computer runtime boundaries. */
export const celldComputerBuildPlugin = {
	name: 'celld-computer-runtime',
	transform(code: string, id: string) {
		if (id.endsWith('/alchemy-cloudflare/src/computer/Computer.ts')) {
			return code.replace(
				"from './ComputerShell'",
				`from ${JSON.stringify(new URL('../src/ComputerShell.ts', import.meta.url).pathname)}`,
			)
		}
		if (id.includes('/@cloudflare/computer/') && code.includes('from "node:zlib"')) {
			return code.replace(
				'from "node:zlib"',
				`from ${JSON.stringify(new URL('../src/GitInflate.ts', import.meta.url).pathname)}`,
			)
		}
		return null
	},
}
