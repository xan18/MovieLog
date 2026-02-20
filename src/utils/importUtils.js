const decodeText = (buffer) => {
  const decoders = [
    () => new TextDecoder('utf-8', { fatal: true }).decode(buffer),
    () => new TextDecoder('utf-16le', { fatal: true }).decode(buffer),
    () => new TextDecoder('windows-1251', { fatal: true }).decode(buffer),
  ];
  let lastError = null;
  for (const read of decoders) {
    try {
      return read();
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    console.warn('Falling back to non-fatal UTF-8 decoding for import file.', lastError);
  }
  return new TextDecoder('utf-8').decode(buffer);
};

export const readJsonFileWithFallback = async (file) => {
  const buffer = await file.arrayBuffer();
  const text = decodeText(buffer);
  return JSON.parse(text);
};
