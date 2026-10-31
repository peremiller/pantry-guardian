import {auth} from '@/auth';
import {createHash} from 'node:crypto';
export async function accountOwner(){const session=await auth();const id=(session?.user as {id?:string}|undefined)?.id;return id?'account-'+createHash('sha256').update('google:'+id).digest('hex'):null;}
