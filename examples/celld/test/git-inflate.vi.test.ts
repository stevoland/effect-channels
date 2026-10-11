import { deflateSync, inflateSync as nativeInflateSync } from 'node:zlib'

import { describe, it } from '@effect/vitest'

import { inflateSync } from '../src/GitInflate'

describe('git packfile inflation', () => {
	it('reports the inflated buffer and exactly how many compressed bytes were consumed', ({ expect }) => {
		const input = Buffer.from('hello packfile')
		const compressed = deflateSync(input)
		const packed = Buffer.concat([compressed, Buffer.from('next packfile object')])
		const result = inflateSync(packed, { info: true })
		expect(result.buffer).toEqual(input)
		expect(result.engine.bytesWritten).toBe(compressed.length)
		expect(nativeInflateSync(packed)).toEqual(input)
	})

	it('reports incomplete chunks as Z_BUF_ERROR so the git reader can fetch more bytes', ({ expect }) => {
		const compressed = deflateSync(Buffer.from('hello packfile'))
		expect(() => inflateSync(compressed.subarray(0, 5), { info: true })).toThrow(
			expect.objectContaining({ code: 'Z_BUF_ERROR', errno: -5 }),
		)
	})

	it('preserves ordinary inflate calls', ({ expect }) => {
		const input = Buffer.from('hello packfile')
		expect(inflateSync(deflateSync(input))).toEqual(input)
	})
})
