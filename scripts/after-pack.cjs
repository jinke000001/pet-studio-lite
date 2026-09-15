const fs = require('node:fs/promises');
const path = require('node:path');

// Resource editing uses a portable JS implementation instead of Intel-only Wine.
// These small-group candidates are unsigned; signing is a separate release step.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') return require('./sign-adhoc.cjs')(context);
  if (context.electronPlatformName !== 'win32') return;
  const { NtExecutable, NtExecutableResource, Resource } = await import('resedit');
  const info = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${info.productFilename}.exe`);
  const exe = NtExecutable.from(await fs.readFile(exePath), { ignoreCert: true });
  const resources = NtExecutableResource.from(exe);
  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) throw new Error('Windows executable has no version resource');
  for (const version of versions) {
    version.setFileVersion(info.buildVersion);
    version.setProductVersion(info.buildVersion);
    for (const language of version.getAllLanguagesForStringValues()) {
      version.setStringValues(language, {
        FileDescription: info.description, ProductName: info.productName,
        InternalName: info.productFilename, OriginalFilename: `${info.productFilename}.exe`,
        CompanyName: 'Pet Studio', LegalCopyright: info.copyright,
        FileVersion: info.version, ProductVersion: info.version,
      });
    }
    version.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(exe);
  const output = Buffer.from(exe.generate());
  const verified = Resource.VersionInfo.fromEntries(NtExecutableResource.from(NtExecutable.from(output)).entries);
  if (!verified.length || verified.some(version => version.getAllLanguagesForStringValues().some(language => {
    const values = version.getStringValues(language);
    return values.ProductName !== info.productName || values.ProductVersion !== info.version;
  }))) throw new Error('Windows executable metadata verification failed');
  await fs.writeFile(exePath, output);
  console.log(`[windows-metadata] verified ${info.productName} ${info.version}`);
};
