import { IS_DEV_MODE } from "../../lib/mock";
import { AppProviders } from "./AppProviders";
import { MockAppProviders } from "./mock/MockAppProviders";

const Provider = IS_DEV_MODE ? MockAppProviders : AppProviders;

export { AppProviders };
export { Provider as default };
export { useConnectivity } from "./connectivity/ConnectivityContext";
export { useSession, useSessionWithStatus } from "./session/session.hooks";
export { useWorkspace } from "./workspace/workspace.hooks";
export { useTransactions } from "./transactions/TransactionsContext";

