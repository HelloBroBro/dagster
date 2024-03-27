import {AppTopNavRightOfLogo} from '@dagster-io/ui-core/app/AppTopNav/AppTopNavRightOfLogo.oss';
import {InjectedComponentContext} from '@dagster-io/ui-core/app/InjectedComponentContext';
import {UserPreferences} from '@dagster-io/ui-core/app/UserSettingsDialog/UserPreferences.oss';
import AssetsOverviewRoot from '@dagster-io/ui-core/assets/AssetsOverviewRoot';

export const InjectedComponents = ({children}: {children: React.ReactNode}) => {
  return (
    <InjectedComponentContext.Provider
      value={{
        AppTopNavRightOfLogo,
        UserPreferences,
        AssetsOverview: AssetsOverviewRoot,
      }}
    >
      {children}
    </InjectedComponentContext.Provider>
  );
};
