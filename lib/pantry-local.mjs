import {getScopedClient,chooseScopedGuest,syncScoped,refreshScopedIdentity,importScopedState,exportCurrentState} from './offline-store.ts';
export const pantryClient=getScopedClient;
export const selectPantry=chooseScopedGuest;
export const syncPantry=syncScoped;
export const refreshPantryIdentity=refreshScopedIdentity;
export const importPantry=importScopedState;
export const exportPantryState=exportCurrentState;
