import {MAP_CONFIG} from './map-config.js';
import {escapeHTML as e} from './commerce.js';
import {featureAddress,featureLabel,validCoordinates,validLocation} from './location-utils.js';
import {loadScript} from './browser-library.js';

export function mapPanel(location) {
  return `<section class="delivery-pin" aria-label="Delivery location"><div class="map-actions"><button type="button" class="button outline small" data-map="search">Find my address</button><button type="button" class="button outline small" data-map="device">⌖ Use my location</button><button type="button" class="text-link" data-map="open">${validLocation(location)?'Edit saved pin':'Choose on map'}</button></div><p id="map-status" class="map-status" role="status">${validLocation(location)?'✓ Delivery pin confirmed.':'Enter your address above, then find it on the map.'}</p><div id="map-workspace" hidden><div id="map-results" class="map-results" aria-label="Address matches"></div><div id="delivery-map" aria-label="Delivery location map. Scroll to zoom or pinch with two fingers. Use arrow keys to pan, then choose Pin map centre."></div><button type="button" class="text-link" data-map="center">Pin map centre</button><p id="pin-coordinates" class="small"></p><div id="mapped-address" class="mapped-address" hidden><span class="eyebrow">Nearby mapped address · please check</span><p id="mapped-address-text"></p><button type="button" class="text-link" data-map="apply-address">Use this address in the form</button><p class="small muted">Check the house number and keep your apartment / landmark details.</p></div><div class="map-actions"><button type="button" class="button small" data-map="confirm" disabled>Confirm delivery pin ✓</button><button type="button" class="text-link" data-map="clear">Reset pin</button></div></div></section>`;
}

export function mountDeliveryMap(root,{getAddress,onChange,onAddress,initial}) {
  let map,marker,accuracyCircle,pending=initial&&validCoordinates(initial.latitude,initial.longitude)?{...initial}:null,disposed=false,results=[],suggestion=null,version=0,controller,timer,lastRequest=0;
  const cache=new Map();
  const el=id=>root.querySelector(`#${id}`);
  const status=text=>{if(!disposed)el('map-status').textContent=text;};
  const enabled=()=>{const button=root.querySelector('[data-map="confirm"]');button.disabled=!pending||pending.confirmed;button.textContent=pending?.confirmed?'Delivery pin confirmed ✓':'Confirm delivery pin ✓';button.classList.toggle('pin-confirmed',!!pending?.confirmed);};
  async function ensureMap(){
    el('map-workspace').hidden=false;
    if(map){map.invalidateSize();return;}
    await loadScript('assets/vendor/leaflet.js');if(disposed)return;
    if(map)return;
    map=window.L.map(el('delivery-map'),{scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true,keyboard:true,zoomControl:true,wheelPxPerZoomLevel:60,zoomSnap:0.5}).setView(pending?[pending.latitude,pending.longitude]:[22.5,79],pending?17:5);
    window.L.tileLayer(MAP_CONFIG.tiles,{attribution:MAP_CONFIG.attribution,maxZoom:19}).on('tileerror',()=>status('Some map tiles could not load. Retry your connection before confirming your delivery pin.')).addTo(map);
    map.on('click',event=>setPoint(event.latlng.lat,event.latlng.lng,'pin'));
    if(pending){placeMarker();updatePointUI();}
  }
  function placeMarker(){
    if(!map||!pending)return;
    const at=[pending.latitude,pending.longitude];
    if(!marker){marker=window.L.marker(at,{draggable:true,title:'Drag to your delivery entrance',icon:window.L.divIcon({className:'delivery-marker',html:'<span aria-hidden="true">●</span>',iconSize:[34,44],iconAnchor:[17,44]})}).addTo(map);marker.on('dragend',()=>{const at=marker.getLatLng();setPoint(at.lat,at.lng,'pin');});}else marker.setLatLng(at);
    if(accuracyCircle){accuracyCircle.remove();accuracyCircle=null;}
    if(pending.accuracy)accuracyCircle=window.L.circle(at,{radius:pending.accuracy,color:'#176b3a',weight:1,fillOpacity:.08}).addTo(map);
  }
  function updatePointUI(){
    enabled();el('pin-coordinates').textContent=pending?`${pending.latitude.toFixed(6)}, ${pending.longitude.toFixed(6)}${pending.accuracy?` · Device accuracy about ${Math.round(pending.accuracy)} m`:''}`:'';
    el('mapped-address').hidden=!suggestion;el('mapped-address-text').textContent=suggestion?featureLabel(suggestion):'';
  }
  function setPoint(latitude,longitude,source,accuracy=0,feature=null){
    if(!validCoordinates(latitude,longitude))return;
    version++;controller?.abort();clearTimeout(timer);
    pending={latitude:Number(latitude.toFixed(6)),longitude:Number(longitude.toFixed(6)),source,accuracy,formattedAddress:feature?featureLabel(feature):'',confirmed:false};suggestion=feature;
    onChange({...pending});placeMarker();updatePointUI();status('Adjust the pin to your entrance, then confirm it.');
    if(!feature){const current=version;timer=setTimeout(()=>reverse(current),900);}
  }
  async function request(path,params){
    const expectedVersion=version;
    const url=new URL(MAP_CONFIG.geocoder.replace(/\/$/,'')+path);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    if(cache.has(url.href))return cache.get(url.href);
    const delay=Math.max(0,1200-(Date.now()-lastRequest));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    if(disposed||expectedVersion!==version)throw new Error('Lookup superseded');
    controller?.abort();controller=new AbortController();const active=controller;lastRequest=Date.now();
    const timeout=setTimeout(()=>active.abort(),12000);
    try{const response=await fetch(url,{signal:active.signal,credentials:'omit'});if(!response.ok)throw new Error('Lookup unavailable');const data=await response.json();const found=(data.features||[]).filter(f=>validCoordinates(f.geometry?.coordinates?.[1],f.geometry?.coordinates?.[0]));cache.set(url.href,found);return found;}finally{clearTimeout(timeout);}
  }
  async function reverse(current){
    const at=pending;if(!at)return;
    try{const found=await request('/reverse',{lat:at.latitude,lon:at.longitude,limit:1,lang:'en'});if(disposed||current!==version)return;suggestion=found[0]||null;if(pending){pending.formattedAddress=suggestion?featureLabel(suggestion):'';if(pending.confirmed)onChange({...pending});}updatePointUI();}
    catch{if(current===version)status('Nearby address lookup is unavailable. Your pin still works; check the typed address and confirm.');}
  }
  async function search(){
    const c=getAddress();if(!c.address&&!c.city&&!c.postalCode){status('Enter an address, city or PIN code first, or use your location.');return;}
    const current=++version;clearTimeout(timer);controller?.abort();await ensureMap();if(disposed||current!==version)return;
    status('Finding your address…');
    try{results=await request('/api/',{q:[c.address,c.city,c.state,c.postalCode,'India'].filter(Boolean).join(', '),limit:5,lang:'en',bbox:'68,6,98,38'});
      if(disposed||current!==version)return;
      let approximate=false;
      if(!results.length&&(c.city||c.postalCode)){results=await request('/api/',{q:[c.city,c.postalCode,'India'].filter(Boolean).join(', '),limit:5,lang:'en',bbox:'68,6,98,38'});approximate=true;}
      if(disposed||current!==version)return;
      el('map-results').innerHTML=results.map((f,i)=>`<button type="button" data-map-result="${i}">${e(featureLabel(f))}<span>Choose →</span></button>`).join('');
      if(results.length){const f=results[0];map.setView([f.geometry.coordinates[1],f.geometry.coordinates[0]],approximate?13:16);status(approximate?'Exact street not found. Choose a nearby match, then move the pin to your entrance.':'Choose the closest match below, or tap the map to place your pin.');}else status('No match found. Try a nearby landmark, use your location, or choose the pin manually.');
    }catch{if(current===version)status('Address search is unavailable. You can choose on the map, use your location, or place the pin manually.');}
  }
  async function locate(){
    if(!navigator.geolocation){status('This browser does not support location. Search your address instead.');return;}
    const current=++version;status('Waiting for your location permission…');
    navigator.geolocation.getCurrentPosition(async position=>{if(disposed||current!==version)return;try{await ensureMap();if(disposed||current!==version)return;const {latitude,longitude,accuracy}=position.coords;setPoint(latitude,longitude,'device',Math.min(accuracy,1000000));map.setView([latitude,longitude],17);status('Location found. Check the accuracy circle and adjust the pin before confirming.');}catch{status('The map could not load. Please retry to confirm your delivery pin.');}},error=>{if(disposed||current!==version)return;status(error.code===1?'Location permission was not granted. Search your address or choose on the map.':'Your location could not be found. Try again outdoors or search your address.');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }
  async function click(event){
    const target=event.target.closest('[data-map],[data-map-result]');if(!target||!root.contains(target))return;
    if(target.disabled)return;const action=target.dataset.map;target.disabled=true;
    try{
      if(target.dataset.mapResult!==undefined){const f=results[Number(target.dataset.mapResult)];if(f){setPoint(f.geometry.coordinates[1],f.geometry.coordinates[0],'search',0,f);map.setView([pending.latitude,pending.longitude],17);el('map-results').innerHTML='';el('delivery-map').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
      else if(action==='open')await ensureMap();
      else if(action==='search')await search();
      else if(action==='device')await locate();
      else if(action==='center'){const at=map.getCenter();setPoint(at.lat,at.lng,'pin');}
      else if(action==='confirm'&&pending){pending.confirmed=true;onChange({...pending});status('✓ Delivery pin confirmed. Check your written address before saving.');}
      else if(action==='apply-address'&&suggestion){pending.confirmed=false;onChange({...pending});onAddress(featureAddress(suggestion));status('Nearby address copied. Check your house number, city, state and PIN code, then confirm your pin.');}
      else if(action==='clear'){version++;clearTimeout(timer);controller?.abort();pending=null;suggestion=null;marker?.remove();marker=null;accuracyCircle?.remove();accuracyCircle=null;onChange(null);updatePointUI();status('Pin reset. Choose and confirm a delivery pin before checkout.');}
    }catch(error){status(error.message);}finally{if(target.isConnected){target.disabled=false;enabled();}}
  }
  root.addEventListener('click',click);
  if(pending?.confirmed)status('✓ Saved delivery pin confirmed. Open the map to review or edit it.');
  if(pending&&!pending.confirmed)status('A pin is selected. Open the map and confirm it.');
  return {focus(){root.scrollIntoView({block:'center',behavior:'smooth'});},needsConfirmation(){return !validLocation(pending);},setSavedLocation(point){if(pending||!validLocation(point))return false;pending={...point};onChange({...pending});root.querySelector('[data-map="open"]').textContent='Edit saved pin';if(map){map.setView([pending.latitude,pending.longitude],17);placeMarker();updatePointUI();}status('✓ Saved delivery pin confirmed. Open the map to review or edit it.');return true;},invalidate(){if(pending){pending.confirmed=false;onChange({...pending});updatePointUI();status('Address changed. Recheck the map and confirm the pin again.');}},destroy(){disposed=true;version++;controller?.abort();clearTimeout(timer);root.removeEventListener('click',click);map?.remove();}};
}
