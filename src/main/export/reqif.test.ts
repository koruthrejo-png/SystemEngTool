import { describe, it, expect } from 'vitest'
import { rowsToReqif } from './reqif'
import type { ExportRow } from './model'

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  reqId: 'SRS-1', module: 'Sys', section: '', text: 'shall',
  acceptanceCriteria: '', source: '', rationale: '', entryType: 'Requirement', reqType: 'Functional',
  status: 'Draft', priority: 'Medium', derivedFrom: [], custom: {}, ...over
})
const meta = { projectName: 'Demo', timestamp: '2026-07-22T00:00:00.000Z', identifier: 'urn:x' }

describe('rowsToReqif', () => {
  it('emits a ReqIF envelope with the header metadata', () => {
    const xml = rowsToReqif([row()], [], meta)
    expect(xml).toContain('<REQ-IF')
    expect(xml).toContain('Demo')
    expect(xml).toContain('2026-07-22T00:00:00.000Z')
  })
  it('emits one SPEC-OBJECT per row', () => {
    const xml = rowsToReqif([row({ reqId: 'SRS-1' }), row({ reqId: 'SRS-2' })], [], meta)
    expect(xml.match(/<SPEC-OBJECT /g)?.length).toBe(2)
  })
  it('escapes XML entities in text', () => {
    const xml = rowsToReqif([row({ text: 'a < b & c' })], [], meta)
    expect(xml).toContain('a &lt; b &amp; c')
    expect(xml).not.toContain('a < b & c')
  })
  it('declares the three enumeration datatypes', () => {
    const xml = rowsToReqif([row()], [], meta)
    expect(xml.match(/<DATATYPE-DEFINITION-ENUMERATION /g)?.length).toBe(3)
  })
  it('emits one SPEC-RELATION per derivation link', () => {
    const xml = rowsToReqif([row({ reqId: 'SRS-1', derivedFrom: ['SRS-2'] }), row({ reqId: 'SRS-2' })], [], meta)
    expect(xml.match(/<SPEC-RELATION /g)?.length).toBe(1)
  })
})
