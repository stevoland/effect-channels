/**
 * The Worker module celld runs. `alchemy deploy` generates this module for a Cloudflare deploy; celld deploys
 * from `wrangler.json`, so it is written out here. Each Durable Object class must also be bound and migrated
 * in `wrangler.json`, under its class name.
 */
import './processStdin'
import { makeDurableObjectBridge, makeWorkerBridge } from 'alchemy/Cloudflare/Bridge'
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'

import worker from './Worker'

type BridgeEntrypoint = Parameters<typeof makeWorkerBridge>[1]['entrypoint']

/**
 * The Worker's resource Effect as the bridges take it. Its type still names Alchemy's deploy-time providers,
 * which the bridges never run; Alchemy's generated module passes it untyped.
 */
function bridgeEntrypoint(effect: typeof worker): BridgeEntrypoint
function bridgeEntrypoint(effect: typeof worker) {
	return effect
}

const meta = { entrypoint: bridgeEntrypoint(worker), stack: { name: 'ChannelsCelld', stage: 'celld' } }

export default makeWorkerBridge(WorkerEntrypoint, meta)

const DurableObjectBridge = makeDurableObjectBridge(DurableObject, meta)

/**
 * A celld Durable Object class over Alchemy's bridge. Before each call, celld resolves a promise with the
 * Durable Object instance (`_readyInstance` in its harness), so an instance whose `then` is a function is
 * taken for a promise. Alchemy's bridge answers every property it does not have with an RPC method, `then`
 * included, so every call would wait forever on a `then` that never settles. An own `then` of `undefined` is
 * what the bridge then answers. Remove it once celld stops resolving promises with the instance.
 */
const CelldDurableObject = (className: string) =>
	class extends DurableObjectBridge(className) {
		readonly then = undefined
	}

export class DeliveryMailbox extends CelldDurableObject('DeliveryMailbox') {}
export class AgentSession extends CelldDurableObject('AgentSession') {}

/**
 * On Cloudflare the Computer runs in its own Worker. A celld fleet runs one script, so it runs in this one.
 * celld has no outbound interception for containers, so only its `shell` backend works.
 */
export { Computer, WorkspaceProxy, WorkspaceServiceProxy } from '../../alchemy-cloudflare/src/computer/Computer'
