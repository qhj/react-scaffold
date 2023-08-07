import { resolve } from 'node:path'
import { statSync } from 'node:fs'
import normalizePath from 'normalize-path'

type Return<T> = T extends null | undefined
  ? []
  : T extends Array<infer E> | Iterable<infer E> | ArrayLike<infer E>
  ? E[]
  : [T]

function isObject(value: any) {
  const type = typeof value
  return value !== null && (type === 'object' || type === 'function')
}

function isIterable(value: any): value is Iterable<unknown> {
  return (
    isObject(value) &&
    typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function'
  )
}

function isArrayLike(value: any): value is ArrayLike<unknown> {
  if (!isObject(value)) return false
  const v = value as ArrayLike<unknown>
  return (
    v.hasOwnProperty('length') &&
    typeof v.length === 'number' &&
    (v.length === 0 || (v.length > 0 && v.length - 1 in v))
  )
}

export function toArray<T>(value: T): Return<T> {
  if (value === null || value === undefined) return [] as Return<T>

  if (Array.isArray(value)) return value as Return<T>

  if (isIterable(value) || isArrayLike(value))
    return Array.from(value) as Return<T>

  // non-null primitive types and other object types
  return [value] as Return<T>
}

export function parseFiles(files: string | string[], context: string) {
  return toArray(files).map((file) => normalizePath(resolve(context, file)))
}

export function parseFoldersToGlobs(
  patterns: string | string[],
  extensions: string | string[] = [],
) {
  const extensionsList = toArray(extensions)
  const [prefix, postfix] = extensionsList.length > 1 ? ['{', '}'] : ['', '']
  const extensionsGlob = extensionsList
    .map((extension) => extension.replace(/^\./u, ''))
    .join(',')

  return toArray(patterns).map((pattern) => {
    try {
      // The patterns are absolute because they are prepended with the context.
      const stats = statSync(pattern)
      /* istanbul ignore else */
      if (stats.isDirectory()) {
        return pattern.replace(
          /[/\\]*?$/u,
          `/**${
            extensionsGlob ? `/*.${prefix + extensionsGlob + postfix}` : ''
          }`,
        )
      }
    } catch (_) {
      // Return the pattern as is on error.
    }
    return pattern
  })
}

export const jsonStringifyReplacerSortKeys = (_: string, value: any) => {
  const insert = (sorted: Record<string, any>, key: string | number) => {
    sorted[key] = value[key]
    return sorted
  }

  return value instanceof Object && !(value instanceof Array)
    ? Object.keys(value).sort().reduce(insert, {})
    : value
}
