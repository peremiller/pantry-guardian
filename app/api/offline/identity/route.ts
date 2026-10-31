import {accountOwner} from '@/lib/pantry-owner';
export async function GET(){return Response.json({owner:await accountOwner()||'guest'},{headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});}
