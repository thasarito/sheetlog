import { IS_DEV_MODE } from '../../lib/mock';
import { AppProvider } from './AppProvider';
import { MockAppProvider } from './mock/MockAppProvider';

const Provider = IS_DEV_MODE ? MockAppProvider : AppProvider;

export { AppProvider };
export { Provider as default };
export { useAuth } from './auth';
export { useConnectivity } from './ConnectivityContext';
export { useTransactions } from './TransactionsContext';
