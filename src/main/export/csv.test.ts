import { describe, it, expect } from 'vitest'
import { rowsToCsv, parseCsv } from './csv'
import type { ExportRow } from './model'

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  reqId: 'SRS-1', module: 'Sys', section: '', text: 'The system shall work',
  acceptanceCriteria: '', source: '', rationale: '', entryType: 'Requirement', reqType: 'Functional',
  status: 'Draft', priority: 'Medium', verificationStatus: 'Unverified', derivedFrom: [], custom: {}, ...over
})

describe('rowsToCsv', () => {
  it('quotes fields with commas, quotes, and newlines', () => {
    const csv = rowsToCsv([row({ text: 'a,b "c"\nd' })], [])
    expect(csv).toContain('"a,b ""c""\nd"')
  })
  it('appends cf: columns as the union of custom keys', () => {
    const csv = rowsToCsv([row({ custom: { Owner: 'Jo' } })], ['Owner'])
    const [header] = csv.split('\n')
    expect(header).toContain('cf:Owner')
    expect(csv).toContain('Jo')
  })
  it('joins derived_from with ;', () => {
    const csv = rowsToCsv([row({ derivedFrom: ['SRS-2', 'SRS-3'] })], [])
    expect(csv).toContain('SRS-2;SRS-3')
  })
})

describe('parseCsv', () => {
  it('reads a quoted field with a delimiter and doubled quotes', () => {
    const rows = parseCsv('req_id,module,section,text,acceptance_criteria,source,rationale,type,status,priority,verification_status,derived_from\nSRS-1,Sys,,"a,b ""c""",,,,Functional,Draft,Medium,Unverified,')
    expect(rows[0].text).toBe('a,b "c"')
    expect(rows[0].reqId).toBe('SRS-1')
  })
})

describe('round-trip', () => {
  it('parseCsv(rowsToCsv(rows)) equals the logical rows', () => {
    const rows = [
      row({ reqId: 'SRS-1', section: 'Power > Thermal', derivedFrom: ['SRS-2'], custom: { Owner: 'Jo' }, entryType: 'Heading' }),
      row({ reqId: 'SRS-2', text: 'line1\nline2', priority: 'High' })
    ]
    const parsed = parseCsv(rowsToCsv(rows, ['Owner']))
    expect(parsed[0]).toMatchObject({
      reqId: 'SRS-1', section: 'Power > Thermal', text: 'The system shall work',
      entryType: 'Heading', reqType: 'Functional', status: 'Draft', priority: 'Medium',
      derivedFrom: ['SRS-2'], custom: { Owner: 'Jo' }
    })
    expect(parsed[1]).toMatchObject({ reqId: 'SRS-2', text: 'line1\nline2', priority: 'High' })
  })

  it('round-trips verification_status', () => {
    const row = { reqId: 'R-1', module: '', section: '', text: 'T', acceptanceCriteria: 'AC line 1\nAC line 2',
      source: '', rationale: '', entryType: 'Requirement', reqType: 'Functional', status: 'Draft',
      priority: 'Medium', verificationStatus: 'Passed', derivedFrom: [], custom: {} }
    const csv = rowsToCsv([row as any], [])
    expect(csv.split('\n')[0]).toContain('verification_status')
    const parsed = parseCsv(csv)
    expect(parsed[0].verificationStatus).toBe('Passed')
    expect(parsed[0].acceptanceCriteria).toBe('AC line 1\nAC line 2')
  })
})
