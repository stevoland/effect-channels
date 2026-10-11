import { Computer, WorkspaceProxy, WorkspaceServiceProxy } from '../../alchemy-cloudflare/src/computer/Computer'

export { Computer, WorkspaceProxy, WorkspaceServiceProxy }

export default {
	async fetch(_request: Request, env: { Computer: DurableObjectNamespace<Computer> }) {
		const computer = env.Computer.get(env.Computer.idFromName('workspace-smoke'))
		await computer.mkdir('/workspace', true)
		await computer.writeFile('/workspace/sample.txt', 'hello workspace\n')
		const read = await computer.readFile('/workspace/sample.txt')
		const shell = await computer.exec({
			backend: 'shell',
			cwd: '/workspace',
			command: 'cat sample.txt',
			timeoutMs: 5000,
		})
		const pipeline = await computer.exec({
			backend: 'shell',
			cwd: '/workspace',
			command: 'cat sample.txt | grep hello > copied.txt && cat copied.txt',
			timeoutMs: 5000,
		})
		const jq = await computer.exec({
			backend: 'shell',
			cwd: '/workspace',
			command: 'echo \'{"answer":42}\' | jq .answer',
			timeoutMs: 5000,
		})
		const missing = await computer.readFile('/workspace/missing.txt')
		const readText = read.ok ? new TextDecoder().decode(read.value) : null
		const passed =
			readText === 'hello workspace\n' &&
			shell.ok &&
			shell.value.exitCode === 0 &&
			shell.value.stdout === readText &&
			pipeline.ok &&
			pipeline.value.exitCode === 0 &&
			pipeline.value.stdout === readText &&
			jq.ok &&
			jq.value.exitCode === 0 &&
			jq.value.stdout === '42\n' &&
			!missing.ok &&
			missing.code === 'ENOENT'
		return Response.json(
			{ passed, read: read.ok ? { ok: true, text: readText } : read, shell, pipeline, jq, missing },
			{ status: passed ? 200 : 500 },
		)
	},
}
