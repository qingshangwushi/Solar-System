/**
 * Shared ingestion utilities for the astronomy data pipeline.
 *
 * The pipeline keeps authoritative source data (JPL, NASA/NSSDC, HYG) separate
 * from the Web application, as required by the project's "data ingestion ->
 * normalized catalog -> web application" architecture.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SOURCE_DIR = path.join(ROOT, 'data', 'sources')
export const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data')

/** HTTP GET returning text. Node's global fetch honours HTTP(S)_PROXY when NODE_USE_ENV_PROXY=1. */
export async function httpText(url, { retries = 4, timeoutMs = 60_000, headers = {} } = {}) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'solar-system-explorer-pipeline/1.0', ...headers },
      })
      clearTimeout(timer)
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
      const text = await response.text()
      if (!text || text.length < 2) throw new Error(`empty response for ${url}`)
      return text
    } catch (error) {
      lastError = error
      const wait = 750 * attempt
      process.stderr.write(`  ! ${String(error)} (attempt ${attempt}/${retries}, retrying in ${wait}ms)\n`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw new Error(`failed to fetch ${url}: ${String(lastError)}`)
}

export async function httpJson(url, options) {
  const text = await httpText(url, options)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`invalid JSON from ${url}: ${String(error)}`)
  }
}

export async function httpBuffer(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function writeJson(file, value, { pretty = true } = {}) {
  await ensureDir(path.dirname(file))
  const json = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)
  await writeFile(file, `${json}\n`, 'utf8')
  process.stdout.write(`  -> ${path.relative(ROOT, file)} (${(json.length / 1024).toFixed(1)} KB)\n`)
}

/** Builds a query string with RFC 3986 percent-encoding (spaces become %20, not '+'). */
export function encodeQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

export async function writeText(file, text) {
  await ensureDir(path.dirname(file))
  await writeFile(file, text, 'utf8')
  process.stdout.write(`  -> ${path.relative(ROOT, file)} (${(text.length / 1024).toFixed(1)} KB)\n`)
}

export async function writeBuffer(file, buffer) {
  await ensureDir(path.dirname(file))
  await writeFile(file, buffer)
  process.stdout.write(`  -> ${path.relative(ROOT, file)} (${(buffer.byteLength / 1024).toFixed(1)} KB)\n`)
}

export async function fileExists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function versionStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

export function log(message) {
  process.stdout.write(`${message}\n`)
}

/** Minimal HTML table/text scraper used for the NASA/NSSDC fact sheets. */
export function htmlToRows(html) {
  const rows = []
  const rowMatches = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  for (const row of rowMatches) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
      decodeEntities(match[1].replace(/<[^>]+>/g, ' ')),
    )
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

export function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "1,345.5" | "2 575" | "S" -> number | null */
export function parseNumber(value) {
  if (value === undefined || value === null) return null
  const cleaned = String(value).replace(/,/g, '').replace(/\s+/g, '').replace(/[^0-9.+\-eE]/g, '')
  if (cleaned === '' || cleaned === '.' || cleaned === '-' || cleaned === '+') return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/** "208 x 197 x 191" -> 197 (mean of the three axes) */
export function parseMeanRadius(value) {
  const parts = String(value)
    .split(/x/i)
    .map((part) => parseNumber(part))
    .filter((part) => part !== null && part > 0)
  if (parts.length === 0) return null
  return parts.reduce((sum, part) => sum + part, 0) / parts.length
}

export async function listFiles(dir) {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}