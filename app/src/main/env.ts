// Loads API keys from .env files at runtime. Keys are never bundled into the build.
import { existsSync, readFileSync } from 'node:fs'

/** Read KEY=VALUE lines into process.env. Earlier files and real env vars win. */
export function loadEnvFiles(files: string[]): string[] {
  const loaded: string[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      const [, key, rawValue] = m
      const value = rawValue.replace(/^(['"])(.*)\1$/, '$2')
      if (process.env[key] === undefined && value !== '') process.env[key] = value
    }
    loaded.push(file)
  }
  return loaded
}
