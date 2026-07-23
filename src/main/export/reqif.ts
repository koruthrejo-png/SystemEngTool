import type { ExportRow } from './model'
import { escapeXml } from './model'
import { REQUIREMENT_TYPES, REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, VERIFICATION_STATUSES } from '../../types'

// Stable-ish id derived from a reqId (ReqIF IDENTIFIERs must be unique within a file).
const objId = (reqId: string): string => `SPEC-OBJECT-${reqId.replace(/[^a-zA-Z0-9_-]/g, '_')}`

const STRING_ATTRS = ['reqId', 'section', 'text', 'acceptanceCriteria', 'source', 'rationale', 'entryType'] as const
const ENUMS: Record<string, readonly string[]> = {
  type: REQUIREMENT_TYPES, status: REQUIREMENT_STATUSES, priority: REQUIREMENT_PRIORITIES,
  verificationStatus: VERIFICATION_STATUSES
}

function enumDatatype(name: string, values: readonly string[]): string {
  const vals = values.map((v, i) =>
    `<ENUM-VALUE IDENTIFIER="ENUMVAL-${name}-${i}" LONG-NAME="${escapeXml(v)}"><PROPERTIES><EMBEDDED-VALUE KEY="${i}" OTHER-CONTENT=""/></PROPERTIES></ENUM-VALUE>`
  ).join('')
  return `<DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="DT-ENUM-${name}" LONG-NAME="${name}"><SPECIFIED-VALUES>${vals}</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION>`
}

function attrDefsString(customKeys: string[]): string {
  const defs = [...STRING_ATTRS, ...customKeys.map((k) => `cf:${k}`)]
  return defs.map((name) =>
    `<ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-STR-${escapeXml(name)}" LONG-NAME="${escapeXml(name)}"><TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>`
  ).join('')
}

function attrDefsEnum(): string {
  return Object.keys(ENUMS).map((name) =>
    `<ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="AD-ENUM-${name}" LONG-NAME="${name}" MULTI-VALUED="false"><TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>DT-ENUM-${name}</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE></ATTRIBUTE-DEFINITION-ENUMERATION>`
  ).join('')
}

function specObject(r: ExportRow, customKeys: string[]): string {
  const strVals = [
    ['reqId', r.reqId], ['section', r.section], ['text', r.text],
    ['acceptanceCriteria', r.acceptanceCriteria], ['source', r.source], ['rationale', r.rationale],
    ['entryType', r.entryType],
    ...customKeys.map((k) => [`cf:${k}`, r.custom[k] ?? ''])
  ].map(([name, val]) =>
    `<ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(val)}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>AD-STR-${escapeXml(name)}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`
  ).join('')
  const enumVals = [['type', r.reqType], ['status', r.status], ['priority', r.priority], ['verificationStatus', r.verificationStatus]].map(([name, val]) => {
    const i = ENUMS[name].indexOf(val)
    return `<ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>AD-ENUM-${name}</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES><ENUM-VALUE-REF>ENUMVAL-${name}-${i}</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION>`
  }).join('')
  return `<SPEC-OBJECT IDENTIFIER="${objId(r.reqId)}" LONG-NAME="${escapeXml(r.reqId)}"><VALUES>${strVals}${enumVals}</VALUES><TYPE><SPEC-OBJECT-TYPE-REF>SOT-REQ</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>`
}

function specRelations(rows: ExportRow[]): string {
  const known = new Set(rows.map((r) => r.reqId))
  const rels: string[] = []
  let n = 0
  for (const r of rows) {
    for (const parent of r.derivedFrom) {
      if (!known.has(parent)) continue
      rels.push(`<SPEC-RELATION IDENTIFIER="REL-${n++}"><SOURCE><SPEC-OBJECT-REF>${objId(r.reqId)}</SPEC-OBJECT-REF></SOURCE><TARGET><SPEC-OBJECT-REF>${objId(parent)}</SPEC-OBJECT-REF></TARGET><TYPE><SPEC-RELATION-TYPE-REF>SRT-DERIVE</SPEC-RELATION-TYPE-REF></TYPE></SPEC-RELATION>`)
    }
  }
  return rels.join('')
}

export function rowsToReqif(
  rows: ExportRow[],
  customKeys: string[],
  meta: { projectName: string; timestamp: string; identifier: string }
): string {
  const specHierarchy = rows.map((r, i) =>
    `<SPEC-HIERARCHY IDENTIFIER="SH-${i}"><OBJECT><SPEC-OBJECT-REF>${objId(r.reqId)}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
<THE-HEADER><REQ-IF-HEADER IDENTIFIER="${escapeXml(meta.identifier)}"><CREATION-TIME>${escapeXml(meta.timestamp)}</CREATION-TIME><TITLE>${escapeXml(meta.projectName)}</TITLE><REQ-IF-TOOL-ID>ReqArch</REQ-IF-TOOL-ID><SOURCE-TOOL-ID>ReqArch</SOURCE-TOOL-ID><REPOSITORY-ID>${escapeXml(meta.projectName)}</REPOSITORY-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
<CORE-CONTENT><REQ-IF-CONTENT>
<DATATYPES>
<DATATYPE-DEFINITION-STRING IDENTIFIER="DT-STRING" LONG-NAME="String" MAX-LENGTH="32000"/>
${enumDatatype('type', REQUIREMENT_TYPES)}
${enumDatatype('status', REQUIREMENT_STATUSES)}
${enumDatatype('priority', REQUIREMENT_PRIORITIES)}
${enumDatatype('verificationStatus', VERIFICATION_STATUSES)}
</DATATYPES>
<SPEC-TYPES>
<SPEC-OBJECT-TYPE IDENTIFIER="SOT-REQ" LONG-NAME="Requirement"><SPEC-ATTRIBUTES>${attrDefsString(customKeys)}${attrDefsEnum()}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
<SPEC-RELATION-TYPE IDENTIFIER="SRT-DERIVE" LONG-NAME="Derives"/>
</SPEC-TYPES>
<SPEC-OBJECTS>${rows.map((r) => specObject(r, customKeys)).join('')}</SPEC-OBJECTS>
<SPEC-RELATIONS>${specRelations(rows)}</SPEC-RELATIONS>
<SPECIFICATIONS><SPECIFICATION IDENTIFIER="SPEC-1" LONG-NAME="${escapeXml(meta.projectName)}"><CHILDREN>${specHierarchy}</CHILDREN></SPECIFICATION></SPECIFICATIONS>
</REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`
}
