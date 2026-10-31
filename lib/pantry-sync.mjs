import {createHash} from 'node:crypto';
import {canonical} from '../public/offline/core.mjs';
export const revision=state=>createHash('sha256').update(canonical(state)).digest('hex');
import {validatePantry,emptyState} from '../public/offline/model.mjs';
export {validatePantry,emptyState};
export function decidePantry({owner,expectedOwner,current,state,baseRevision}){
 if(owner!==expectedOwner)throw Error('Account mismatch');const normalized=validatePantry(state),currentState=validatePantry(current),currentRevision=revision(currentState);
 if(revision(normalized)===currentRevision)return {kind:'already-applied',state:normalized,revision:currentRevision};
 if(baseRevision!==currentRevision)return {kind:'conflict',state:currentState,revision:currentRevision};
 return {kind:'apply',state:normalized,revision:revision(normalized)};
}
