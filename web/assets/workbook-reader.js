/* Association workbooks are small XLSX documents. Validate the ZIP envelope
 * before invoking the pinned reader, then bound worksheet materialisation. */
(function () {
  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_EXPANDED = 100 * 1024 * 1024;
  function validate(bytes) {
    const data = new Uint8Array(bytes);
    if (!data.length || data.length > MAX_BYTES) throw new Error('Association workbook must be a non-empty XLSX file of at most 20 MB.');
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let end = -1;
    for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0 || end + 22 + view.getUint16(end + 20, true) !== data.length) throw new Error('Invalid or truncated XLSX archive.');
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    let offset = view.getUint32(end + 16, true), expanded = 0;
    const stop = offset + size;
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || !count || count > 2000 || stop > end) throw new Error('Unsupported XLSX archive structure.');
    for (let n = 0; n < count; n++) {
      if (offset + 46 > stop || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid XLSX directory.');
      const flags = view.getUint16(offset + 8, true);
      const compressed = view.getUint32(offset + 20, true);
      const length = view.getUint32(offset + 24, true);
      const local = view.getUint32(offset + 42, true);
      if ((flags & 1) || compressed === 0xffffffff || length === 0xffffffff || local + 30 > data.length || view.getUint32(local, true) !== 0x04034b50) throw new Error('Encrypted, ZIP64 or malformed workbooks are unsupported.');
      expanded += length;
      if (expanded > MAX_EXPANDED || length > MAX_BYTES || length > Math.max(1024 * 1024, compressed * 1000)) throw new Error('Workbook expansion exceeds the association import limit.');
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
      if (offset > stop) throw new Error('Truncated XLSX directory.');
    }
    if (offset !== stop) throw new Error('Invalid XLSX directory size.');
    return data;
  }
  function read(bytes) {
    const data = validate(bytes);
    const book = XLSX.read(data, { type: 'array', cellDates: false, sheetRows: 10002 });
    if (!book.SheetNames.length || book.SheetNames.length > 100) throw new Error('Workbook must contain between 1 and 100 sheets.');
    for (const name of book.SheetNames) {
      const sheet = book.Sheets[name];
      const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
      if (range.e.r >= 10000 || range.e.c >= 256) throw new Error('Association sheets are limited to 10,000 rows and 256 columns.');
    }
    return book;
  }
  window.ICMWorkbookReader = Object.freeze({ read, validate });
})();
