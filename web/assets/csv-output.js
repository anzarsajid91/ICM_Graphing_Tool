/* Spreadsheet-safe text cells for explicit local CSV exports. No I/O. */
(function(){
  'use strict';
  function cell(value){
    let text=String(value??'');
    // Preserve actual numbers, including negatives; untrusted strings are text.
    if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+\-@]/u.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }
  globalThis.ICMSafeCSV=Object.freeze({cell});
})();
