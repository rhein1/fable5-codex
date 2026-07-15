const absoluteLocalMarkdownLink = /\((?:file:\/\/)?(?:\/?[A-Za-z]:[\\/]|\/(?!\/))[^)\r\n]*\)/i;
const plainMachinePath = /(?:^|[\s`"'(<=>])(?:\/?[A-Za-z]:[\\/]|\/(?:tmp|private\/var|home\/runner|Users)\/)/m;

export function containsAbsoluteLocalMarkdownLink(text) {
  return absoluteLocalMarkdownLink.test(text);
}

export function containsFileUri(text) {
  return /file:\/\//i.test(text);
}

export function containsPlainMachinePath(text) {
  return plainMachinePath.test(text);
}
