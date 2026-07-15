import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

// Guards the item-23 fix (see vitest.config.ts). `better-sqlite3` is built for Electron's
// ABI so the app can run; `better-sqlite3-node` is an npm alias for the same version left at
// its node-ABI prebuild, and vitest aliases the former to the latter so these tests get a
// real SQLite. The whole arrangement is only honest while the two stay on one version.
//
// Read both package.json files from disk rather than importing them: this file runs under
// the alias, so `import 'better-sqlite3/package.json'` would resolve to the test copy and
// compare it against itself.
const versionOf = (dir: string): string =>
  JSON.parse(readFileSync(`node_modules/${dir}/package.json`, 'utf8')).version

describe('better-sqlite3 test/app parity (item 23)', () => {
  it('runs the tests against the same version the app ships', () => {
    // If this fails, someone bumped one and not the other, and every DB test above is now
    // exercising an engine that is not what users get. Bump both, in package.json.
    expect(versionOf('better-sqlite3-node')).toBe(versionOf('better-sqlite3'))
  })

  it('actually opens a native database — not a mock', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (a TEXT)')
    db.prepare('INSERT INTO t VALUES (?)').run(null)

    // The distinction the whole feature set rests on: SQL NULL is not the string 'null'.
    // This is exactly the assertion item 23 used to make un-runnable.
    expect(db.prepare('SELECT typeof(a) AS t FROM t').get()).toEqual({ t: 'null' })
    db.close()
  })
})
