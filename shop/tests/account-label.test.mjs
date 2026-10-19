import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProfile,validateProfile} from '../profile.js';
import {defaultLabel,normalizeLabel,validateLabel} from '../label-data.js';
import {labelMarkup} from '../labels.js';
import {accountMarkup} from '../customer-dashboard.js';
const request={id:'label-test',customer:{firstName:'Test',lastName:'Customer',address:'12 Test Lane',apartment:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',phone:'9876543210',location:{latitude:12.97,longitude:77.59,confirmed:true,source:'pin',accuracy:0,formattedAddress:'Bengaluru'}},items:[{quantity:1}]};
test('profile accepts optional address fields but validates supplied phone and PIN',()=>{
  const p=normalizeProfile({firstName:' Test ',lastName:'Customer'});assert.equal(validateProfile(p),'');assert.equal(p.firstName,'Test');
  assert.ok(validateProfile({...p,postalCode:'000000'}));assert.ok(validateProfile({...p,phone:'123'}));
});
test('label overrides preserve source data and escape text before rendering',()=>{
  const original=JSON.stringify(request),text=normalizeLabel(request,{recipient:'<img src=x onerror=bad>',handling:'Fragile'});
  assert.equal(validateLabel(text),'');assert.equal(JSON.stringify(request),original);
  const html=labelMarkup(request,text,'<svg></svg>');assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('12.970000'));
  assert.ok(validateLabel({...defaultLabel(request),postalCode:'bad'}));
});
test('signed-out account has real sign-in only and dashboard escapes profile content',()=>{
  const signedOut=accountMarkup(null,false);assert.ok(signedOut.includes('Continue with Google'));assert.ok(!signedOut.includes('preview-admin'));
  const html=accountMarkup({uid:'test',displayName:'Test',email:'test@example.com'},false,{profile:{firstName:'<script>x</script>'},requests:[]});
  assert.ok(html.includes('Request')||html.includes('requests'));assert.ok(!html.includes('<script>x'));assert.ok(!html.includes('Open studio dashboard'));
});
