// Compiles the native selection helper with the Windows-inbox .NET Framework
// compiler (C:\Windows\Microsoft.NET\...\csc.exe) - no SDK or VS required, and
// the produced exe has zero redistribution dependencies (SPEC §2A).
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const windir = process.env.windir || 'C:\\Windows'
const candidates = [
  join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
]

const csc = candidates.find((p) => existsSync(p))
if (!csc) {
  console.error('[build-helper] inbox csc.exe not found (tried Framework64/Framework v4.0.30319)')
  process.exit(1)
}

const frameworkDir = dirname(csc)
const wpfDir = join(frameworkDir, 'WPF')
// csc treats forward slashes as option prefixes - paths must use backslashes
const source = 'src\\helper\\promptly-helper.cs'
const outDir = 'build\\helper'
const outFile = join(outDir, 'PromptlyHelper.exe')

mkdirSync(outDir, { recursive: true })

const args = [
  '/nologo',
  '/target:exe',
  '/platform:anycpu',
  '/optimize+',
  `/out:${outFile}`,
  '/r:System.dll',
  '/r:System.Core.dll',
  '/r:System.Windows.Forms.dll',
  '/r:UIAutomationClient.dll',
  '/r:UIAutomationTypes.dll',
  `/lib:${wpfDir}`,
  source
]

const result = spawnSync(csc, args, { stdio: 'inherit' })
if (result.status !== 0 || !existsSync(outFile)) {
  console.error(`[build-helper] compile failed (exit ${result.status})`)
  process.exit(result.status ?? 1)
}

const sizeKb = Math.round(statSync(outFile).size / 1024)
console.log(`[build-helper] OK → ${outFile} (${sizeKb} KB)`)
