import * as SecureStore from 'expo-secure-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'blueledger.session';
export type User = { id: string; email: string; name: string; role: 'user' | 'admin' };
export type Tx = { id: string; description: string; category: string; amount: number; type: 'income'|'expense'; date: string; account: string; note?: string };
export type Budget = { id: string; category: string; limit: number; month_start: string };
export type Goal = { id: string; name: string; category: string; price: number; saved: number; priority: string };
export type Account = { id: string; name: string; type: string; balance: number; currency: string };
export type FinanceData = { transactions: Tx[]; budgets: Budget[]; products: Goal[]; accounts: Account[] };

export async function getToken() { return SecureStore.getItemAsync(TOKEN_KEY); }
export async function clearToken() { await SecureStore.deleteItemAsync(TOKEN_KEY); }
export async function api<T=any>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  if (!API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to your deployed Vercel project URL.');
  const headers: Record<string,string> = {'Content-Type':'application/json', ...(options.headers as Record<string,string> || {})};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (path === '/api/auth' && options.method === 'POST') headers['X-BlueLedger-Client'] = 'mobile';
  const response = await fetch(`${API_URL}${path}`, {...options, headers});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.error || 'Could not connect to BlueLedger.');
  return body as T;
}
export async function signIn(action:'login'|'register', fields:{email:string;password:string;name?:string}) {
  const result = await api<{user:User;sessionToken:string}>('/api/auth',{method:'POST',body:JSON.stringify({action,...fields})});
  await SecureStore.setItemAsync(TOKEN_KEY,result.sessionToken,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  return result.user;
}
