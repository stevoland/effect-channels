/**
 * The Ingress Worker of the alchemy-cloudflare example, for celld. It reuses that example's bot, mailbox and
 * AgentSession, and leaves out what celld has no equivalent for: Workers AI, so issues and pull requests are
 * not auto-labeled.
 */
import * as NodeCrypto from '@effect/platform-node/NodeCrypto'
import { DeliveryMailboxes } from '@humanlayer/channels-alchemy-cloudflare'
import { GitHubApiLive } from '@humanlayer/channels-github'
import { Photon } from '@humanlayer/fold-agent/tools/files'
import * as Cloudflare from 'alchemy/Cloudflare'
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpRouter } from 'effect/http'

import { AgentSession, AgentSessionDOLive, AgentSessions } from '../../alchemy-cloudflare/src/AgentSessionDO'
import { AutoLabel } from '../../alchemy-cloudflare/src/AutoLabel'
import { DELIVERY_API_BINDING, DeliveryApi } from '../../alchemy-cloudflare/src/DeliveryApi'
import { DeliveryMailbox, DeliveryMailboxDOLive } from '../../alchemy-cloudflare/src/DeliveryMailboxDO'
import { bot } from '../../alchemy-cloudflare/src/GithubBot'
import { CopilotModelLive } from './CopilotModel'

const ChannelsDeliveryMailboxesLive = Layer.effect(DeliveryMailboxes, DeliveryMailbox)

const AgentSessionsLive = Layer.effect(AgentSessions, AgentSession)

/** celld has no Workers AI binding, so new issues and pull requests keep the labels they were opened with. */
const AutoLabelDisabled = Layer.succeed(
	AutoLabel,
	AutoLabel.of({ apply: () => Effect.logInfo('GitHub auto-label skipped: Workers AI is not available on celld') }),
)

const { mailboxDelivery, deliveryControl } = bot.layers.worker

const RoutesLive = Layer.merge(bot.routes, bot.deliveryApi).pipe(
	Layer.provide(Layer.merge(mailboxDelivery, deliveryControl)),
)

const WorkerLive = ChannelsDeliveryMailboxesLive.pipe(
	Layer.provideMerge(DeliveryMailboxDOLive),
	Layer.provideMerge(AgentSessionsLive),
	Layer.provideMerge(AgentSessionDOLive),
	Layer.provideMerge(CopilotModelLive),
	Layer.provideMerge(DeliveryApi.layerSelfBinding),
	Layer.provideMerge(AutoLabelDisabled),
	Layer.provideMerge(GitHubApiLive),
	Layer.provideMerge(Photon.layer),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(NodeCrypto.layer),
	Layer.provideMerge(Layer.succeed(HttpRouter.RouterConfig, bot.routerConfig)),
)

/**
 * celld reads the bindings from `wrangler.json`, not from these props: `name` there and `DELIVERY_API` in its
 * `services` must match the values here.
 */
export default Cloudflare.Worker(
	'IngressWorker',
	{
		main: import.meta.url,
		compatibility: { date: '2026-10-01' },
		name: 'humanlayer-channels-celld',
		env: { [DELIVERY_API_BINDING]: Cloudflare.Workers.Self },
	},
	Effect.gen(function* () {
		const fetch = yield* HttpRouter.toHttpEffect(RoutesLive)
		return { fetch }
	}).pipe(Effect.provide(WorkerLive)),
)
