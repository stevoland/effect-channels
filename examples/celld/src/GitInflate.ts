import { Buffer } from 'node:buffer'

import { Schema } from 'effect'
import { Inflate } from 'pako'

export * from 'node:zlib'

type InflateInfo = { readonly buffer: Buffer; readonly engine: { readonly bytesWritten: number } }
type InflateOptions = { readonly info?: boolean; readonly raw?: boolean }
const InflateState = Schema.Struct({ ended: Schema.Boolean, strm: Schema.Struct({ total_in: Schema.Int }) })

/** Git packfiles need Node's info result and consumed-byte count, which celld 0.6.2 does not implement. */
export function inflateSync(input: Uint8Array, options: InflateOptions & { readonly info: true }): InflateInfo
export function inflateSync(input: Uint8Array, options?: InflateOptions & { readonly info?: false }): Buffer
export function inflateSync(input: Uint8Array, options: InflateOptions = {}): InflateInfo | Buffer {
	const inflater = new Inflate({ raw: options.raw })
	inflater.push(input, false)
	const state = Schema.decodeUnknownSync(InflateState)(inflater)
	if (inflater.err !== 0 || !state.ended) {
		const incomplete = inflater.err === 0 || inflater.err === -5
		throw Object.assign(new Error('Git packfile inflation failed'), {
			code: incomplete ? 'Z_BUF_ERROR' : 'Z_DATA_ERROR',
			errno: incomplete ? -5 : -3,
		})
	}
	const buffer = Buffer.from(inflater.result)
	return options.info === true ? { buffer, engine: { bytesWritten: state.strm.total_in } } : buffer
}

/** Raw inflation shares the same consumed-byte contract as zlib-wrapped packfile objects. */
export function inflateRawSync(input: Uint8Array, options: InflateOptions & { readonly info: true }): InflateInfo
export function inflateRawSync(input: Uint8Array, options?: InflateOptions & { readonly info?: false }): Buffer
export function inflateRawSync(input: Uint8Array, options: InflateOptions = {}): InflateInfo | Buffer {
	return options.info === true ? inflateSync(input, { raw: true, info: true }) : inflateSync(input, { raw: true })
}
