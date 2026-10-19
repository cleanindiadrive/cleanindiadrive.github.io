import {mountContentEditor} from '../content-editor.js';
import {DEFAULT_CONTENT} from '../store-content.js';
import {DEFAULT_SETTINGS} from '../store-settings.js';
import {logoutMarkup,mountLogout,animateLogout} from '../logout.js';
document.querySelector('#fixture-logout').innerHTML=logoutMarkup();mountLogout();
document.querySelector('.logoutButton').addEventListener('click',event=>animateLogout(event.currentTarget));
mountContentEditor(document.querySelector('#content-fixture'),DEFAULT_CONTENT,{
  settings:()=>DEFAULT_SETTINGS,header:()=>document.querySelector('header').outerHTML,
  onPublish:async()=>{if(document.querySelector('#fail-publish').checked)throw new Error('Simulated connection error. Your draft has been kept.');},
  onUpload:async()=>{throw new Error('Uploads are disabled in this isolated fixture.');}
});
