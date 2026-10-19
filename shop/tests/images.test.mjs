import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isInlineImage,encodeImage,MAX_INLINE_IMAGE_LENGTH} from '../image-data.js';
import {safeImage} from '../commerce.js';
import {normalizeContent,DEFAULT_CONTENT,validateContent} from '../store-content.js';
import {normalizeSettings} from '../store-settings.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
test('only bounded raster Base64 sources are accepted across all image renderers',()=>{
 assert(isInlineImage(png));assert.equal(safeImage(png),png);
 for(const source of ['data:image/svg+xml;base64,PHN2Zy8+','data:text/html;base64,PGgxPg==','data:image/png;base64,','data:image/png;base64,broken!',png+'a','data:image/png;base64,'+'A'.repeat(MAX_INLINE_IMAGE_LENGTH)])assert.equal(safeImage(source,'rejected'),'rejected');
 const content=structuredClone(DEFAULT_CONTENT);content.brand.logo=png;content.collections.clayImage=png;
 assert.equal(validateContent(content),'');assert.equal(normalizeContent(content).brand.logo,png);assert.equal(normalizeSettings({bannerImage:png}).bannerImage,png);
});
test('encoding rejects invalid files before touching browser APIs',async()=>{
 await assert.rejects(encodeImage({type:'image/svg+xml',size:10}),/JPG/);
 await assert.rejects(encodeImage({type:'image/png',size:6*1024*1024+1}),/6 MB/);
});
