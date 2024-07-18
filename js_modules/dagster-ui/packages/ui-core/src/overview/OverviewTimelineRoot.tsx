import {Box, Button, ButtonGroup, ErrorBoundary, TextInput} from '@dagster-io/ui-components';
import * as React from 'react';
import {useDeferredValue, useMemo} from 'react';

import {groupRunsByAutomation} from './groupRunsByAutomation';
import {useFeatureFlags} from '../app/Flags';
import {RefreshState} from '../app/QueryRefresh';
import {useTrackPageView} from '../app/analytics';
import {useDocumentTitle} from '../hooks/useDocumentTitle';
import {useQueryPersistedState} from '../hooks/useQueryPersistedState';
import {RepoFilterButton} from '../instance/RepoFilterButton';
import {usePageLoadTrace} from '../performance';
import {RunTimeline} from '../runs/RunTimeline';
import {HourWindow, useHourWindow} from '../runs/useHourWindow';
import {useRunsForTimeline} from '../runs/useRunsForTimeline';
import {WorkspaceContext} from '../workspace/WorkspaceContext';
import {buildRepoAddress} from '../workspace/buildRepoAddress';
import {repoAddressAsHumanString} from '../workspace/repoAddressAsString';

const LOOKAHEAD_HOURS = 1;
const ONE_HOUR = 60 * 60 * 1000;
const POLL_INTERVAL = 30 * 1000;

const hourWindowToOffset = (hourWindow: HourWindow) => {
  switch (hourWindow) {
    case '1':
      return ONE_HOUR;
    case '6':
      return 6 * ONE_HOUR;
    case '12':
      return 12 * ONE_HOUR;
    case '24':
      return 24 * ONE_HOUR;
  }
};

type Props = {
  Header: React.ComponentType<{refreshState: RefreshState}>;
  TabButton: React.ComponentType<{selected: 'timeline' | 'assets'}>;
};

export function useTimelineRange({
  maxNowMs,
  hourWindowStorageKey,
  hourWindowDefault = '12',
  lookaheadHours = LOOKAHEAD_HOURS,
}: {
  maxNowMs?: number;
  hourWindowStorageKey?: string;
  hourWindowDefault?: HourWindow;
  lookaheadHours?: number;
}) {
  const [hourWindow, setHourWindow] = useHourWindow(hourWindowDefault, hourWindowStorageKey);
  const [now, setNow] = React.useState(() => maxNowMs || Date.now());
  const [offsetMsec, setOffsetMsec] = React.useState(() => 0);

  const rangeMs: [number, number] = React.useMemo(
    () => [
      now - Number(hourWindow) * ONE_HOUR + offsetMsec,
      now + lookaheadHours * ONE_HOUR + offsetMsec,
    ],
    [hourWindow, now, lookaheadHours, offsetMsec],
  );

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(maxNowMs ? Math.min(maxNowMs, Date.now()) : Date.now());
    }, POLL_INTERVAL);

    return () => {
      clearInterval(timer);
    };
  }, [hourWindow, maxNowMs]);

  const onPageEarlier = React.useCallback(() => {
    setOffsetMsec((current) => current - hourWindowToOffset(hourWindow));
  }, [hourWindow]);

  const onPageLater = React.useCallback(() => {
    setOffsetMsec((current) => current + hourWindowToOffset(hourWindow));
  }, [hourWindow]);

  const onPageNow = React.useCallback(() => {
    setOffsetMsec(0);
  }, []);

  return {rangeMs, hourWindow, setHourWindow, onPageEarlier, onPageLater, onPageNow};
}

export const OverviewTimelineRoot = ({Header, TabButton}: Props) => {
  useTrackPageView();
  useDocumentTitle('Overview | Timeline');
  const {flagSettingsPage} = useFeatureFlags();
  const trace = usePageLoadTrace('OverviewTimelineRoot');

  const {allRepos, visibleRepos} = React.useContext(WorkspaceContext);
  const {rangeMs, hourWindow, setHourWindow, onPageEarlier, onPageLater, onPageNow} =
    useTimelineRange({});

  const [searchValue, setSearchValue] = useQueryPersistedState<string>({
    queryKey: 'search',
    defaults: {search: ''},
  });

  const runsForTimelineRet = useRunsForTimeline({rangeMs});

  // Use deferred value to allow paginating quickly with the UI feeling more responsive.
  const {jobs, loading, refreshState} = useDeferredValue(runsForTimelineRet);

  // If we're in the IA flag, re-bucket the grouped rows by their automation.
  // todo dish: Ship the change, remove the flag.
  const rows = useMemo(() => {
    return flagSettingsPage ? groupRunsByAutomation(jobs) : jobs;
  }, [flagSettingsPage, jobs]);

  React.useEffect(() => {
    if (!loading) {
      trace.endTrace();
    }
  }, [loading, trace]);

  const visibleRepoKeys = useMemo(() => {
    return new Set(
      visibleRepos.map((option) => {
        const repoAddress = buildRepoAddress(
          option.repository.name,
          option.repositoryLocation.name,
        );
        return repoAddressAsHumanString(repoAddress);
      }),
    );
  }, [visibleRepos]);

  const visibleObjectKeys = React.useMemo(() => {
    const searchLower = searchValue.toLocaleLowerCase().trim();
    const keys = rows
      .filter(({repoAddress}) => visibleRepoKeys.has(repoAddressAsHumanString(repoAddress)))
      .map(({key}) => key)
      .filter((key) => key.toLocaleLowerCase().includes(searchLower));
    return new Set(keys);
  }, [searchValue, rows, visibleRepoKeys]);

  const visibleRows = React.useMemo(
    () => rows.filter(({key}) => visibleObjectKeys.has(key)),
    [rows, visibleObjectKeys],
  );

  return (
    <>
      <Header refreshState={refreshState} />
      <Box
        padding={{horizontal: 24, vertical: 16}}
        flex={{alignItems: 'center', justifyContent: 'space-between'}}
      >
        <Box flex={{direction: 'row', alignItems: 'center', gap: 12, grow: 0}}>
          {TabButton && <TabButton selected="timeline" />}
          {allRepos.length > 1 && <RepoFilterButton />}
          <TextInput
            icon="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Filter by name…"
            style={{width: '200px'}}
          />
        </Box>
        <Box flex={{direction: 'row', gap: 16, alignItems: 'center'}}>
          <ButtonGroup<HourWindow>
            activeItems={new Set([hourWindow])}
            buttons={[
              {id: '1', label: '1hr'},
              {id: '6', label: '6hr'},
              {id: '12', label: '12hr'},
              {id: '24', label: '24hr'},
            ]}
            onClick={(hrWindow: HourWindow) => setHourWindow(hrWindow)}
          />
          <Box flex={{direction: 'row', gap: 4, alignItems: 'center'}}>
            <Button onClick={onPageEarlier}>&larr;</Button>
            <Button onClick={onPageNow}>Now</Button>
            <Button onClick={onPageLater}>&rarr;</Button>
          </Box>
        </Box>
      </Box>
      <ErrorBoundary region="timeline">
        <RunTimeline loading={loading} rangeMs={rangeMs} rows={visibleRows} />
      </ErrorBoundary>
    </>
  );
};
