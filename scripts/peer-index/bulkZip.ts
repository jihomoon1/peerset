// Reads selected JSON entries out of SEC's bulk zips (submissions.zip has about 995k
// entries; we need about 6k). yauzl reads the central directory, then inflates only
// the entries asked for, one at a time, so memory stays at one company's JSON.

import yauzl from "yauzl";

export async function forEachJsonEntry(
  zipPath: string,
  want: (fileName: string) => boolean,
  onEntry: (fileName: string, text: string) => void,
): Promise<{ entries: number; read: number }> {
  const zip = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    autoClose: false,
  });
  let entries = 0;
  let read = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      entries++;
      if (!want(entry.fileName)) continue;
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      onEntry(entry.fileName, Buffer.concat(chunks).toString("utf8"));
      read++;
    }
  } finally {
    zip.close();
  }
  return { entries, read };
}
