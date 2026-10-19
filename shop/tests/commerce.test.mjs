import test from 'node:test';
import assert from 'node:assert/strict';
import {cartLines,subtotal,filterProducts,validateCustomer,safeImage,escapeHTML,CATEGORIES} from '../commerce.js';
const products=[{id:'a',title:'Landscape',description:'Mountain painting',category:'paintings',price:10.10,stock:2,visible:true},{id:'b',title:'Clay friend',description:'Small clay model',category:'clay-models',price:0.20,stock:3,visible:true},{id:'hidden',title:'Hidden',price:20,stock:5,visible:false},{id:'sold',title:'Sold',price:30,stock:0,visible:true}];
test('cart drops hidden, removed, sold out, duplicate and malformed lines; caps stock',()=>{
  const result=cartLines([{id:'a',quantity:8},{id:'a',quantity:1},{id:'b',quantity:1.2},{id:'hidden',quantity:1},{id:'sold',quantity:1},{id:'gone',quantity:1},null],products);
  assert.equal(result.length,1);assert.equal(result[0].quantity,2);assert.equal(result[0].total,20.20);
});
test('subtotal uses integer paise arithmetic',()=>assert.equal(subtotal(cartLines([{id:'a',quantity:1},{id:'b',quantity:1}],products)),10.30));
test('public category, search, availability and price sorting compose',()=>{
  assert.deepEqual(filterProducts(products,{search:'CLAY',available:true}).map(p=>p.id),['b']);
  assert.deepEqual(filterProducts(products,{category:'paintings'}).map(p=>p.id),['a']);
  assert.deepEqual(filterProducts(products,{sort:'price-asc',available:true}).map(p=>p.id),['b','a']);
  assert.equal(CATEGORIES.length,4);
});
const customer={email:'preview@example.com',phone:'+91 9876543210',firstName:'Sample',lastName:'Customer',address:'12 Example Lane',apartment:'',city:'Bengaluru',state:'Karnataka',postalCode:'560001',country:'India',notes:'',consent:true,location:{latitude:12.9716,longitude:77.5946,source:'pin',accuracy:0,formattedAddress:'Bengaluru',confirmed:true}};
test('checkout validates contact, delivery and consent',()=>{
  assert.equal(validateCustomer(customer),'');
  for(const change of [{email:'bad'},{phone:'123'},{postalCode:'000000'},{firstName:' '},{address:''},{country:'UK'},{consent:false},{location:null},{location:{...customer.location,confirmed:false}}])assert.ok(validateCustomer({...customer,...change}));
});
test('product content and URLs cannot inject HTML or javascript',()=>{
  assert.equal(safeImage('javascript:alert(1)','fallback'),'fallback');
  assert.equal(safeImage('data:text/html,hello','fallback'),'fallback');
  assert.equal(safeImage('https://example.com/art.jpg'),'https://example.com/art.jpg');
  assert.equal(escapeHTML('<img src=x onerror="bad">'),'&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
