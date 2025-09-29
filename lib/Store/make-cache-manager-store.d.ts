import { AuthenticationCreds } from '../Types';
declare const makeCacheManagerAuthState: (store: any, sessionKey: string) => Promise<{
    clearState: () => Promise<void>;
    saveCreds: () => Promise<void>;
    state: {
        creds: AuthenticationCreds;
        keys: {
            get: (type: string, ids: string[]) => Promise<{
                [id: string]: any;
            }>;
            set: (data: any) => Promise<void>;
        };
    };
}>;
export default makeCacheManagerAuthState;
