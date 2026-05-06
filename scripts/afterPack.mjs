// Hardens the packaged Electron binary by flipping fuses to disable
// Node CLI/env inspect surfaces, enable embedded ASAR integrity validation,
// and require the app to load only from ASAR. Closes audit findings BB-002
// and BB-005.
//
// Wired into electron-builder via the `afterPack` hook. Runs once per
// platform/arch build after electron-builder copies the Electron binary
// into the staged app directory.
//
// Verifying fuses are flipped on the built artifact:
//   npx @electron/fuses read --app release/<platform>-unpacked/<binary>
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'
import { join } from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'

const ELECTRON_BINARIES = {
  darwin: (productName) => [`${productName}.app/Contents/MacOS/${productName}`],
  win32: (productName) => [`${productName}.exe`],
  linux: (productName, packager) => {
    const names = [
      productName,
      packager.appInfo.productName,
      packager.appInfo.sanitizedProductName,
      packager.metadata?.name,
    ].filter(Boolean)

    return [...new Set([...names, ...names.map((name) => name.toLowerCase())])]
  },
}

function findElectronBinary(appOutDir, candidates, platform) {
  for (const candidate of candidates) {
    const binary = join(appOutDir, candidate)
    if (existsSync(binary)) {
      return binary
    }
  }

  if (platform !== 'linux') {
    return null
  }

  for (const entry of readdirSync(appOutDir)) {
    if (/^(chrome|chrome_crashpad_handler|resources|locales|swiftshader)$/i.test(entry)) {
      continue
    }

    const binary = join(appOutDir, entry)
    const stat = statSync(binary)
    if (stat.isFile() && (stat.mode & 0o111) !== 0) {
      return binary
    }
  }

  return null
}

export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  if (process.env.BOLTBERRY_SKIP_FUSE_FLIP === '1') {
    console.warn(`[afterPack] BOLTBERRY_SKIP_FUSE_FLIP=1, leaving QA artifact unfused: ${appOutDir}`)
    return
  }

  const productName = packager.appInfo.productFilename
  const binaryFn = ELECTRON_BINARIES[electronPlatformName]

  if (!binaryFn) {
    console.warn(`[afterPack] Unknown platform '${electronPlatformName}', skipping fuse flip`)
    return
  }

  const electronBinary = findElectronBinary(appOutDir, binaryFn(productName, packager), electronPlatformName)

  if (!electronBinary) {
    throw new Error(`[afterPack] Electron binary not found under ${appOutDir}`)
  }

  console.log(`[afterPack] Flipping fuses on ${electronBinary}`)

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
  })

  console.log('[afterPack] Fuses flipped successfully')
}
