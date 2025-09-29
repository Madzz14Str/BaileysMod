import type { SignalAuthState } from '../Types';
import type { SignalRepositoryWithLIDStore } from '../Types/Signal';
import type { ILogger } from '../Utils/logger';
export declare function makeLibSignalRepository(auth: SignalAuthState, logger: ILogger): SignalRepositoryWithLIDStore;
