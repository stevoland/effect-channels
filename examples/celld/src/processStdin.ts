/**
 * Workerd's `process.stdin` is a Readable stream; celld's is a plain object with no events. Alchemy's Worker
 * bridge builds Effect's `NodeTerminal`, which listens for `process.stdin`'s `end` event as the Worker starts,
 * so give it the empty stream a Worker has on workerd. Imported first by `entry.ts`.
 */
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'

if (!(process.stdin instanceof EventEmitter)) {
	Object.defineProperty(process, 'stdin', { value: Readable.from([]), configurable: true })
}
