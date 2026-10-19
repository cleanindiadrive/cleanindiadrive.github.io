import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONTENT,normalizeContent,validateContent,safeContentLink,contentCategories,footerMarkup} from '../store-content.js';
test('content schema accepts full defaults and rejects unsafe or oversized drafts',()=>{
 assert.equal(validateContent(DEFAULT_CONTENT),'');
 for(const value of ['javascript:alert(1)','data:text/html,test','//example.com'])assert.equal(safeContentLink(value),false);
 const c=structuredClone(DEFAULT_CONTENT);c.footer.link1Url='javascript:alert(1)';assert.match(validateContent(c),/destination/);
 c.footer.link1Url='#shop';c.home.heading='a'.repeat(121);assert.match(validateContent(c),/heading/);
});
test('normalization fills partial documents, limits schema and escapes markup',()=>{
 const c=normalizeContent({brand:{name:'<script>alert(1)</script>',logo:'javascript:alert(1)'},home:{heading:'New studio'},sections:{footer:false},unknown:{admin:true}});
 assert.equal(c.brand.logo,DEFAULT_CONTENT.brand.logo);assert.equal(c.home.heading,'New studio');assert.equal(c.sections.footer,false);assert.equal(c.unknown,undefined);
 assert(!footerMarkup(c).includes('<script>'));assert(footerMarkup(c).includes('&lt;script&gt;'));
 assert.equal(contentCategories(c)[1].id,'clay-models');assert.equal(contentCategories(c).length,4);
});
