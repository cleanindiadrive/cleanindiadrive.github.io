"""Download the pinned dependencies used by the supplied animation snippets."""
from pathlib import Path
import io
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'vendor'
PACKAGES = [
    ('https://registry.npmjs.org/gsap/-/gsap-3.12.5.tgz', {
        'package/dist/gsap.min.js': 'gsap.min.js',
    }),
    ('https://registry.npmjs.org/jquery/-/jquery-3.7.1.tgz', {
        'package/dist/jquery.min.js': 'jquery.min.js',
        'package/LICENSE.txt': 'jquery-LICENSE.txt',
    }),
    ('https://registry.npmjs.org/@fortawesome/fontawesome-free/-/fontawesome-free-5.15.4.tgz', {
        'package/webfonts/fa-solid-900.woff2': 'fa-solid-900.woff2',
        'package/LICENSE.txt': 'fontawesome-LICENSE.txt',
    }),
]
for url, files in PACKAGES:
    with urllib.request.urlopen(url, timeout=45) as response:
        archive = tarfile.open(fileobj=io.BytesIO(response.read()), mode='r:gz')
    for source, target in files.items():
        if source not in archive.getnames() and 'LICENSE' in source:
            source = next(name for name in archive.getnames()
                          if Path(name).name.lower().startswith('license'))
        (ROOT / target).write_bytes(archive.extractfile(source).read())
        print(target)
