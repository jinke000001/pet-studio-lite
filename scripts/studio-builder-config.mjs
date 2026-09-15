import path from 'node:path';

export function studioBuilderConfig(root, stage, electronVersion) {
  return {
    // electron-builder automatically loads root/electron-builder.yml. Extending
    // that same file or repeating extraResources schedules duplicate copies.
    directories: { app: stage, output: path.join(stage, 'dist'), buildResources: path.join(root, 'build-resources') },
    npmRebuild: false,
    electronVersion,
    win: { artifactName: '${productName}-${version}-${arch}.${ext}' },
    publish: null,
  };
}
