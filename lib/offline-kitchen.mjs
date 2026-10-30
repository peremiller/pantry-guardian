import {daysRemaining,localCalendarDate} from './pantry-dates.mjs';
export function localKitchenReply(items,question='',mode='chat',today=localCalendarDate()){
  const active=items.filter(item=>!item.status||['Available','Opened'].includes(item.status));
  const usable=active.filter(item=>daysRemaining(item.expiry,today)>=0).sort((a,b)=>a.expiry.localeCompare(b.expiry));
  const urgent=usable.filter(item=>daysRemaining(item.expiry,today)<=7);
  const expired=active.length-usable.length;
  const lines=['LOCAL KITCHEN HELPER — based on your saved pantry.'];
  if(mode==='vision')return lines.concat('Your photo can be kept on this device, but this helper cannot recognize food or read labels from photos. Enter the food name and date manually; cloud image recognition needs internet.').join('\n\n');
  lines.push(urgent.length?'Use first:\n'+urgent.slice(0,6).map(item=>`• ${item.name}: ${item.quantity}, ${daysRemaining(item.expiry,today)} days to the recorded date. Stored in ${item.location}.`).join('\n'):'No active items have a recorded date within the next seven days.');
  if(expired)lines.push(`${expired} items have a past recorded date. They are excluded from these meal ideas and community sharing.`);
  if(mode==='recipes'||/cook|meal|recipe|dinner|breakfast|lunch/i.test(question)){
    const names=usable.map(item=>item.name.toLowerCase()).join(' ');const ideas=[];
    if(/rice/.test(names))ideas.push('Pantry rice bowl: use your rice with available vegetables; check which other ingredients you need.');
    if(/egg|spinach/.test(names))ideas.push('Vegetable egg skillet: combine available greens and eggs if both are in your pantry.');
    if(/yogurt|milk/.test(names))ideas.push('Yogurt oats or a fruit smoothie: check your available oats or fruit and use only suitable ingredients.');
    if(/tomato/.test(names))ideas.push('Tomato pantry sauce: simmer your tomatoes and pair with an available grain or pasta.');
    lines.push('Built-in meal ideas (verify all ingredients and your dietary needs):\n'+(ideas.length?ideas.map(x=>'• '+x).join('\n'):'Add food to your pantry to get ingredient-based ideas.'));
  }else if(/where|storage|store|fridge|cabinet/i.test(question))lines.push('Your saved locations:\n'+usable.slice(0,12).map(item=>`• ${item.name} → ${item.location}`).join('\n'));
  else lines.push('I can summarize saved items, suggest what to use first, show storage locations, and offer built-in meal ideas. Open-ended AI answers, photo recognition, and transcription need internet.');
  lines.push('Recorded dates cannot establish food safety. Check packaging and storage history. Do not use or share food that is spoiled or has been stored unsafely.');
  return lines.join('\n\n');
}
