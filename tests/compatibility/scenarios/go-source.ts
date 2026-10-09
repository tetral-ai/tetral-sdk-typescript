/** Extract one Go function, excluding comments and rejecting missing/ambiguous bodies. */
export function goFunction(source: string, declaration: string): string {
  const code = source.split('');
  const uncommented = source.split('');
  const blank = (start: number, end: number, comments: boolean) => {
    for (let i = start; i < end; i++) {
      if (source[i] !== '\n' && source[i] !== '\r') {
        code[i] = ' ';
        if (comments) uncommented[i] = ' ';
      }
    }
  };
  for (let i = 0; i < source.length; i++) {
    const start = i;
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
      blank(start, i, true);
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) return '';
      i = end + 1;
      blank(start, i + 1, true);
    } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      let closed = false;
      while (++i < source.length) {
        if (quote !== '`' && source[i] === '\\') i++;
        else if (source[i] === quote) {
          closed = true;
          break;
        }
      }
      if (!closed) return '';
      blank(start, i + 1, false);
    }
  }
  const masked = code.join('');
  // Declarations must begin a line; comments and string decoys are already masked.
  const starts: number[] = [];
  let offset = 0;
  for (const line of masked.split('\n')) {
    if (line.startsWith(declaration)) starts.push(offset);
    offset += line.length + 1;
  }
  if (starts.length !== 1) return '';
  const start = starts[0]!;
  const opening = masked.indexOf('{', start + declaration.length);
  const nextDeclaration = masked.indexOf('\nfunc ', start + declaration.length);
  if (opening < 0 || (nextDeclaration >= 0 && nextDeclaration < opening)) return '';
  let depth = 1;
  for (let i = opening + 1; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    if (masked[i] === '}' && --depth === 0) return uncommented.slice(start, i + 1).join('');
  }
  return '';
}
