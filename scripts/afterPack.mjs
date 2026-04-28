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
import { existsSync } from 'node:fs'

const ELECTRON_BINARIES = {
  darwin: (productName) => `${productName}.app/Contents/MacOS/${productName}`,
  win32: (productName) => `${productName}.exe`,
  linux: (productName) => productName,
}

export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  const productName = packager.appInfo.productFilename
  const binaryFn = ELECTRON_BINARIES[electronPlatformName]

  if (!binaryFn) {
    console.warn(`[afterPack] Unknown platform '${electronPlatformName}', skipping fuse flip`)
    return
  }

  const electronBinary = join(appOutDir, binaryFn(productName))

  if (!existsSync(electronBinary)) {
    throw new Error(`[afterPack] Electron binary not found at ${electronBinary}`)
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
