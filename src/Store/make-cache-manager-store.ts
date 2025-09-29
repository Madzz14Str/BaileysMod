import { cacheManager } from 'cache-manager';
import { proto } from '../../WAProto';
import { AuthenticationCreds } from '../Types';
import { BufferJSON, initAuthCreds } from '../Utils';
import logger from '../Utils/logger';

const makeCacheManagerAuthState = async (
  store: any, 
  sessionKey: string
): Promise<{
  clearState: () => Promise<void>;
  saveCreds: () => Promise<void>;
  state: {
    creds: AuthenticationCreds;
    keys: {
      get: (type: string, ids: string[]) => Promise<{ [id: string]: any }>;
      set: (data: any) => Promise<void>;
    };
  };
}> => {
  const defaultKey = (file: string) => `${sessionKey}:${file}`;

  const databaseConn = await cacheManager.caching(store);

  const writeData = async (file: string, data: any): Promise<void> => {
    let ttl: number | undefined = undefined;
    
    if (file === 'creds') {
      ttl = 63115200; // 2 years in seconds
    }
    
    await databaseConn.set(
      defaultKey(file), 
      JSON.stringify(data, BufferJSON.replacer), 
      ttl
    );
  };

  const readData = async (file: string): Promise<any> => {
    try {
      const data = await databaseConn.get(defaultKey(file));
      if (data) {
        return JSON.parse(data, BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      logger.error(error);
      return null;
    }
  };

  const removeData = async (file: string): Promise<void> => {
    try {
      return await databaseConn.del(defaultKey(file));
    } catch {
      logger.error(`Error removing ${file} from session ${sessionKey}`);
    }
  };

  const clearState = async (): Promise<void> => {
    try {
      const result = await databaseConn.store.keys(`${sessionKey}*`);
      await Promise.all(
        result.map(async (key: string) => await databaseConn.del(key))
      );
    } catch (err) {
      // Silent error on clear
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    clearState,
    saveCreds: () => writeData('creds', creds),
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]): Promise<{ [id: string]: any }> => {
          const data: { [id: string]: any } = {};
          
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              
              if (type === 'app-state-sync-key' && value) {
                value = WAProto.proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              
              data[id] = value;
            })
          );
          
          return data;
        },
        set: async (data: any): Promise<void> => {
          const tasks: Promise<void>[] = [];
          
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              
              tasks.push(
                value ? writeData(key, value) : removeData(key)
              );
            }
          }
          
          await Promise.all(tasks);
        },
      }
    }
  };
};

export default makeCacheManagerAuthState;