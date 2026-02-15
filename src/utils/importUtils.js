const decodeText = (buffer) => {
  const decoders = [
    () => new TextDecoder('utf-8', { fatal: true }).decode(buffer),
    () => new TextDecoder('utf-16le', { fatal: true }).decode(buffer),
    () => new TextDecoder('windows-1251', { fatal: true }).decode(buffer),
  ];
  for (const read of decoders) {
    try {
      return read();
    } catch {}
  }
  return new TextDecoder('utf-8').decode(buffer);
};

export const readJsonFileWithFallback = async (file) => {
  const buffer = await file.arrayBuffer();
  const text = decodeText(buffer);
  return JSON.parse(text);
};
