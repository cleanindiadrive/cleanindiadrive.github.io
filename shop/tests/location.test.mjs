import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validCoordinates,validLocation,locationLink,featureAddress,featureLabel} from '../location-utils.js';
test('only finite confirmed coordinates can be stored or printed as a pin',()=>{
  const location={latitude:12.9716,longitude:77.5946,confirmed:true,source:'pin',accuracy:0,formattedAddress:'Bengaluru'};
  assert.ok(validLocation(location));assert.ok(validCoordinates(0,0));
  for(const bad of [{latitude:NaN},{longitude:181},{latitude:91},{confirmed:false},{source:'unknown'},{accuracy:-1}])assert.equal(validLocation({...location,...bad}),false);
  const url=locationLink({location});assert.match(url,/mlat=12.971600&mlon=77.594600/);assert.ok(!url.includes('Bengaluru'));
});
test('label without a confirmed pin searches the typed address',()=>{
  const url=new URL(locationLink({address:'12 A & B Street',city:'Bengaluru',postalCode:'560001',country:'India'}));
  assert.equal(url.hostname,'www.openstreetmap.org');assert.equal(url.searchParams.get('query'),'12 A & B Street, Bengaluru, 560001, India');
});
test('mapped address only offers available fields and preserves manual PIN when absent',()=>{
  const feature={properties:{name:'Park',street:'Example Road',housenumber:'12',city:'Bengaluru',state:'Karnataka',countrycode:'IN',country:'India'}};
  assert.deepEqual(featureAddress(feature),{address:'12 Example Road',city:'Bengaluru',state:'Karnataka',postalCode:'',country:'India'});
  assert.equal(featureLabel(feature),'12 Example Road, Park, Bengaluru, Karnataka, India');
});
