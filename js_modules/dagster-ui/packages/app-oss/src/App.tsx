import {App} from '@dagster-io/ui-core/app/App';
import {createAppCache} from '@dagster-io/ui-core/app/AppCache';
import {errorLink, setupErrorToasts} from '@dagster-io/ui-core/app/AppError';
import {AppProvider} from '@dagster-io/ui-core/app/AppProvider';
import {AppTopNav} from '@dagster-io/ui-core/app/AppTopNav/AppTopNav';
import {ContentRoot} from '@dagster-io/ui-core/app/ContentRoot';
import {HelpMenu} from '@dagster-io/ui-core/app/HelpMenu';
import {UserSettingsButton} from '@dagster-io/ui-core/app/UserSettingsButton';
import {logLink, timeStartLink} from '@dagster-io/ui-core/app/apolloLinks';
import {DeploymentStatusType} from '@dagster-io/ui-core/instance/DeploymentStatusProvider';
import {LiveDataPollRateContext} from '@dagster-io/ui-core/live-data-provider/LiveDataProvider';

import {InjectedComponents} from './InjectedComponents';
import {CommunityNux} from './NUX/CommunityNux';
import {extractInitializationData} from './extractInitializationData';
import {telemetryLink} from './telemetryLink';

const {pathPrefix, telemetryEnabled, liveDataPollRate} = extractInitializationData();

const apolloLinks = [logLink, errorLink, timeStartLink];

if (telemetryEnabled) {
  apolloLinks.unshift(telemetryLink(pathPrefix));
}
if (process.env.NODE_ENV === 'development') {
  setupErrorToasts();
}

const config = {
  apolloLinks,
  basePath: pathPrefix,
  origin: process.env.NEXT_PUBLIC_BACKEND_ORIGIN || document.location.origin,
  telemetryEnabled,
  statusPolling: new Set<DeploymentStatusType>(['code-locations', 'daemons']),
};

const appCache = createAppCache();

// eslint-disable-next-line import/no-default-export
export default function AppPage() {
  return (
    <InjectedComponents>
      <LiveDataPollRateContext.Provider value={liveDataPollRate ?? 2000}>
        <AppProvider appCache={appCache} config={config}>
          <AppTopNav searchPlaceholder="Search…" allowGlobalReload>
            <HelpMenu showContactSales={false} />
            <UserSettingsButton />
          </AppTopNav>
          <App>
            <ContentRoot />
            <CommunityNux />
          </App>
        </AppProvider>
      </LiveDataPollRateContext.Provider>
    </InjectedComponents>
  );
}
