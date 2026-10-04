import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const sandbox = {window: {}, Uint8Array, DataView};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('web/vendor/sheetjs-0.20.3/xlsx.full.min.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('web/assets/workbook-reader.js', 'utf8'), sandbox);
const reader = sandbox.window.ICMWorkbookReader;
assert.equal(sandbox.XLSX.version, '0.20.3');
const bytes = fs.readFileSync('reference/current-tool/sample-data/rainfall/fm_rg_assoc.xlsx');
assert.ok(reader.read(bytes).SheetNames.length);
assert.throws(() => reader.read(new Uint8Array()), /non-empty/);
assert.throws(() => reader.read(bytes.subarray(0, 200)), /Invalid|truncated/);
assert.throws(() => reader.read(new Uint8Array(21 * 1024 * 1024)), /20 MB/);
const malicious = new Uint8Array(bytes);
const view = new DataView(malicious.buffer);
for (let i = 0; i < malicious.length - 46; i++) {
  if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 0x7fffffff, true); break; }
}
assert.throws(() => reader.read(malicious), /expansion/);
const book = sandbox.XLSX.utils.book_new();
sandbox.XLSX.utils.book_append_sheet(book, sandbox.XLSX.utils.aoa_to_sheet([['Monitor', 'RG'], ['001', 'RG01']]), 'Association');
const roundtrip = reader.read(sandbox.XLSX.write(book, {type:'array', bookType:'xlsx'}));
assert.equal(roundtrip.Sheets.Association.A2.v, '001');
console.log('Pinned workbook reader: reference, roundtrip, leading zeros, truncation and expansion limits passed.');
