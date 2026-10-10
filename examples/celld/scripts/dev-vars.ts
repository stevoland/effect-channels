/**
 * Write `.dev.vars` for `celld dev`: each variable `.env.example` names, read from the environment (Bun loads
 * `.env`). Each value is packed as `alchemy deploy` packs a bound `Config` value, because Alchemy's runtime
 * JSON-parses every binding: an unpacked App ID such as `12345` would arrive as a number.
 */
import { packEnvValue } from 'alchemy/RuntimeContext'
import { Redacted } from 'effect'

const example = await Bun.file(new URL('../.env.example', import.meta.url)).text()
const names = example.split('\n').flatMap((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1] ?? [])

const missing = names.filter((name) => process.env[name] === undefined)
if (missing.length > 0) throw new Error(`Set these in examples/celld/.env: ${missing.join(', ')}`)

const lines = names.map((name) => `${name}='${packEnvValue(Redacted.make(process.env[name]))}'`)
await Bun.write(new URL('../.dev.vars', import.meta.url), `${lines.join('\n')}\n`)
