import {
	ShellWorker,
	WorkerShellBackend,
	type WorkerShellBackendOptions,
} from '@cloudflare/computer/backends/worker-shell'

/** Select the Worker Loader shell; celld replaces this factory with its in-process virtual shell. */
export const createComputerShell = (
	options: WorkerShellBackendOptions,
	_host: ConstructorParameters<typeof ShellWorker>[1]['HOST'],
	_context: DurableObjectState,
) => new WorkerShellBackend(options)
