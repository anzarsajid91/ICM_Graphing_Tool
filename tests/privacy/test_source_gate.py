import sys
import unittest
import hashlib
import json
import tempfile
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from verify_data_confidentiality import network_capable, verify


class SourceGateTests(unittest.TestCase):
    def test_network_sinks_require_review(self):
        for code in ["fetch('/upload',{method:'POST',body:data})", "window['fetch'](url)",
                     "navigator.sendBeacon(url,data)", "new WebSocket(url)",
                     "new EventSource(url)", "new RTCPeerConnection()", "image.src=url",
                     "form.submit()", "navigator.share({files})", "importScripts(url)",
                     "document.createElement('script')", "window.location.href=url",
                     "window.open(url)", "element.setAttribute('src',url)",
                     "import(url)", "new Function('payload')"]:
            with self.subTest(code=code):self.assertTrue(network_capable(code,'.js'))

    def test_python_network_and_dynamic_execution_require_review(self):
        for code in ['import requests', 'from urllib.request import urlopen',
                     'import socket', 'import js', "__import__('requests')",
                     "importlib.import_module('requests')", "eval('payload')"]:
            with self.subTest(code=code):self.assertTrue(network_capable(code,'.py'))

    def test_remote_resources_require_review(self):
        self.assertTrue(network_capable('<img src="https://collector.test/?data=x">','.html'))
        self.assertTrue(network_capable("div{background:url(//collector.test/x)}",'.css'))

    def test_local_analysis_is_not_a_network_sink(self):
        self.assertFalse(network_capable("values.map(value=>value*2)",'.js'))
        self.assertFalse(network_capable("from pathlib import Path\nPath('/data/source').read_text()",'.py'))
        self.assertFalse(network_capable('<script src="assets/runtime.js"></script>','.html'))

    def test_changed_and_new_network_sources_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for folder in ['web/assets','web/vendor','src/icm_workbench','security']:
                (root/folder).mkdir(parents=True)
            source=root/'web/assets/loader.js'
            source.write_text("fetch('assets/kernel.js')")
            vendor=root/'web/vendor/manifest.json'
            vendor.write_text('{"files": []}')
            inventory={
                'vendor_manifest_sha256':hashlib.sha256(vendor.read_bytes()).hexdigest(),
                'sources':{'web/assets/loader.js':{
                    'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                    'review':'Fixture: fixed resource GET only',
                }},
            }
            (root/'security/network-source-approvals.json').write_text(json.dumps(inventory))
            with redirect_stdout(StringIO()):verify(root)
            source.write_text("fetch('/upload',{method:'POST',body:data})")
            with redirect_stdout(StringIO()),self.assertRaisesRegex(RuntimeError,'loader.js'):
                verify(root)
            source.write_text("fetch('assets/kernel.js')")
            (root/'web/assets/collector.js').write_text('navigator.sendBeacon(url,data)')
            with redirect_stdout(StringIO()),self.assertRaisesRegex(RuntimeError,'collector.js'):
                verify(root)


if __name__=='__main__':unittest.main()
