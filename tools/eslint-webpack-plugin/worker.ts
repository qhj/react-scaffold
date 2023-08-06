import { ESLint } from 'eslint'

let eslint: ESLint

let fix: boolean

// setup worker
interface SetupOptions {
  eslintPath?: string
  eslintOptions?: ESLint.Options
}

export function setup({ eslintPath, eslintOptions = {} }: SetupOptions) {
  fix = !!(eslintOptions && eslintOptions.fix)
  import(eslintPath || 'eslint').then(({ ESLint }) => {
    eslint = new ESLint(eslintOptions)
  })
}

export async function lintFiles(files: string | string[]) {
  const result = await eslint.lintFiles(files)
  // if enabled, use eslint autofixing where possible
  if (fix) {
    await ESLint.outputFixes(result)
  }
  return result
}
