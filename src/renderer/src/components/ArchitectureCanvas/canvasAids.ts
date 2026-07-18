// App-wide toggles for the on-canvas visual aids. A neutral leaf module so both
// the store and the canvas render code can import it without a cycle (the store
// already imports helpers from ./nodes). One JSON map under one localStorage key
// (like the InterfaceRegister column-visibility pref); all default on, so the
// canvas looks unchanged until the user opts out.
export type AidKey = 'connectionNames' | 'connectionIds' | 'nested' | 'contains' | 'connectionCount' | 'objectId' | 'objectName'
export type CanvasAids = Record<AidKey, boolean>

export const CANVAS_AIDS_DEFAULTS: CanvasAids = {
  connectionNames: true, connectionIds: true, nested: true, contains: true, connectionCount: true, objectId: true, objectName: true
}

export const CANVAS_AIDS_KEY = 'reqarch.prefs.canvasAids'
