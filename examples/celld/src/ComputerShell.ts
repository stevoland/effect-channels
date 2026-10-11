import {
	ShellWorker,
	WorkerShellBackend,
	type WorkerShellBackendOptions,
} from '@cloudflare/computer/backends/worker-shell'

/** ShellWorker only retains this context; it never uses the HTTP-only ExecutionContext methods. */
function shellWorkerContext(context: DurableObjectState): ConstructorParameters<typeof ShellWorker>[0]
function shellWorkerContext(context: DurableObjectState | ConstructorParameters<typeof ShellWorker>[0]) {
	return context
}

class LocalComputerShellWorker extends ShellWorker {
	/** Match the loader shell's default denied network egress even though this Worker also hosts GitHub HTTP clients. */
	protected override readonly shellOptions = { fetch: null }
}

/** Keep Computer's virtual shell beside its SQLite workspace because celld cannot pass its RPC targets to a loaded Worker. */
export const createComputerShell = (
	options: WorkerShellBackendOptions,
	host: ConstructorParameters<typeof ShellWorker>[1]['HOST'],
	context: DurableObjectState,
) =>
	new WorkerShellBackend({
		id: options.id,
		source: {
			type: 'external-runtime',
			connect: () => new LocalComputerShellWorker(shellWorkerContext(context), { HOST: host }),
		},
	})
