export const recordKeys=['pantry-foods','pantry-storage','pantry-smart','pantry-meal-plan','pantry-saved','pantry-donations','pantry-donation-drafts','pantry-ai-history','pantry-ai-image','pantry-ai-prompt','pantry-food-draft'];
export const emptyState=()=>({records:{}});
export function validatePantry(value){
 if(!value||typeof value!=='object'||!value.records||typeof value.records!=='object'||Array.isArray(value.records))throw Error('Invalid pantry workspace');
 /** @type {Record<string,string>} */
 const records={};let bytes=0;
 for(const [key,text] of Object.entries(value.records)){
  if(!recordKeys.includes(key)||typeof text!=='string'||text.length>12000000)throw Error('Unsupported pantry record');bytes+=text.length;if(bytes>12000000)throw Error('Pantry copy is too large');
  if(key==='pantry-ai-prompt'){if(text.length>100000)throw Error('Prompt is too long');}
  else if(key==='pantry-ai-image'){if(text&&!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(text))throw Error('Invalid pantry photo');}
  else{
   const parsed=JSON.parse(text);
   if(key==='pantry-food-draft'&&parsed!==null&&(!parsed||typeof parsed!=='object'||!parsed.values||typeof parsed.values!=='object'||Object.values(parsed.values).some(x=>typeof x!=='string')||parsed.image&& !/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(parsed.image)))throw Error('Invalid food draft');
   if(key==='pantry-foods'){
    if(!Array.isArray(parsed)||parsed.length>500||parsed.some(f=>!f||!Number.isSafeInteger(f.id)||typeof f.name!=='string'||f.name.length>500||typeof f.location!=='string'||typeof f.expiry!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(f.expiry)||f.image&&(!/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(f.image)&&!/^https:\/\//.test(f.image))))throw Error('Invalid pantry items');
    if(new Set(parsed.map(f=>f.id)).size!==parsed.length)throw Error('Duplicate pantry item');
   }
   if(key==='pantry-saved'&&(typeof parsed!=='number'||!Number.isFinite(parsed)||parsed<0))throw Error('Invalid saved count');
   if(['pantry-meal-plan','pantry-donation-drafts','pantry-ai-history'].includes(key)&&!Array.isArray(parsed))throw Error('Invalid saved list');
   if(['pantry-storage','pantry-smart','pantry-donations'].includes(key)&&(!parsed||typeof parsed!=='object'||Array.isArray(parsed)))throw Error('Invalid saved settings');
  }
  records[key]=text;
 }
 return {records};
}
