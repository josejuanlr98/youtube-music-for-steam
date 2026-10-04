import { readFile } from 'node:fs/promises';

// yt-cast-receiver 2.1.0 drops options.uuid before constructing peer-dial.
// Transform only the bundled copy; clean installs must reproduce the fix.
export function patchDialServer(source) {
  const anchor = '            expressApp,';
  if (source.split(anchor).length !== 2 || source.includes('uuid: options.uuid')) {
    throw new Error('Unexpected yt-cast-receiver DialServer implementation. Review the UUID patch before building.');
  }
  return source.replace(anchor, `${anchor}\n            uuid: options.uuid,`);
}

export const persistentDialIdentity = {
  name: 'persistent-dial-identity',
  setup(build) {
    let patched = false;
    build.onStart(() => { patched = false; });
    build.onLoad({ filter: /[/\\]yt-cast-receiver[/\\]dist[/\\]lib[/\\]dial[/\\]DialServer\.js$/ }, async ({ path }) => {
      const contents = patchDialServer(await readFile(path, 'utf8'));
      patched = true;
      return { contents, loader: 'js' };
    });
    build.onEnd(result => {
      if (!result.errors.length && !patched) throw new Error('DialServer UUID patch was not applied. Refusing to ship a receiver with random identity.');
    });
  },
};
