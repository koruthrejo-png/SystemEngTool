import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

let settingsPath = ''

export function initSettings(userDataPath: string): void {
  settingsPath = join(userDataPath, 'settings.json')
}

function read(): Record<string, unknown> {
  if (!settingsPath || !existsSync(settingsPath)) return {}
  try { return JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { return {} }
}

function write(data: Record<string, unknown>): void {
  writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function getLastProjectPath(): string | null {
  return (read().lastProjectPath as string) ?? null
}

export function setLastProjectPath(filePath: string): void {
  write({ ...read(), lastProjectPath: filePath })
}
