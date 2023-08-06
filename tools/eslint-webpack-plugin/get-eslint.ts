import { cpus } from 'node:os'
import { Worker as JestWorker } from 'jest-worker'
import { ESLint } from 'eslint'

import { getESLintOptions } from './options'
import { jsonStringifyReplacerSortKeys } from './utils'

import type { Options } from './options'

const cache: Record<string, any> = {}

type AsyncTask = () => Promise<void>
type LintTask = (files: string | string[]) => Promise<ESLint.LintResult[]>
type Linter = {
  threads: number
  ESLint: ESLint
  eslint: ESLint
  lintFiles: LintTask
  cleanup: AsyncTask
}
type Worker = JestWorker & { lintFiles: LintTask }

export function loadESLint(options: Options): Linter {
  const { eslintPath } = options

  const { ESLint } = require(eslintPath || 'eslint')

  // Filter out loader options before passing the options to ESLint.
  const eslint = new ESLint(getESLintOptions(options))

  return {
    threads: 1,
    ESLint,
    eslint,
    lintFiles: async (files) => {
      const results = await eslint.lintFiles(files)
      // istanbul ignore else
      if (options.fix) {
        await ESLint.outputFixes(results)
      }
      return results
    },
    // no-op for non-threaded
    cleanup: async () => {},
  }
}

export function loadESLintThreaded(
  key: string | undefined,
  poolSize: number,
  options: Options,
): Linter {
  const cacheKey = getCacheKey(key, options)
  const { eslintPath = 'eslint' } = options
  const source = require.resolve('./worker')
  const workerOptions = {
    enableWorkerThreads: true,
    numWorkers: poolSize,
    setupArgs: [{ eslintPath, eslintOptions: getESLintOptions(options) }],
  }

  const local = loadESLint(options)

  let worker: Worker | null = new JestWorker(source, workerOptions) as Worker

  const context: Linter = {
    ...local,
    threads: poolSize,
    lintFiles: async (files) =>
      (worker && (await worker.lintFiles(files))) ||
      /* istanbul ignore next */ [],
    cleanup: async () => {
      cache[cacheKey] = local
      context.lintFiles = (files) => local.lintFiles(files)
      if (worker) {
        worker.end()
        worker = null
      }
    },
  }

  return context
}

export function getESLint(
  key: string | undefined,
  { threads, ...options }: Options,
): Linter {
  const max =
    typeof threads !== 'number'
      ? threads
        ? cpus().length - 1
        : 1
      : /* istanbul ignore next */
        threads

  const cacheKey = getCacheKey(key, { threads, ...options })
  if (!cache[cacheKey]) {
    cache[cacheKey] =
      max > 1 ? loadESLintThreaded(key, max, options) : loadESLint(options)
  }
  return cache[cacheKey]
}

function getCacheKey(key: string | undefined, options: Options) {
  return JSON.stringify({ key, options }, jsonStringifyReplacerSortKeys)
}
