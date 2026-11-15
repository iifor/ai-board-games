import { fromBuffer, type ZipFile, type Entry } from 'yauzl';
import { SaxesParser } from 'saxes';
import { badRequest } from '../../utils/errors';

const MAX_XML = 6 * 1024 * 1024;
const WORD_NAMESPACES = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);

async function documentXml(bytes: Buffer): Promise<string> {
  const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true }, (e, z) => e || !z ? reject(e) : resolve(z)));
  try {
    return await new Promise<string>((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', () => reject(new Error('missing document')));
      zip.on('entry', (entry: Entry) => {
        if (entry.fileName !== 'word/document.xml') { zip.readEntry(); return; }
        if (entry.uncompressedSize > MAX_XML) return reject(new Error('oversize'));
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err);
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('error', reject);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_XML) { stream.destroy(new Error('oversize')); return; }
            chunks.push(chunk);
          });
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
}

/** Word 正文按出现顺序读取；同一表格行的单元格用制表符分隔。 */
export async function wordParagraphs(bytes: Buffer): Promise<string[]> {
  try {
    const xml = await documentXml(bytes);
    const paragraphs: string[] = [];
    const parser = new SaxesParser({ xmlns: true });
    let body = false, text = false, paragraph = '';
    let row: string[] | null = null, cell: string[] = [];
    parser.on('doctype', () => { throw new Error('doctype'); });
    parser.on('opentag', tag => {
      if (!WORD_NAMESPACES.has(tag.uri)) return;
      if (tag.local === 'body') body = true;
      if (!body) return;
      if (tag.local === 'tr') row = [];
      if (tag.local === 'tc') cell = [];
      if (tag.local === 'p') paragraph = '';
      if (tag.local === 't') text = true;
      if (tag.local === 'br') paragraph += '\n';
      if (tag.local === 'tab') paragraph += '\t';
    });
    parser.on('text', value => { if (body && text) paragraph += value; });
    parser.on('closetag', tag => {
      if (!body || !WORD_NAMESPACES.has(tag.uri)) return;
      if (tag.local === 't') text = false;
      if (tag.local === 'p') (row ? cell : paragraphs).push(paragraph);
      if (tag.local === 'tc') row?.push(cell.join('\n'));
      if (tag.local === 'tr' && row) { paragraphs.push(row.join('\t')); row = null; }
      if (tag.local === 'body') body = false;
    });
    parser.write(xml).close();
    return paragraphs;
  } catch { throw badRequest('Word 正文无法读取，请使用完整的 .docx 文件（正文 XML 上限 6 MiB）'); }
}
